"""
Test-only synthetic RCA training data generator + model trainer.

This script must never create a production model. Set ML_ENV=test explicitly
when generating an artifact for local or automated tests.

SPARSE PATTERN DESIGN — matches the real event-pipeline fragment profiles.

Each pattern only populates features that the real event handlers actually set.
Features not emitted by any handler default to 0.0, which is what the real
pipeline produces. This ensures approximate_predict() can correctly assign
sparse test-time fragments to the right cluster.

Settlement fragments (from HandleSettlementCreated):
  parse_confidence, mapping_confidence, carrier_richness_score,
  missing_client_ref, missing_provider_ref, missing_bank_ref,
  reversal_flag, return_flag, duplicate_row_detected,
  value_date_mismatch_flag, cross_period_flag, settlement_delay_days
  — everything else = 0.0

Attachment fragments (from HandleAttachmentDecision):
  decision_type, ambiguity_score, confidence_score, candidate_count
  — everything else = 0.0 (attachment_readiness NOT set by HandleAttachmentDecision)

Pattern breakdown (250 rows each, 1000 total):
  0 — Settlement, missing refs / low quality   → MCR, MPR, MBR, WBR
  1 — Settlement, full refs / high quality     → USL, OSL, VDM, CPS, FDV
  2 — Attachment, ambiguous / unresolved       → UIN, MEP, HAB
  3 — Attachment, exact / duplicate            → DRF, HDR, DUC, IPM
"""
from __future__ import annotations

import csv
import logging
import os
import random
import sys
import tempfile

sys.path.insert(0, "/app")

from app.models.rca_hdbscan import (
    BIN_COLS,
    CAT_COLS,
    NUM_COLS,
    TEXT_COL,
    RCABundle,
    build_pipeline,
    _derive_cluster_label_map,
)
import hdbscan as hdbscan_lib
import joblib
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROWS_PER_PATTERN = 250
RANDOM_SEED = 42

_FIELDNAMES = (
    ["intent_id", TEXT_COL, "intended_amount_minor"]
    + CAT_COLS
    + NUM_COLS
    + BIN_COLS
    + ["true_cluster_code"]
)


def _row(idx: int, pattern: int) -> dict:
    rng = random.Random(RANDOM_SEED + idx)

    # All features default to 0 / "UNKNOWN" — sparse by design.
    # Only override the features actually set by each event handler.
    base_num = {col: 0.0 for col in NUM_COLS}
    base_bin = {col: 0 for col in BIN_COLS}
    base_cat = {
        "source_strength_class": "UNKNOWN",
        "observation_kind": "UNKNOWN",
        "decision_type": "UNKNOWN",
        "governance_state": "UNKNOWN",
    }

    if pattern == 0:
        # ── Settlement, missing refs / low quality ─────────────────────────
        # HandleSettlementCreated sets: parse_confidence, mapping_confidence,
        # carrier_richness_score, missing_*_ref flags, observation_kind, source_strength.
        # IntendedAmountMinor is always 0 (not from settlement events).
        # All other NUM_COLS (ambiguity, confidence, proof, matchability, pack, etc.) = 0.
        base_num.update({
            "parse_confidence":       rng.uniform(0.08, 0.40),
            "mapping_confidence":     rng.uniform(0.08, 0.40),
            "carrier_richness_score": rng.uniform(0.05, 0.30),
        })
        base_bin.update({
            "missing_client_ref":   1,
            "missing_bank_ref":     1,
            "missing_provider_ref": rng.randint(0, 1),
        })
        base_cat.update({
            "source_strength_class": "LOW",
            "observation_kind":      "SETTLEMENT",
        })
        reason = rng.choice([
            "missing client reference bank ref absent",
            "no UTR RRN weak carrier data",
            "client payout ref missing provider absent",
            "settlement without bank reference traceability weak",
        ])
        cluster = rng.choice(["MCR", "MPR", "MBR", "WBR"])

    elif pattern == 1:
        # ── Settlement, full refs / high quality ───────────────────────────
        # Same handler as Pattern 0, but with HIGH confidence/richness and
        # no missing refs.  Some rows have value_date or cross-period flags
        # from variance events that share the same fragment key in production.
        # NOTE: amount_variance_pct is ALWAYS 0 in real settlement fragments
        #       because IntendedAmountMinor is never populated from settlement
        #       events (see projection_service.go line ~857).
        base_num.update({
            "parse_confidence":       rng.uniform(0.70, 0.97),
            "mapping_confidence":     rng.uniform(0.70, 0.97),
            "carrier_richness_score": rng.uniform(0.55, 0.95),
        })
        base_bin.update({
            "value_date_mismatch_flag": rng.randint(0, 1),
            "cross_period_flag":        rng.randint(0, 1),
        })
        base_cat.update({
            "source_strength_class": rng.choice(["HIGH", "STANDARD"]),
            "observation_kind":      "SETTLEMENT",
        })
        reason = rng.choice([
            "under settlement TDS deduction high confidence",
            "over settlement fee reversal full refs",
            "value date mismatch cross period settlement",
            "high confidence settlement with variance signals",
            "partial settlement PSP deduction UTR present",
        ])
        cluster = rng.choice(["USL", "OSL", "VDM", "CPS", "FDV"])

    elif pattern == 2:
        # ── Attachment, ambiguous / unresolved ────────────────────────────
        # HandleAttachmentDecision sets: decision_type, ambiguity_score,
        # confidence_score, candidate_count.
        # attachment_readiness_score is NOT set by HandleAttachmentDecision
        # (it's absent from the AttachmentSignals struct in the handler).
        # parse_confidence, mapping_confidence, carrier_richness = 0 (not set).
        decision = rng.choice(["MATCH_AMBIGUOUS", "MATCH_UNRESOLVED"])
        base_num.update({
            "ambiguity_score":  rng.uniform(0.60, 0.90),
            "confidence_score": rng.uniform(0.03, 0.50),
            "candidate_count":  float(rng.randint(3, 14)),
        })
        base_cat.update({
            "decision_type": decision,
        })
        reason = rng.choice([
            "match ambiguous multiple candidates resolution uncertain",
            "unresolved no clear intent match high ambiguity",
            "ambiguous attachment competing payout intents",
            "multiple candidates cannot resolve attachment",
        ])
        cluster = rng.choice(["UIN", "MEP", "HAB"])

    else:  # pattern == 3
        # ── Attachment, exact / duplicate ─────────────────────────────────
        # Same handler as Pattern 2 but MATCH_EXACT / MATCH_DUPLICATE:
        # low ambiguity, high confidence, small candidate set.
        decision = rng.choice(["MATCH_EXACT", "MATCH_DUPLICATE"])
        base_num.update({
            "ambiguity_score":  rng.uniform(0.01, 0.15),
            "confidence_score": rng.uniform(0.82, 0.99),
            "candidate_count":  float(rng.randint(1, 5)),
        })
        base_cat.update({
            "decision_type": decision,
        })
        reason = rng.choice([
            "exact match high confidence single candidate",
            "duplicate payout detected match duplicate",
            "strong exact attachment confirmed by UTR",
            "duplicate risk flag high confidence decision",
        ])
        cluster = rng.choice(["DRF", "HDR", "DUC", "IPM"])

    row = {
        "intent_id":             f"intent_{idx:06d}",
        TEXT_COL:                reason,
        "intended_amount_minor": rng.randint(10000, 5000000),
        "true_cluster_code":     cluster,
    }
    row.update(base_cat)
    row.update(base_num)
    row.update(base_bin)
    return row


def main() -> None:
    if os.environ.get("ML_ENV", "").lower() != "test":
        log.error(
            "Synthetic RCA training is test-only; refusing to run unless ML_ENV=test."
        )
        raise SystemExit(1)

    model_path = os.environ.get("RCA_MODEL_PATH", "/data/rca_model.pkl")
    total_rows = ROWS_PER_PATTERN * 4

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, newline=""
    ) as f:
        csv_path = f.name
        writer = csv.DictWriter(f, fieldnames=_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for i in range(total_rows):
            pattern = i % 4
            writer.writerow(_row(i, pattern))

    log.info("Generated %d synthetic rows → %s", total_rows, csv_path)

    df = pd.read_csv(csv_path)
    true_labels = df["true_cluster_code"].tolist()

    pipeline = build_pipeline()
    X = pipeline.fit_transform(df)
    if hasattr(X, "toarray"):
        X_dense = X.toarray()
    else:
        X_dense = np.asarray(X, dtype=np.float32)

    log.info("Feature matrix shape: %s", X_dense.shape)

    clusterer = hdbscan_lib.HDBSCAN(
        min_cluster_size=5,
        min_samples=3,
        prediction_data=True,
        metric="euclidean",
    )
    clusterer.fit(X_dense)

    n_clusters = len(set(clusterer.labels_)) - (1 if -1 in clusterer.labels_ else 0)
    noise_pct = 100.0 * np.sum(clusterer.labels_ == -1) / len(clusterer.labels_)
    log.info("HDBSCAN found %d clusters, noise=%.1f%%", n_clusters, noise_pct)

    cluster_label_map = _derive_cluster_label_map(clusterer.labels_, true_labels)
    log.info("cluster_label_map: %s", cluster_label_map)

    bundle = RCABundle(
        pipeline=pipeline,
        hdbscan_model=clusterer,
        cluster_label_map=cluster_label_map,
    )

    tmp_path = model_path + ".tmp"
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump(bundle, tmp_path)
    os.replace(tmp_path, model_path)

    os.unlink(csv_path)
    log.info("Model saved → %s  clusters=%d", model_path, n_clusters)


if __name__ == "__main__":
    main()
