from __future__ import annotations

import base64
import os
import unittest
import uuid
from unittest.mock import patch

import psycopg
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.model_registry import (
    MODEL_LR,
    BundleVerificationError,
    ModelBundle,
    ModelRegistry,
)
from app.training_governance import TrainingGovernanceRepo


@unittest.skipUnless(
    os.getenv("ML_REGISTRY_TEST_DSN"),
    "set ML_REGISTRY_TEST_DSN to run the real Postgres registry test",
)
class PostgresModelRegistryTests(unittest.TestCase):
    @patch.multiple(
        "app.config",
        LR_TRAINING_SCOPE="GLOBAL",
        ML_MIN_SAMPLES_PER_TENANT=1,
        ML_GLOBAL_MIN_TENANTS=1,
    )
    def test_atomic_promotion_rollback_and_central_tamper_rejection(self) -> None:
        dsn = os.environ["ML_REGISTRY_TEST_DSN"]
        private = Ed25519PrivateKey.generate()
        public = base64.b64encode(
            private.public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
        ).decode("ascii")
        registry = ModelRegistry(dsn, public, initialize=True)
        suffix = uuid.uuid4().hex
        governance_policy = TrainingGovernanceRepo(dsn).upsert_policy(
            tenant_id="tenant-integration",
            tenant_models_enabled=True,
            global_training_opt_in=True,
            allowed_feature_families=["AMBIGUITY"],
            aggregate_features_only=True,
            minimum_sample_count=1,
            approved_by="integration-governance",
        )
        versions = [f"integration-v1-{suffix}", f"integration-v2-{suffix}"]
        bundles = [
            ModelBundle.sign(
                model_name=MODEL_LR,
                version=version,
                artifact=(
                    f'{{"bias":-2.0,"last_event_id":"","num_features":4,'
                    f'"trained_on":0,"version":"{version}",'
                    f'"weights":[3.0,2.5,2.0,1.5]}}'
                ).encode(),
                training_dataset_lineage={
                    "dataset_snapshot": suffix,
                    "training_scope": "GLOBAL",
                    "included_policy_ids": [governance_policy.policy_id],
                    "policy_snapshot_digest": governance_policy.snapshot_digest,
                    "training_row_count": 1,
                    "feature_names": ["ambiguity_rate"],
                    "label_names": ["ambiguity_label"],
                    "aggregate_features_only": True,
                    "raw_cross_tenant_identifiers": False,
                },
                metrics={"golden_vectors_passed": 12},
                approver="integration-test",
                private_key=private,
            )
            for version in versions
        ]
        for bundle in bundles:
            registry.publish_approved(bundle)

        registry.promote(MODEL_LR, versions[1], "release-manager")
        self.assertEqual(registry.list_promoted()[MODEL_LR].version, versions[1])

        candidate = registry.stage_lr_candidate(
            event_id=f"label-{suffix}",
            tenant_id="tenant-integration",
            features=[0.2, 0.1, 0.3, 0.1],
            label=1.0,
            learning_rate=0.01,
            default_state={
                "weights": [3.0, 2.5, 2.0, 1.5],
                "bias": -2.0,
                "num_features": 4,
                "trained_on": 0,
                "last_event_id": "",
            },
            base_version="logistic_regression_v1",
        )
        duplicate = registry.stage_lr_candidate(
            event_id=f"label-{suffix}",
            tenant_id="tenant-integration",
            features=[0.2, 0.1, 0.3, 0.1],
            label=1.0,
            learning_rate=0.01,
            default_state={},
            base_version="logistic_regression_v1",
        )
        self.assertEqual(candidate, duplicate)
        self.assertEqual(registry.list_promoted()[MODEL_LR].version, versions[1])

        approved = registry.approve_candidate(
            MODEL_LR, candidate, "ml-risk-approver", private
        )
        self.assertEqual(approved.approver, "ml-risk-approver")
        registry.promote(MODEL_LR, candidate, "release-manager")
        self.assertEqual(registry.list_promoted()[MODEL_LR].version, candidate)

        registry.promote(MODEL_LR, versions[0], "release-manager")
        self.assertEqual(registry.list_promoted()[MODEL_LR].version, versions[0])

        with psycopg.connect(dsn) as conn:
            conn.execute(
                "UPDATE ml_model_bundles SET artifact = %s "
                "WHERE model_name = %s AND version = %s",
                (b"tampered", MODEL_LR, versions[0]),
            )
        with self.assertRaises(BundleVerificationError):
            registry.list_promoted()


if __name__ == "__main__":
    unittest.main()
