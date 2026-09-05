"""
Bootstrap training script for the Zord RCA HDBSCAN model.

Run this ONCE before deploying to produce the initial .pkl bundle.
After deployment, the model retrains automatically in the background.

Usage:
    RCA_TRAINING_CSV=/path/to/labeled_data.csv \
    RCA_MODEL_PATH=/data/rca_model.pkl \
    python scripts/train_rca_model.py

CSV schema (one row per problematic payment, all columns required):
    intent_id                 — unique payment identifier
    reason_text               — free-text: failure code + variance type + decision type
    intended_amount_minor     — intended payment amount in minor currency units (int)
    source_strength_class     — e.g. PSP_REPORT, INTERNAL_EXPORT, STATEMENT
    observation_kind          — e.g. SETTLEMENT, STATEMENT_ENTRY
    decision_type             — e.g. MATCH_CONFIRMED, MATCH_UNRESOLVED, MATCH_CONFLICTED
    governance_state          — e.g. APPROVED, PENDING, NULL
    parse_confidence          — float [0,1]
    mapping_confidence        — float [0,1]
    carrier_richness_score    — float [0,1]
    attachment_readiness_score— float [0,1]
    ambiguity_score           — float [0,1]
    confidence_score          — float [0,1]
    amount_variance_pct       — float  (settled - intended) / intended
    settlement_delay_days     — int
    proof_readiness_score     — float [0,1]
    matchability_score        — float [0,1]
    pack_completeness_score   — float [0,1]
    candidate_count           — int
    missing_leaf_count        — int
    missing_client_ref        — 0 or 1
    missing_provider_ref      — 0 or 1
    missing_bank_ref          — 0 or 1
    reversal_flag             — 0 or 1
    return_flag               — 0 or 1
    duplicate_row_detected    — 0 or 1
    value_date_mismatch_flag  — 0 or 1
    cross_period_flag         — 0 or 1
    duplicate_risk_flag       — 0 or 1
    missing_evidence_pack     — 0 or 1
    governance_leaf_missing   — 0 or 1
    idempotency_key_missing   — 0 or 1
    weak_batch_ref_flag       — 0 or 1
    true_cluster_code         — label: one of the 32 RCA cluster codes (e.g. MCR, USL)

Minimum recommended rows: 200 (at least 5 rows per cluster you want represented).
More data = better cluster separation. 500+ rows produces stable cluster maps.

The script prints cluster purity metrics so you can verify the quality of the
cluster_label_map before deploying the bundle.

Files never committed to git:
    *.pkl
    *.csv containing payment data
    /data/
"""

from __future__ import annotations

import os
import sys
import logging
from collections import Counter, defaultdict

import joblib
import numpy as np
import pandas as pd
import hdbscan

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.rca_hdbscan import (
    RCABundle,
    ALL_CLUSTER_CODES,
    FEATURE_CONTRACT_VERSION,
    build_pipeline,
    _candidates_to_df,
    _derive_cluster_label_map,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("train_rca_model")


def main() -> None:
    csv_path = os.environ.get("RCA_TRAINING_CSV")
    model_path = os.environ.get("RCA_MODEL_PATH", "/data/rca_model.pkl")

    if not csv_path:
        logger.error(
            "RCA_TRAINING_CSV env var not set.\n"
            "Usage: RCA_TRAINING_CSV=/path/to/data.csv python scripts/train_rca_model.py"
        )
        sys.exit(1)

    if not os.path.exists(csv_path):
        logger.error("CSV not found: %s", csv_path)
        sys.exit(1)

    logger.info("Loading training data from %s", csv_path)
    df_raw = pd.read_csv(csv_path)

    if "true_cluster_code" not in df_raw.columns:
        logger.error("CSV must have a 'true_cluster_code' column with RCA cluster labels.")
        sys.exit(1)

    true_labels: list[str] = df_raw["true_cluster_code"].fillna("UNKNOWN").tolist()
    n_rows = len(df_raw)
    logger.info("Loaded %d rows", n_rows)

    if n_rows < 10:
        logger.error("Too few rows (%d). Need at least 10 to train.", n_rows)
        sys.exit(1)

    # Validate labels
    unknown_codes = set(true_labels) - set(ALL_CLUSTER_CODES) - {"UNKNOWN"}
    if unknown_codes:
        logger.warning(
            "Unknown cluster codes in CSV (will be treated as noise): %s",
            sorted(unknown_codes),
        )

    label_dist = Counter(true_labels)
    logger.info("Label distribution:")
    for code, count in sorted(label_dist.items(), key=lambda x: -x[1]):
        logger.info("  %-8s %d rows", code, count)

    # Drop true_cluster_code before feature building
    candidates = df_raw.drop(columns=["true_cluster_code"]).to_dict(orient="records")

    logger.info("Building feature matrix...")
    feat_df = _candidates_to_df(candidates)
    pipeline = build_pipeline()
    X = pipeline.fit_transform(feat_df)
    if hasattr(X, "toarray"):
        X_dense = X.toarray()
    else:
        X_dense = np.asarray(X)

    logger.info("Feature matrix shape: %s", X_dense.shape)

    # HDBSCAN hyperparameters — tune min_cluster_size based on your data size
    min_cluster_size = max(5, n_rows // 40)
    logger.info(
        "Fitting HDBSCAN min_cluster_size=%d min_samples=3 ...", min_cluster_size
    )
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=3,
        prediction_data=True,
        metric="euclidean",
    )
    clusterer.fit(X_dense)

    n_clusters = len(set(clusterer.labels_)) - (1 if -1 in clusterer.labels_ else 0)
    noise_pct = 100.0 * np.sum(clusterer.labels_ == -1) / n_rows
    logger.info(
        "HDBSCAN fit: %d clusters found, %.1f%% noise points", n_clusters, noise_pct
    )

    if n_clusters == 0:
        logger.error(
            "No clusters found — all points are noise. "
            "Try reducing min_cluster_size or adding more training data."
        )
        sys.exit(1)

    # Derive cluster_label_map via majority vote
    cluster_label_map = _derive_cluster_label_map(clusterer.labels_, true_labels)
    logger.info("Cluster label map (%d entries):", len(cluster_label_map))
    for cluster_id, code in sorted(cluster_label_map.items()):
        logger.info("  cluster %3d → %s", cluster_id, code)

    # Purity metrics per HDBSCAN cluster
    logger.info("\nCluster purity report:")
    cluster_votes: dict[int, list[str]] = defaultdict(list)
    for hdb_id, true_code in zip(clusterer.labels_, true_labels):
        if hdb_id == -1:
            continue
        cluster_votes[int(hdb_id)].append(true_code)

    total_correct = 0
    total_assigned = 0
    for cluster_id, votes in sorted(cluster_votes.items()):
        majority_code = Counter(votes).most_common(1)[0][0]
        correct = votes.count(majority_code)
        purity = 100.0 * correct / len(votes)
        total_correct += correct
        total_assigned += len(votes)
        logger.info(
            "  cluster %3d → %-6s  purity=%.1f%%  size=%d",
            cluster_id, majority_code, purity, len(votes),
        )

    if total_assigned > 0:
        overall_purity = 100.0 * total_correct / total_assigned
        logger.info("Overall purity: %.1f%% (%d/%d assigned points)", overall_purity, total_correct, total_assigned)

    if overall_purity < 60.0:
        logger.warning(
            "Overall purity is below 60%%. Consider more labeled data or "
            "reviewing your true_cluster_code labels."
        )

    # Serialize bundle
    bundle = RCABundle(
        pipeline=pipeline,
        hdbscan_model=clusterer,
        cluster_label_map=cluster_label_map,
        feature_contract_version=FEATURE_CONTRACT_VERSION,
    )

    os.makedirs(os.path.dirname(os.path.abspath(model_path)), exist_ok=True)
    tmp_path = model_path + ".tmp"
    joblib.dump(bundle, tmp_path)
    os.replace(tmp_path, model_path)

    logger.info(
        "\nBundle saved to %s  (%.1f MB)",
        model_path,
        os.path.getsize(model_path) / 1_048_576,
    )
    logger.info("Deploy this file to RCA_MODEL_PATH on the ML service host.")
    logger.info("Never commit .pkl or .csv files to git.")


if __name__ == "__main__":
    main()
