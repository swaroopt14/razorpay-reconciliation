"""Central, signed model registry used by every ML-service replica."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app import config
from app.exceptions import TrainingGovernanceError
from app.training_governance import (
    SCOPE_GLOBAL,
    TrainingGovernanceRepo,
    normalize_scope,
    validate_training_lineage,
)
from psycopg.types.json import Jsonb

MODEL_LR = "logistic_regression"
MODEL_RCA = "rca_hdbscan"
MODEL_LEAKAGE = "leakage_prediction"


class ModelRegistryError(RuntimeError):
    """The registry is unavailable or contains invalid state."""


class BundleVerificationError(ModelRegistryError):
    """A bundle digest, approval, or signature is invalid."""


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ml_model_bundles (
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    artifact BYTEA NOT NULL,
    digest CHAR(64) NOT NULL,
    training_dataset_lineage JSONB NOT NULL,
    metrics JSONB NOT NULL,
    approver TEXT NOT NULL,
    created_at TEXT NOT NULL,
    signature TEXT NOT NULL,
    approved BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (model_name, version)
);
CREATE TABLE IF NOT EXISTS ml_model_candidates (
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    artifact BYTEA NOT NULL,
    digest CHAR(64) NOT NULL,
    training_dataset_lineage JSONB NOT NULL,
    metrics JSONB NOT NULL,
    source_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (model_name, version),
    UNIQUE (model_name, source_event_id)
);
CREATE TABLE IF NOT EXISTS ml_model_promotions (
    model_name TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    promoted_by TEXT NOT NULL,
    promoted_at TEXT NOT NULL,
    FOREIGN KEY (model_name, version)
        REFERENCES ml_model_bundles(model_name, version)
);
CREATE TABLE IF NOT EXISTS ml_model_training_triggers (
    event_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    feature_family TEXT NOT NULL,
    training_scope TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_snapshot_digest CHAR(64) NOT NULL,
    payload_digest CHAR(64) NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_bytes(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _digest(artifact: bytes) -> str:
    return hashlib.sha256(artifact).hexdigest()


def load_public_key(encoded: str) -> Ed25519PublicKey:
    raw = encoded.strip().replace("\\n", "\n").encode()
    if not raw:
        raise ModelRegistryError("MODEL_REGISTRY_PUBLIC_KEY is required")
    try:
        key = (
            serialization.load_pem_public_key(raw)
            if raw.startswith(b"-----BEGIN")
            else Ed25519PublicKey.from_public_bytes(base64.b64decode(raw))
        )
    except Exception as exc:
        raise ModelRegistryError("invalid Ed25519 public key") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise ModelRegistryError("model registry key is not Ed25519")
    return key


def load_private_key(encoded: str) -> Ed25519PrivateKey:
    raw = encoded.strip().replace("\\n", "\n").encode()
    if not raw:
        raise ModelRegistryError("MODEL_REGISTRY_PRIVATE_KEY is required")
    try:
        key = (
            serialization.load_pem_private_key(raw, password=None)
            if raw.startswith(b"-----BEGIN")
            else Ed25519PrivateKey.from_private_bytes(base64.b64decode(raw))
        )
    except Exception as exc:
        raise ModelRegistryError("invalid Ed25519 private key") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise ModelRegistryError("model registry key is not Ed25519")
    return key


@dataclass(frozen=True)
class ModelBundle:
    model_name: str
    version: str
    artifact: bytes
    digest: str
    training_dataset_lineage: dict[str, Any]
    metrics: dict[str, Any]
    approver: str
    created_at: str
    signature: str

    def signing_payload(self) -> bytes:
        return _json_bytes({
            "approver": self.approver,
            "created_at": self.created_at,
            "digest": self.digest,
            "metrics": self.metrics,
            "model_name": self.model_name,
            "training_dataset_lineage": self.training_dataset_lineage,
            "version": self.version,
        })

    def verify(self, public_key: Ed25519PublicKey) -> None:
        if not self.approver.strip():
            raise BundleVerificationError("approved bundle has no approver")
        if not hmac.compare_digest(_digest(self.artifact), self.digest):
            raise BundleVerificationError(
                f"artifact digest mismatch model={self.model_name} version={self.version}"
            )
        try:
            public_key.verify(base64.b64decode(self.signature), self.signing_payload())
        except Exception as exc:
            raise BundleVerificationError(
                f"invalid signature model={self.model_name} version={self.version}"
            ) from exc
        try:
            validate_training_lineage(self.model_name, self.training_dataset_lineage)
        except TrainingGovernanceError as exc:
            raise BundleVerificationError(str(exc)) from exc

    @classmethod
    def sign(
        cls,
        *,
        model_name: str,
        version: str,
        artifact: bytes,
        training_dataset_lineage: dict[str, Any],
        metrics: dict[str, Any],
        approver: str,
        private_key: Ed25519PrivateKey,
        created_at: str | None = None,
    ) -> "ModelBundle":
        bundle = cls(
            model_name, version, artifact, _digest(artifact),
            training_dataset_lineage, metrics, approver,
            created_at or _utc_now(), "",
        )
        signature = base64.b64encode(
            private_key.sign(bundle.signing_payload())
        ).decode("ascii")
        return cls(**{**bundle.__dict__, "signature": signature})


@dataclass(frozen=True)
class Promotion:
    model_name: str
    version: str
    digest: str


class ModelRegistry:
    """Postgres-backed immutable bundles and atomic promotion pointers."""

    def __init__(self, dsn: str, public_key: str, initialize: bool = False) -> None:
        if not dsn:
            raise ModelRegistryError("INTELLIGENCE_DATABASE_URL is required")
        self._dsn = dsn
        self._public_key = load_public_key(public_key)
        self._governance = TrainingGovernanceRepo(dsn)
        if initialize:
            self.ensure_schema()

    def _connect(self):
        return psycopg.connect(self._dsn)

    def ensure_schema(self) -> None:
        try:
            with self._connect() as conn:
                for statement in SCHEMA_SQL.split(";"):
                    if statement.strip():
                        conn.execute(statement)
        except Exception as exc:
            raise ModelRegistryError("cannot initialize central model registry") from exc

    def _bundle(self, row: tuple[Any, ...]) -> ModelBundle:
        bundle = ModelBundle(
            str(row[0]), str(row[1]), bytes(row[2]), str(row[3]).strip(),
            dict(row[4] or {}), dict(row[5] or {}), str(row[6]),
            str(row[7]), str(row[8]),
        )
        bundle.verify(self._public_key)
        return bundle

    def list_promoted(self) -> dict[str, ModelBundle]:
        sql = """
            SELECT b.model_name, b.version, b.artifact, b.digest,
                   b.training_dataset_lineage, b.metrics, b.approver,
                   b.created_at, b.signature
              FROM ml_model_promotions p
              JOIN ml_model_bundles b
                ON b.model_name = p.model_name AND b.version = p.version
             WHERE b.approved = TRUE
        """
        try:
            with self._connect() as conn:
                rows = conn.execute(sql).fetchall()
            return {
                bundle.model_name: bundle
                for bundle in (self._bundle(row) for row in rows)
            }
        except ModelRegistryError:
            raise
        except Exception as exc:
            raise ModelRegistryError("cannot read promoted model bundles") from exc

    def sync_to_paths(self, paths: dict[str, str]) -> dict[str, Promotion]:
        bundles = self.list_promoted()
        promotions: dict[str, Promotion] = {}
        for model_name, path in paths.items():
            bundle = bundles.get(model_name)
            if bundle is None:
                continue
            _write_cache(path, bundle.artifact)
            promotions[model_name] = Promotion(
                model_name, bundle.version, bundle.digest
            )
        return promotions

    def verify_promotions(self) -> None:
        self.list_promoted()

    def record_training_trigger(
        self,
        event_id: str,
        model_name: str,
        feature_family: str,
        training_scope: str,
        tenant_id: str,
        payload: dict[str, Any],
    ) -> bool:
        policy = self._governance.authorize(
            tenant_id, feature_family, training_scope
        )
        try:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    INSERT INTO ml_model_training_triggers
                        (event_id, model_name, tenant_id, feature_family,
                         training_scope, policy_id, policy_snapshot_digest,
                         payload_digest, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (event_id) DO NOTHING RETURNING event_id
                    """,
                    (
                        event_id, model_name, tenant_id, feature_family.upper(),
                        normalize_scope(training_scope), policy.policy_id,
                        policy.snapshot_digest, _digest(_json_bytes(payload)),
                        _utc_now(),
                    ),
                ).fetchone()
            return row is not None
        except TrainingGovernanceError:
            raise
        except Exception as exc:
            raise ModelRegistryError("cannot persist model training trigger") from exc

    def stage_lr_candidate(
        self,
        *,
        event_id: str,
        tenant_id: str,
        features: list[float],
        label: float,
        learning_rate: float,
        default_state: dict[str, Any],
        base_version: str,
    ) -> str:
        """Apply one governed SGD step and store an unapproved candidate."""
        scope = normalize_scope(config.LR_TRAINING_SCOPE)
        policy = self._governance.authorize(tenant_id, "AMBIGUITY", scope)
        try:
            with self._connect() as conn:
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    (f"ml-model:{MODEL_LR}",),
                )
                existing = conn.execute(
                    "SELECT version FROM ml_model_candidates "
                    "WHERE model_name = %s AND source_event_id = %s",
                    (MODEL_LR, event_id),
                ).fetchone()
                if existing:
                    return str(existing[0])
                row = conn.execute(
                    "SELECT artifact, digest, training_dataset_lineage, metrics "
                    "FROM ml_model_candidates "
                    "WHERE model_name = %s ORDER BY created_at DESC LIMIT 1",
                    (MODEL_LR,),
                ).fetchone()
                if row is None:
                    row = conn.execute(
                        """
                        SELECT b.artifact, b.digest,
                               b.training_dataset_lineage, b.metrics
                          FROM ml_model_promotions p
                          JOIN ml_model_bundles b
                            ON b.model_name = p.model_name AND b.version = p.version
                         WHERE p.model_name = %s AND b.approved = TRUE
                        """,
                        (MODEL_LR,),
                    ).fetchone()
                state = dict(default_state)
                prior_digest = ""
                prior_lineage: dict[str, Any] = {}
                if row is not None:
                    artifact = bytes(row[0])
                    if _digest(artifact) != str(row[1]).strip():
                        raise BundleVerificationError("LR candidate/base digest mismatch")
                    state = json.loads(artifact.decode())
                    prior_digest = str(row[1]).strip()
                    prior_lineage = dict(row[2] or {})
                weights = [float(value) for value in state["weights"]]
                bias = float(state["bias"])
                z_value = bias + sum(w * f for w, f in zip(weights, features))
                prediction = 1.0 / (1.0 + math.exp(-max(-700.0, min(700.0, z_value))))
                error = prediction - label
                updated = {
                    "weights": [
                        weight - learning_rate * error * feature
                        for weight, feature in zip(weights, features)
                    ],
                    "bias": bias - learning_rate * error,
                    "num_features": len(weights),
                    "trained_on": int(state.get("trained_on", 0)) + 1,
                    "last_event_id": event_id,
                }
                sample_counts = {
                    str(key): int(value)
                    for key, value in dict(
                        prior_lineage.get("policy_sample_counts") or {}
                    ).items()
                }
                minimum_samples = {
                    str(key): int(value)
                    for key, value in dict(
                        prior_lineage.get("policy_minimum_samples") or {}
                    ).items()
                }
                policy_digests = dict(
                    prior_lineage.get("policy_snapshot_digests") or {}
                )
                sample_counts[policy.policy_id] = sample_counts.get(policy.policy_id, 0) + 1
                minimum_samples[policy.policy_id] = max(
                    config.ML_MIN_SAMPLES_PER_TENANT,
                    policy.minimum_sample_count,
                )
                policy_digests[policy.policy_id] = policy.snapshot_digest
                eligible_policy_ids = sorted(
                    policy_id
                    for policy_id, sample_count in sample_counts.items()
                    if sample_count >= minimum_samples[policy_id]
                )
                governance_ready = (
                    len(eligible_policy_ids) >= config.ML_GLOBAL_MIN_TENANTS
                    if scope == SCOPE_GLOBAL
                    else policy.policy_id in eligible_policy_ids
                )
                artifact = _json_bytes(updated)
                digest = _digest(artifact)
                version = f"{base_version}-candidate-{updated['trained_on']}-{digest[:12]}"
                conn.execute(
                    """
                    INSERT INTO ml_model_candidates
                        (model_name, version, artifact, digest,
                         training_dataset_lineage, metrics, source_event_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        MODEL_LR, version, artifact, digest,
                        Jsonb({
                            "source": "online_label_event",
                            "source_event_id": event_id,
                            "training_scope": scope,
                            "tenant_id": tenant_id if scope != SCOPE_GLOBAL else None,
                            "policy_sample_counts": sample_counts,
                            "policy_minimum_samples": minimum_samples,
                            "policy_snapshot_digests": policy_digests,
                            "included_policy_ids": eligible_policy_ids,
                            "included_tenant_count": len(eligible_policy_ids),
                            "training_row_count": sum(sample_counts.values()),
                            "policy_snapshot_digest": _digest(
                                _json_bytes(policy_digests)
                            ),
                            "feature_names": [
                                "ambiguity_rate",
                                "provider_ref_missing_rate",
                                "avg_confidence",
                                "normalized_value_at_risk",
                            ],
                            "label_names": ["ambiguity_label"],
                            "aggregate_features_only": policy.aggregate_features_only,
                            "raw_cross_tenant_identifiers": False,
                            "prior_digest": prior_digest,
                        }),
                        Jsonb({
                            "trained_on": updated["trained_on"],
                            "online_update": True,
                            "governance_ready": governance_ready,
                            "eligible_tenant_count": len(eligible_policy_ids),
                        }),
                        event_id, _utc_now(),
                    ),
                )
                return version
        except (ModelRegistryError, TrainingGovernanceError):
            raise
        except Exception as exc:
            raise ModelRegistryError("cannot stage LR model candidate") from exc

    def publish_approved(self, bundle: ModelBundle) -> None:
        bundle.verify(self._public_key)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ml_model_bundles
                    (model_name, version, artifact, digest, training_dataset_lineage,
                     metrics, approver, created_at, signature, approved)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (model_name, version) DO NOTHING
                """,
                (
                    bundle.model_name, bundle.version, bundle.artifact, bundle.digest,
                    Jsonb(bundle.training_dataset_lineage), Jsonb(bundle.metrics),
                    bundle.approver, bundle.created_at, bundle.signature,
                ),
            )
            row = conn.execute(
                "SELECT digest, signature FROM ml_model_bundles "
                "WHERE model_name = %s AND version = %s",
                (bundle.model_name, bundle.version),
            ).fetchone()
            if (
                row is None
                or str(row[0]).strip() != bundle.digest
                or str(row[1]) != bundle.signature
            ):
                raise ModelRegistryError("model version is immutable and already differs")

    def approve_candidate(
        self, model_name: str, version: str, approver: str,
        private_key: Ed25519PrivateKey,
    ) -> ModelBundle:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT artifact, training_dataset_lineage, metrics, created_at "
                "FROM ml_model_candidates WHERE model_name = %s AND version = %s",
                (model_name, version),
            ).fetchone()
        if row is None:
            raise ModelRegistryError("candidate not found")
        metrics = dict(row[2] or {})
        if model_name == MODEL_LR and not metrics.get("governance_ready", False):
            raise TrainingGovernanceError(
                "LR candidate has not met governed tenant/sample minimums"
            )
        bundle = ModelBundle.sign(
            model_name=model_name, version=version, artifact=bytes(row[0]),
            training_dataset_lineage=dict(row[1] or {}), metrics=metrics,
            approver=approver, private_key=private_key, created_at=str(row[3]),
        )
        self.publish_approved(bundle)
        return bundle

    def promote(self, model_name: str, version: str, promoted_by: str) -> None:
        """Atomically promote an approved version; an older version is a rollback."""
        try:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT model_name, version, artifact, digest,
                           training_dataset_lineage, metrics, approver,
                           created_at, signature
                      FROM ml_model_bundles
                     WHERE model_name = %s AND version = %s AND approved = TRUE
                     FOR UPDATE
                    """,
                    (model_name, version),
                ).fetchone()
                if row is None:
                    raise ModelRegistryError("only an approved bundle can be promoted")
                self._bundle(row)
                conn.execute(
                    """
                    INSERT INTO ml_model_promotions
                        (model_name, version, promoted_by, promoted_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (model_name) DO UPDATE
                       SET version = EXCLUDED.version,
                           promoted_by = EXCLUDED.promoted_by,
                           promoted_at = EXCLUDED.promoted_at
                    """,
                    (model_name, version, promoted_by, _utc_now()),
                )
        except ModelRegistryError:
            raise
        except Exception as exc:
            raise ModelRegistryError("cannot promote model bundle") from exc


def _write_cache(path: str, artifact: bytes) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and _digest(target.read_bytes()) == _digest(artifact):
        return
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            dir=target.parent, prefix=f".{target.name}.", suffix=".tmp", delete=False
        ) as handle:
            temp_path = handle.name
            handle.write(artifact)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, target)
    except Exception:
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
        raise
