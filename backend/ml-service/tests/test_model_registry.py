from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.ml_service import MLService
from app.model_registry import (
    MODEL_LR,
    BundleVerificationError,
    ModelBundle,
    Promotion,
    load_public_key,
)
from app.models.logistic_regression import AmbiguityModel
from app.schemas import EVENT_TYPE_LR_PREDICT, EVENT_TYPE_LR_TRAIN, MLRequest


def key_pair() -> tuple[Ed25519PrivateKey, str]:
    private = Ed25519PrivateKey.generate()
    public_raw = private.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    return private, base64.b64encode(public_raw).decode("ascii")


def signed_bundle(artifact: bytes, version: str = "lr-2026-08-12.1") -> tuple[ModelBundle, str]:
    private, public = key_pair()
    return ModelBundle.sign(
        model_name=MODEL_LR,
        version=version,
        artifact=artifact,
        training_dataset_lineage={
            "dataset": "ml_feature_store",
            "snapshot": "2026-08-12T00:00:00Z",
            "tenant_scope": "approved-global-aggregate",
            "training_scope": "GLOBAL",
            "included_policy_ids": ["mlpol-test"],
            "policy_snapshot_digest": "a" * 64,
            "training_row_count": 12,
            "feature_names": ["ambiguity_rate"],
            "label_names": ["ambiguity_label"],
            "aggregate_features_only": True,
            "raw_cross_tenant_identifiers": False,
        },
        metrics={"brier_score": 0.08, "golden_vectors": 12},
        approver="ml-risk@example.test",
        private_key=private,
        created_at="2026-08-12T00:00:00+00:00",
    ), public


class FakeRegistry:
    def __init__(self, bundle: ModelBundle) -> None:
        self.bundle = bundle
        self.staged: list[dict] = []

    def sync_to_paths(self, paths: dict[str, str]) -> dict[str, Promotion]:
        path = Path(paths[MODEL_LR])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.bundle.artifact)
        return {
            MODEL_LR: Promotion(
                MODEL_LR, self.bundle.version, self.bundle.digest
            )
        }

    def stage_lr_candidate(self, **kwargs) -> str:
        self.staged.append(kwargs)
        return "lr-candidate-2"


class SignedBundleTests(unittest.TestCase):
    def test_approved_bundle_verifies_digest_signature_and_audit_metadata(self) -> None:
        bundle, public = signed_bundle(b'{"weights":[3,2.5,2,1.5]}')

        bundle.verify(load_public_key(public))

        self.assertEqual(len(bundle.digest), 64)
        self.assertEqual(bundle.approver, "ml-risk@example.test")
        self.assertIn("dataset", bundle.training_dataset_lineage)
        self.assertIn("brier_score", bundle.metrics)

    def test_changed_artifact_is_rejected(self) -> None:
        bundle, public = signed_bundle(b'{"weights":[3,2.5,2,1.5]}')
        tampered = ModelBundle(**{**bundle.__dict__, "artifact": bundle.artifact + b" "})

        with self.assertRaises(BundleVerificationError):
            tampered.verify(load_public_key(public))

    def test_changed_manifest_is_rejected(self) -> None:
        bundle, public = signed_bundle(b'{"weights":[3,2.5,2,1.5]}')
        tampered = ModelBundle(**{**bundle.__dict__, "approver": "attacker"})

        with self.assertRaises(BundleVerificationError):
            tampered.verify(load_public_key(public))

    def test_signed_bundle_without_governed_lineage_is_rejected(self) -> None:
        private, public = key_pair()
        bundle = ModelBundle.sign(
            model_name=MODEL_LR,
            version="invalid-lineage",
            artifact=b'{"weights":[3,2.5,2,1.5]}',
            training_dataset_lineage={
                "training_scope": "GLOBAL",
                "included_policy_ids": ["mlpol-test"],
                "policy_snapshot_digest": "a" * 64,
                "training_row_count": 1,
                "feature_names": ["ambiguity_rate"],
                "label_names": ["ambiguity_label"],
                "aggregate_features_only": True,
                "raw_cross_tenant_identifiers": False,
                "tenant_id": "tenant-must-not-leak",
            },
            metrics={},
            approver="test-approver",
            private_key=private,
        )
        with self.assertRaisesRegex(BundleVerificationError, "tenant_id"):
            bundle.verify(load_public_key(public))


    def test_required_registry_rejects_tampered_bundle_during_startup(self) -> None:
        registry = Mock()
        registry.sync_to_paths.side_effect = BundleVerificationError("tampered")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with patch.multiple(
                "app.config",
                MODEL_REGISTRY_REQUIRED=True,
                LR_MODEL_PATH=str(root / "lr.json"),
                RCA_MODEL_PATH=str(root / "rca.pkl"),
                LEAKAGE_MODEL_PATH=str(root / "leakage.joblib"),
            ):
                with self.assertRaises(BundleVerificationError):
                    MLService(
                        receipt_db_path=str(root / "receipts.db"),
                        registry=registry,
                    )

class ReplicaParityTests(unittest.TestCase):
    def _request(self, event_id: str) -> MLRequest:
        return MLRequest(
            event_id=event_id,
            event_type=EVENT_TYPE_LR_PREDICT,
            tenant_id="tenant-1",
            payload={
                "features": {
                    "ambiguity_rate": 0.25,
                    "provider_ref_missing_rate": 0.10,
                    "avg_confidence": 0.85,
                    "value_at_risk_minor": 100,
                    "total_intended_minor": 1000,
                }
            },
        )

    def test_two_replicas_load_same_promotion_and_match_golden_output(self) -> None:
        state = AmbiguityModel(
            weights=[3.1, 2.4, 1.9, 1.4], bias=-1.9, trained_on=8
        ).to_dict()
        artifact = json.dumps(
            state, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        bundle, _ = signed_bundle(artifact)
        registry = FakeRegistry(bundle)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            results = []
            for replica in ("replica-a", "replica-b"):
                data = root / replica
                with patch.multiple(
                    "app.config",
                    LR_MODEL_PATH=str(data / "lr.json"),
                    RCA_MODEL_PATH=str(data / "rca.pkl"),
                    LEAKAGE_MODEL_PATH=str(data / "leakage.joblib"),
                    MODEL_REGISTRY_REFRESH_SECONDS=3600.0,
                ):
                    service = MLService(
                        receipt_db_path=str(data / "receipts.db"),
                        registry=registry,
                    )
                    result = service.process(self._request(f"golden-{replica}"))
                    results.append(result)
                    service.close()

        self.assertAlmostEqual(
            results[0].model_outputs["probability"],
            results[1].model_outputs["probability"],
            places=15,
        )
        self.assertEqual(results[0].model_outputs["level"], results[1].model_outputs["level"])
        self.assertEqual(results[0].model_version, bundle.version)
        self.assertEqual(results[1].model_version, bundle.version)
        self.assertEqual(results[0].model_digest, bundle.digest)
        self.assertEqual(results[1].model_digest, bundle.digest)

    def test_managed_training_stages_candidate_without_mutating_live_model(self) -> None:
        state = AmbiguityModel().to_dict()
        artifact = json.dumps(
            state, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        bundle, _ = signed_bundle(artifact)
        registry = FakeRegistry(bundle)
        service = MLService.__new__(MLService)
        service._registry = registry
        service._lr_model = AmbiguityModel()
        before = service._lr_model.to_dict()
        request = MLRequest(
            event_id="train-1",
            event_type=EVENT_TYPE_LR_TRAIN,
            tenant_id="tenant-1",
            payload={"features": [0.2, 0.1, 0.3, 0.1], "label": 1.0},
        )

        service._handle_lr_train(request)

        self.assertEqual(service._lr_model.to_dict(), before)
        self.assertEqual(len(registry.staged), 1)
        self.assertEqual(registry.staged[0]["event_id"], "train-1")


if __name__ == "__main__":
    unittest.main()
