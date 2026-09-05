from __future__ import annotations

import os
import unittest
import uuid
from unittest.mock import patch

import psycopg
from psycopg.types.json import Jsonb

from app.leakage_training_repo import LeakageTrainingRepo
from app.training_governance import SCOPE_GLOBAL, SCOPE_TENANT, TrainingGovernanceRepo


@unittest.skipUnless(
    os.getenv("ML_REGISTRY_TEST_DSN"),
    "set ML_REGISTRY_TEST_DSN to run the real Postgres governance test",
)
class PostgresTrainingGovernanceTests(unittest.TestCase):
    @patch.multiple(
        "app.config",
        ML_MIN_SAMPLES_PER_TENANT=2,
        ML_GLOBAL_MIN_TENANTS=2,
    )
    def test_global_opt_in_filter_tenant_filter_and_privacy_safe_manifest(self) -> None:
        dsn = os.environ["ML_REGISTRY_TEST_DSN"]
        suffix = uuid.uuid4().hex
        tenants = [f"tenant-a-{suffix}", f"tenant-b-{suffix}", f"tenant-c-{suffix}"]
        governance = TrainingGovernanceRepo(dsn)
        policies = [
            governance.upsert_policy(
                tenant_id=tenant_id,
                tenant_models_enabled=True,
                global_training_opt_in=index < 2,
                allowed_feature_families=["LEAKAGE"],
                aggregate_features_only=True,
                minimum_sample_count=2,
                approved_by="integration-governance",
            )
            for index, tenant_id in enumerate(tenants)
        ]
        manifest_id: str | None = None
        try:
            with psycopg.connect(dsn) as conn:
                for tenant_id in tenants:
                    for ordinal in range(2):
                        conn.execute(
                            """
                            INSERT INTO ml_feature_store
                                (feature_row_id, tenant_id, scope_type, scope_ref,
                                 feature_family, window_start, window_end,
                                 features_json, label_json)
                            VALUES (%s, %s, 'BATCH', %s, 'LEAKAGE',
                                    now() - interval '1 hour', now(), %s, %s)
                            """,
                            (
                                f"feature-{tenant_id}-{ordinal}",
                                tenant_id,
                                f"batch-{ordinal}",
                                Jsonb({
                                    "intended_amount_minor": 1000 + ordinal,
                                    "raw_tenant_hint": tenant_id,
                                }),
                                Jsonb({"predicted_leakage_rate": 0.1}),
                            ),
                        )

            repo = LeakageTrainingRepo(dsn, governance)
            global_dataset = repo.load_training_dataset(
                training_scope=SCOPE_GLOBAL,
                tenant_id=tenants[0],
                feature_names=["intended_amount_minor"],
            )

            self.assertEqual(len(global_dataset.rows), 4)
            self.assertEqual(
                {item.policy_id for item in global_dataset.policies},
                {policies[0].policy_id, policies[1].policy_id},
            )
            self.assertIsNone(global_dataset.tenant_id)
            serialized_rows = str(global_dataset.rows)
            for tenant_id in tenants:
                self.assertNotIn(tenant_id, serialized_rows)
            self.assertNotIn("raw_tenant_hint", serialized_rows)

            tenant_dataset = repo.load_training_dataset(
                training_scope=SCOPE_TENANT,
                tenant_id=tenants[0],
                feature_names=["intended_amount_minor"],
            )
            self.assertEqual(len(tenant_dataset.rows), 2)
            self.assertEqual(
                {item.policy_id for item in tenant_dataset.policies},
                {policies[0].policy_id},
            )

            manifest = repo.record_manifest(
                global_dataset,
                ["intended_amount_minor"],
            )
            manifest_id = manifest["manifest_id"]
            self.assertIsNone(manifest["tenant_id"])
            self.assertEqual(manifest["included_tenant_count"], 2)
            self.assertFalse(manifest["raw_cross_tenant_identifiers"])
            self.assertEqual(
                set(manifest["included_policy_ids"]),
                {policies[0].policy_id, policies[1].policy_id},
            )
            with psycopg.connect(dsn) as conn:
                stored = conn.execute(
                    """
                    SELECT tenant_id, included_tenant_count, training_row_count
                      FROM ml_training_manifests
                     WHERE manifest_id = %s
                    """,
                    (manifest_id,),
                ).fetchone()
            self.assertEqual(stored, (None, 2, 4))
        finally:
            with psycopg.connect(dsn) as conn:
                if manifest_id:
                    conn.execute(
                        "DELETE FROM ml_training_manifests WHERE manifest_id = %s",
                        (manifest_id,),
                    )
                conn.execute(
                    "DELETE FROM ml_feature_store WHERE tenant_id = ANY(%s)",
                    (tenants,),
                )
                conn.execute(
                    "DELETE FROM ml_training_tenant_policies WHERE tenant_id = ANY(%s)",
                    (tenants,),
                )


if __name__ == "__main__":
    unittest.main()
