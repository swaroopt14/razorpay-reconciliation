from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable

import psycopg

from app import config
from app.training_governance import (
    SCOPE_GLOBAL,
    SCOPE_TENANT,
    TenantTrainingPolicy,
    TrainingGovernanceRepo,
    normalize_scope,
)

LABEL_NAMES = (
    "predicted_leakage_rate",
    "label_rate",
    "target_leakage_amount_minor",
    "label_amount",
    "sample_weight",
)


@dataclass(frozen=True)
class LeakageTrainingDataset:
    rows: list[dict[str, Any]]
    policies: tuple[TenantTrainingPolicy, ...]
    training_scope: str
    tenant_id: str | None
    window_start: str
    window_end: str


class LeakageTrainingRepo:
    def __init__(
        self,
        dsn: str | None = None,
        governance: TrainingGovernanceRepo | None = None,
    ) -> None:
        self._dsn = (dsn or config.INTELLIGENCE_DATABASE_URL).strip()
        self._governance = governance or TrainingGovernanceRepo(self._dsn)

    def is_configured(self) -> bool:
        return bool(self._dsn)

    @staticmethod
    def _filtered_payload(
        raw: dict[str, Any], allowed_names: Iterable[str]
    ) -> dict[str, Any]:
        return {name: raw[name] for name in allowed_names if name in raw}

    def load_training_dataset(
        self,
        *,
        training_scope: str,
        tenant_id: str,
        feature_names: Iterable[str],
    ) -> LeakageTrainingDataset:
        scope = normalize_scope(training_scope)
        allowed_features = tuple(sorted(set(feature_names)))
        if not self._dsn:
            return LeakageTrainingDataset([], (), scope, None, "", "")
        if scope == SCOPE_TENANT:
            return self._load_tenant_dataset(tenant_id, allowed_features)
        return self._load_global_dataset(allowed_features)

    def count_labeled_rows(
        self,
        *,
        training_scope: str,
        tenant_id: str,
        feature_names: Iterable[str],
    ) -> int:
        return len(self.load_training_dataset(
            training_scope=training_scope,
            tenant_id=tenant_id,
            feature_names=feature_names,
        ).rows)

    def _load_tenant_dataset(
        self,
        tenant_id: str,
        feature_names: tuple[str, ...],
    ) -> LeakageTrainingDataset:
        policy = self._governance.authorize(tenant_id, "LEAKAGE", SCOPE_TENANT)
        sql = """
            SELECT scope_ref, features_json::text, label_json::text, created_at
              FROM ml_feature_store
             WHERE tenant_id = %s
               AND feature_family = 'LEAKAGE'
               AND scope_type = 'BATCH'
               AND label_json IS NOT NULL
             ORDER BY created_at ASC
        """
        with psycopg.connect(self._dsn) as conn:
            records = conn.execute(sql, (tenant_id,)).fetchall()
        minimum = max(
            config.ML_MIN_SAMPLES_PER_TENANT,
            policy.minimum_sample_count,
        )
        if len(records) < minimum:
            records = []
        rows = [
            self._training_row(
                row_ref=f"tenant::{batch_id}",
                features_text=features_text,
                label_text=label_text,
                created_at=created_at,
                feature_names=feature_names,
            )
            for batch_id, features_text, label_text, created_at in records
        ]
        return LeakageTrainingDataset(
            rows=rows,
            policies=(policy,),
            training_scope=SCOPE_TENANT,
            tenant_id=tenant_id,
            window_start=str(records[0][3]) if records else "",
            window_end=str(records[-1][3]) if records else "",
        )

    def _load_global_dataset(
        self,
        feature_names: tuple[str, ...],
    ) -> LeakageTrainingDataset:
        # Deliberately omit tenant_id and scope_ref: a global trainer receives only
        # approved batch-level aggregate vectors plus opaque policy identifiers.
        sql = """
            SELECT p.policy_id, p.tenant_id, p.tenant_models_enabled,
                   p.global_training_opt_in, p.allowed_feature_families,
                   p.aggregate_features_only, p.minimum_sample_count,
                   p.approved_by, p.updated_at,
                   f.features_json::text, f.label_json::text, f.created_at
              FROM ml_feature_store f
              JOIN ml_training_tenant_policies p
                ON p.tenant_id = f.tenant_id
             WHERE f.feature_family = 'LEAKAGE'
               AND f.scope_type = 'BATCH'
               AND f.label_json IS NOT NULL
               AND p.global_training_opt_in = TRUE
               AND p.aggregate_features_only = TRUE
               AND 'LEAKAGE' = ANY(p.allowed_feature_families)
             ORDER BY p.policy_id, f.created_at ASC
        """
        with psycopg.connect(self._dsn) as conn:
            records = conn.execute(sql).fetchall()

        by_policy: dict[str, list[tuple[Any, ...]]] = {}
        policies: dict[str, TenantTrainingPolicy] = {}
        for record in records:
            policy = TrainingGovernanceRepo.policy_from_row(record[:9])
            policies[policy.policy_id] = policy
            by_policy.setdefault(policy.policy_id, []).append(record)

        eligible_ids = [
            policy_id
            for policy_id, policy_rows in by_policy.items()
            if len(policy_rows) >= max(
                config.ML_MIN_SAMPLES_PER_TENANT,
                policies[policy_id].minimum_sample_count,
            )
        ]
        if len(eligible_ids) < config.ML_GLOBAL_MIN_TENANTS:
            eligible_ids = []

        rows: list[dict[str, Any]] = []
        selected_policies: list[TenantTrainingPolicy] = []
        selected_records: list[tuple[Any, ...]] = []
        for policy_id in sorted(eligible_ids):
            selected_policies.append(policies[policy_id])
            for ordinal, record in enumerate(by_policy[policy_id], start=1):
                selected_records.append(record)
                rows.append(self._training_row(
                    row_ref=f"global::{policy_id}::{ordinal}",
                    features_text=record[9],
                    label_text=record[10],
                    created_at=record[11],
                    feature_names=feature_names,
                ))

        return LeakageTrainingDataset(
            rows=rows,
            policies=tuple(selected_policies),
            training_scope=SCOPE_GLOBAL,
            tenant_id=None,
            window_start=str(selected_records[0][11]) if selected_records else "",
            window_end=str(selected_records[-1][11]) if selected_records else "",
        )

    def _training_row(
        self,
        *,
        row_ref: str,
        features_text: str,
        label_text: str,
        created_at: Any,
        feature_names: tuple[str, ...],
    ) -> dict[str, Any]:
        raw_features = json.loads(features_text or "{}")
        raw_label = json.loads(label_text or "{}")
        return {
            "row_ref": row_ref,
            "features": self._filtered_payload(raw_features, feature_names),
            "label": self._filtered_payload(raw_label, LABEL_NAMES),
            "created_at": created_at,
        }

    def record_manifest(
        self,
        dataset: LeakageTrainingDataset,
        feature_names: Iterable[str],
    ) -> dict[str, Any]:
        return self._governance.record_manifest(
            model_name=config.MODEL_VERSION_LEAKAGE,
            feature_family="LEAKAGE",
            training_scope=dataset.training_scope,
            tenant_id=dataset.tenant_id,
            policies=dataset.policies,
            training_row_count=len(dataset.rows),
            feature_names=feature_names,
            label_names=LABEL_NAMES,
            window_start=dataset.window_start,
            window_end=dataset.window_end,
        )
