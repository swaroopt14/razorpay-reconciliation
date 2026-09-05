"""Tenant consent and auditable training-scope enforcement."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

import psycopg
from psycopg.types.json import Jsonb

from app import config
from app.exceptions import TrainingGovernanceError
from app.model_contracts import canonical_sha256

SCOPE_GLOBAL = "GLOBAL"
SCOPE_TENANT = "TENANT"
VALID_SCOPES = {SCOPE_GLOBAL, SCOPE_TENANT}
GOVERNED_MODEL_NAMES = {
    "logistic_regression",
    "rca_hdbscan",
    "leakage_prediction",
}


def normalize_scope(value: str) -> str:
    scope = str(value or "").strip().upper()
    if scope not in VALID_SCOPES:
        raise TrainingGovernanceError(
            f"invalid training scope={value!r}; expected GLOBAL or TENANT"
        )

    return scope

def validate_training_lineage(model_name: str, lineage: dict[str, Any]) -> None:
    """Reject governed bundles that cannot prove their allowed training scope."""
    if model_name not in GOVERNED_MODEL_NAMES:
        return
    if not isinstance(lineage, dict):
        raise TrainingGovernanceError("training lineage must be an object")

    scope = normalize_scope(lineage.get("training_scope", ""))
    policy_ids = lineage.get("included_policy_ids")
    if not isinstance(policy_ids, list) or not policy_ids:
        raise TrainingGovernanceError("training lineage has no approved policy IDs")
    policy_digest = str(lineage.get("policy_snapshot_digest", ""))
    if len(policy_digest) != 64:
        raise TrainingGovernanceError("training lineage has no policy snapshot digest")
    if int(lineage.get("training_row_count", 0)) <= 0:
        raise TrainingGovernanceError("training lineage has no training rows")
    for field in ("feature_names", "label_names"):
        value = lineage.get(field)
        if not isinstance(value, list) or not value:
            raise TrainingGovernanceError(f"training lineage has no {field}")
    if lineage.get("raw_cross_tenant_identifiers") is not False:
        raise TrainingGovernanceError(
            "training lineage does not prove raw tenant identifiers were excluded"
        )

    tenant_id = str(lineage.get("tenant_id") or "").strip()
    if scope == SCOPE_GLOBAL:
        if tenant_id:
            raise TrainingGovernanceError("global training lineage contains tenant_id")
        if lineage.get("aggregate_features_only") is not True:
            raise TrainingGovernanceError(
                "global training lineage is not aggregate-feature-only"
            )
    elif not tenant_id:
        raise TrainingGovernanceError("tenant training lineage has no tenant_id")


@dataclass(frozen=True)
class TenantTrainingPolicy:
    policy_id: str
    tenant_id: str
    tenant_models_enabled: bool
    global_training_opt_in: bool
    allowed_feature_families: tuple[str, ...]
    aggregate_features_only: bool
    minimum_sample_count: int
    approved_by: str
    updated_at: str

    def snapshot(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "tenant_id": self.tenant_id,
            "tenant_models_enabled": self.tenant_models_enabled,
            "global_training_opt_in": self.global_training_opt_in,
            "allowed_feature_families": list(self.allowed_feature_families),
            "aggregate_features_only": self.aggregate_features_only,
            "minimum_sample_count": self.minimum_sample_count,
            "approved_by": self.approved_by,
            "updated_at": self.updated_at,
        }

    @property
    def snapshot_digest(self) -> str:
        return canonical_sha256(self.snapshot())


class TrainingGovernanceRepo:
    """Reads explicit policy and records privacy-safe training manifests."""

    def __init__(self, dsn: str | None = None) -> None:
        self._dsn = (dsn or config.INTELLIGENCE_DATABASE_URL).strip()

    def is_configured(self) -> bool:
        return bool(self._dsn)

    def _connect(self):
        if not self._dsn:
            raise TrainingGovernanceError(
                "INTELLIGENCE_DATABASE_URL is required for governed training"
            )
        return psycopg.connect(self._dsn)

    @staticmethod
    def policy_from_row(row: tuple[Any, ...]) -> TenantTrainingPolicy:
        return TenantTrainingPolicy(
            policy_id=str(row[0]),
            tenant_id=str(row[1]),
            tenant_models_enabled=bool(row[2]),
            global_training_opt_in=bool(row[3]),
            allowed_feature_families=tuple(
                str(item).upper() for item in (row[4] or [])
            ),
            aggregate_features_only=bool(row[5]),
            minimum_sample_count=int(row[6]),
            approved_by=str(row[7]),
            updated_at=str(row[8]),
        )

    def get_policy(self, tenant_id: str) -> TenantTrainingPolicy:
        if not tenant_id.strip():
            raise TrainingGovernanceError("training tenant_id is required")
        try:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT policy_id, tenant_id, tenant_models_enabled,
                           global_training_opt_in, allowed_feature_families,
                           aggregate_features_only, minimum_sample_count,
                           approved_by, updated_at
                      FROM ml_training_tenant_policies
                     WHERE tenant_id = %s
                    """,
                    (tenant_id,),
                ).fetchone()
        except TrainingGovernanceError:
            raise
        except Exception as exc:
            raise TrainingGovernanceError(
                "cannot read tenant training policy"
            ) from exc
        if row is None:
            raise TrainingGovernanceError(
                f"tenant={tenant_id} has no approved ML training policy"
            )
        return self.policy_from_row(row)

    def authorize(
        self,
        tenant_id: str,
        feature_family: str,
        training_scope: str,
    ) -> TenantTrainingPolicy:
        scope = normalize_scope(training_scope)
        family = feature_family.strip().upper()
        policy = self.get_policy(tenant_id)
        if family not in policy.allowed_feature_families:
            raise TrainingGovernanceError(
                f"tenant={tenant_id} has not approved family={family} for training"
            )
        if scope == SCOPE_GLOBAL:
            if not policy.global_training_opt_in:
                raise TrainingGovernanceError(
                    f"tenant={tenant_id} has not opted into global model training"
                )
            if not policy.aggregate_features_only:
                raise TrainingGovernanceError(
                    f"tenant={tenant_id} global training must be aggregate-only"
                )
        elif not policy.tenant_models_enabled:
            raise TrainingGovernanceError(
                f"tenant={tenant_id} has not enabled tenant-scoped model training"
            )
        return policy

    def upsert_policy(
        self,
        *,
        tenant_id: str,
        tenant_models_enabled: bool,
        global_training_opt_in: bool,
        allowed_feature_families: Iterable[str],
        aggregate_features_only: bool,
        minimum_sample_count: int,
        approved_by: str,
    ) -> TenantTrainingPolicy:
        families = sorted({
            str(item).strip().upper()
            for item in allowed_feature_families
            if str(item).strip()
        })
        if not tenant_id.strip() or not approved_by.strip() or not families:
            raise TrainingGovernanceError(
                "tenant_id, approved_by, and at least one feature family are required"
            )
        if global_training_opt_in and not aggregate_features_only:
            raise TrainingGovernanceError(
                "global training opt-in requires aggregate_features_only=true"
            )
        policy_id = "mlpol_" + uuid.uuid4().hex
        with self._connect() as conn:
            row = conn.execute(
                """
                INSERT INTO ml_training_tenant_policies
                    (policy_id, tenant_id, tenant_models_enabled,
                     global_training_opt_in, allowed_feature_families,
                     aggregate_features_only, minimum_sample_count,
                     approved_by, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (tenant_id) DO UPDATE SET
                    tenant_models_enabled = EXCLUDED.tenant_models_enabled,
                    global_training_opt_in = EXCLUDED.global_training_opt_in,
                    allowed_feature_families = EXCLUDED.allowed_feature_families,
                    aggregate_features_only = EXCLUDED.aggregate_features_only,
                    minimum_sample_count = EXCLUDED.minimum_sample_count,
                    approved_by = EXCLUDED.approved_by,
                    updated_at = now()
                RETURNING policy_id, tenant_id, tenant_models_enabled,
                          global_training_opt_in, allowed_feature_families,
                          aggregate_features_only, minimum_sample_count,
                          approved_by, updated_at
                """,
                (
                    policy_id,
                    tenant_id,
                    tenant_models_enabled,
                    global_training_opt_in,
                    families,
                    aggregate_features_only,
                    max(int(minimum_sample_count), 1),
                    approved_by,
                ),
            ).fetchone()
        if row is None:
            raise TrainingGovernanceError("failed to store tenant training policy")
        return self.policy_from_row(row)

    def record_manifest(
        self,
        *,
        model_name: str,
        feature_family: str,
        training_scope: str,
        tenant_id: str | None,
        policies: Iterable[TenantTrainingPolicy],
        training_row_count: int,
        feature_names: Iterable[str],
        label_names: Iterable[str],
        window_start: str,
        window_end: str,
    ) -> dict[str, Any]:
        scope = normalize_scope(training_scope)
        policy_list = sorted(policies, key=lambda item: item.policy_id)
        if not policy_list:
            raise TrainingGovernanceError(
                "training manifest requires at least one approved policy"
            )
        if scope == SCOPE_GLOBAL and tenant_id:
            raise TrainingGovernanceError(
                "global training manifests must not contain a raw tenant_id"
            )
        if scope == SCOPE_TENANT and not tenant_id:
            raise TrainingGovernanceError(
                "tenant training manifests require tenant_id"
            )
        minimum = max(
            [config.ML_MIN_SAMPLES_PER_TENANT]
            + [policy.minimum_sample_count for policy in policy_list]
        )
        manifest_id = "mlmanifest_" + uuid.uuid4().hex
        manifest = {
            "manifest_id": manifest_id,
            "model_name": model_name,
            "feature_family": feature_family.upper(),
            "training_scope": scope,
            "tenant_id": tenant_id if scope == SCOPE_TENANT else None,
            "included_policy_ids": [policy.policy_id for policy in policy_list],
            "included_tenant_count": len(policy_list),
            "training_row_count": int(training_row_count),
            "raw_cross_tenant_identifiers": False,
            "minimum_sample_count": minimum,
            "aggregate_features_only": all(
                policy.aggregate_features_only for policy in policy_list
            ),
            "feature_names": sorted(set(feature_names)),
            "label_names": sorted(set(label_names)),
            "policy_snapshot_digest": canonical_sha256(
                [policy.snapshot() for policy in policy_list]
            ),
            "window_start": window_start,
            "window_end": window_end,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ml_training_manifests
                    (manifest_id, model_name, feature_family, training_scope,
                     tenant_id, included_policy_ids, included_tenant_count,
                     training_row_count, minimum_sample_count,
                     aggregate_features_only, feature_names, label_names,
                     policy_snapshot_digest, window_start, window_end, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s)
                """,
                (
                    manifest_id,
                    model_name,
                    feature_family.upper(),
                    scope,
                    tenant_id if scope == SCOPE_TENANT else None,
                    Jsonb(manifest["included_policy_ids"]),
                    manifest["included_tenant_count"],
                    manifest["training_row_count"],
                    minimum,
                    manifest["aggregate_features_only"],
                    Jsonb(manifest["feature_names"]),
                    Jsonb(manifest["label_names"]),
                    manifest["policy_snapshot_digest"],
                    window_start or None,
                    window_end or None,
                    manifest["created_at"],
                ),
            )
        return manifest
