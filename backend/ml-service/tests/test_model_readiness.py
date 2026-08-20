from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from app.ml_service import MLService
from app.models.rca_hdbscan import RCAModel
from app.schemas import EVENT_TYPE_RCA_CLUSTER, MLRequest


class RCAModelReadinessTests(unittest.TestCase):
    def test_missing_bundle_is_not_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model = RCAModel(str(Path(temp_dir) / "missing.pkl"))

        self.assertFalse(model.is_ready)

    def test_missing_bundle_returns_explicit_unavailable_without_prediction(self) -> None:
        service = MLService.__new__(MLService)
        service._rca_model = Mock()
        service._rca_model.is_ready = False
        request = MLRequest(
            event_id="event-rca-1",
            event_type=EVENT_TYPE_RCA_CLUSTER,
            tenant_id="tenant-1",
            payload={
                "batch_id": "batch-1",
                "candidates": [{"intent_id": "intent-1"}],
                "finality_label": "FULLY_SETTLED",
            },
        )

        result = service._handle_rca_cluster(request)

        self.assertEqual(result.error, "MODEL_UNAVAILABLE")
        self.assertEqual(result.model_version, "unavailable")
        self.assertFalse(result.model_ready)
        self.assertEqual(result.fallback_reason, "MODEL_UNAVAILABLE")
        self.assertEqual(result.model_outputs["status"], "MODEL_UNAVAILABLE")
        self.assertFalse(result.model_outputs["model_ready"])
        self.assertEqual(result.model_outputs["top_clusters"], [])
        self.assertEqual(result.model_outputs["total_points"], 0)
        service._rca_model.predict.assert_not_called()
        service._rca_model.maybe_retrain_async.assert_not_called()


if __name__ == "__main__":
    unittest.main()
