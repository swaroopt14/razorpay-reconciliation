from __future__ import annotations

import unittest
from unittest.mock import patch

from app.exceptions import TrainingGovernanceError
from app.training_governance import (
    SCOPE_GLOBAL,
    SCOPE_TENANT,
    TenantTrainingPolicy,
    TrainingGovernanceRepo,
    validate_training_lineage,
)


def policy(
    *,
    tenant_models_enabled: bool = True,
    global_training_opt_in: bool = True,
    families: tuple[str, ...] = ("LEAKAGE",),
) -> TenantTrainingPolicy:
    return TenantTrainingPolicy(
        policy_id="mlpol-test",
        tenant_id="tenant-a",
        tenant_models_enabled=tenant_models_enabled,
        global_training_opt_in=global_training_opt_in,
        allowed_feature_families=families,
        aggregate_features_only=True,
        minimum_sample_count=2,
        approved_by="data-governance",
        updated_at="2026-08-12T00:00:00+00:00",
    )


class TrainingGovernanceTests(unittest.TestCase):
    def test_missing_policy_store_fails_closed(self) -> None:
        with patch(
            "app.training_governance.config.INTELLIGENCE_DATABASE_URL", ""
        ):
            repo = TrainingGovernanceRepo()
            with self.assertRaisesRegex(TrainingGovernanceError, "required"):
                repo.authorize("tenant-a", "LEAKAGE", SCOPE_GLOBAL)
    def test_global_training_requires_explicit_opt_in(self) -> None:
        repo = TrainingGovernanceRepo("")
        with patch.object(
            repo,
            "get_policy",
            return_value=policy(global_training_opt_in=False),
        ):
            with self.assertRaisesRegex(TrainingGovernanceError, "not opted"):
                repo.authorize("tenant-a", "LEAKAGE", SCOPE_GLOBAL)

    def test_tenant_training_requires_tenant_model_enablement(self) -> None:
        repo = TrainingGovernanceRepo("")
        with patch.object(
            repo,
            "get_policy",
            return_value=policy(tenant_models_enabled=False),
        ):
            with self.assertRaisesRegex(TrainingGovernanceError, "not enabled"):
                repo.authorize("tenant-a", "LEAKAGE", SCOPE_TENANT)

    def test_unapproved_feature_family_is_rejected(self) -> None:
        repo = TrainingGovernanceRepo("")
        with patch.object(repo, "get_policy", return_value=policy()):
            with self.assertRaisesRegex(TrainingGovernanceError, "family=RCA"):
                repo.authorize("tenant-a", "RCA", SCOPE_GLOBAL)

    def test_valid_global_lineage_contains_policy_proof_not_tenant_id(self) -> None:
        validate_training_lineage(
            "leakage_prediction",
            {
                "training_scope": SCOPE_GLOBAL,
                "included_policy_ids": ["mlpol-test"],
                "policy_snapshot_digest": "a" * 64,
                "training_row_count": 2,
                "feature_names": ["intended_amount_minor"],
                "label_names": ["predicted_leakage_rate"],
                "aggregate_features_only": True,
                "raw_cross_tenant_identifiers": False,
            },
        )

    def test_global_lineage_rejects_raw_tenant_id(self) -> None:
        with self.assertRaisesRegex(TrainingGovernanceError, "tenant_id"):
            validate_training_lineage(
                "leakage_prediction",
                {
                    "training_scope": SCOPE_GLOBAL,
                    "tenant_id": "tenant-a",
                    "included_policy_ids": ["mlpol-test"],
                    "policy_snapshot_digest": "a" * 64,
                    "training_row_count": 2,
                    "feature_names": ["intended_amount_minor"],
                    "label_names": ["predicted_leakage_rate"],
                    "aggregate_features_only": True,
                    "raw_cross_tenant_identifiers": False,
                },
            )


if __name__ == "__main__":
    unittest.main()
