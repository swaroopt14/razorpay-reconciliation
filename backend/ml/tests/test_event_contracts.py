from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app.event_receipts import EventReceiptRepo
from app.exceptions import (
    IdempotencyConflictError,
    PayloadHashMismatchError,
    UnsupportedSchemaVersionError,
)
from app.kafka.consumer import MLConsumer
from app.ml_service import MLService
from app.model_contracts import canonical_sha256
from app.schemas import EVENT_TYPE_IF_SCORE, MLRequest, MLResult


class FakeMessage:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def value(self) -> bytes:
        return self._payload

    def topic(self) -> str:
        return "ml.request.events"

    def partition(self) -> int:
        return 0

    def offset(self) -> int:
        return 4


def make_service(path: Path) -> MLService:
    service = MLService.__new__(MLService)
    service._receipt_repo = EventReceiptRepo(str(path))
    return service


def request(event_id: str = "event-1", payload: dict | None = None) -> MLRequest:
    return MLRequest(
        event_id=event_id,
        event_type=EVENT_TYPE_IF_SCORE,
        tenant_id="tenant-1",
        payload=payload or {},
    )


class EnvelopeContractTests(unittest.TestCase):
    def test_legacy_envelope_defaults_to_schema_v1_and_computes_hash(self) -> None:
        parsed = MLRequest.from_dict({
            "event_id": "event-1",
            "event_type": EVENT_TYPE_IF_SCORE,
            "tenant_id": "tenant-1",
            "payload": {"features": {"ambiguity_rate": 0.2}},
            "timestamp": 1,
        })

        self.assertEqual(parsed.schema_version, "1")
        self.assertEqual(
            parsed.payload_sha256,
            canonical_sha256({"features": {"ambiguity_rate": 0.2}}),
        )

    def test_unsupported_schema_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedSchemaVersionError):
            MLRequest.from_dict({
                "event_id": "event-1",
                "event_type": EVENT_TYPE_IF_SCORE,
                "tenant_id": "tenant-1",
                "payload": {},
                "schema_version": "2",
            })

    def test_incorrect_payload_hash_is_rejected(self) -> None:
        with self.assertRaises(PayloadHashMismatchError):
            MLRequest.from_dict({
                "event_id": "event-1",
                "event_type": EVENT_TYPE_IF_SCORE,
                "tenant_id": "tenant-1",
                "payload": {"value": 1},
                "payload_sha256": "0" * 64,
            })

    @patch("app.kafka.consumer.Consumer")
    def test_unsupported_schema_is_dlq_acked_before_commit(
        self, consumer_cls: Mock
    ) -> None:
        kafka_consumer = consumer_cls.return_value
        dead_letter = Mock()
        consumer = MLConsumer(handler=Mock(), dead_letter_handler=dead_letter)
        message = FakeMessage(json.dumps({
            "event_id": "event-1",
            "event_type": EVENT_TYPE_IF_SCORE,
            "tenant_id": "tenant-1",
            "payload": {},
            "schema_version": "99",
        }).encode("utf-8"))

        consumer._process_message(message)

        dead_letter.assert_called_once()
        kafka_consumer.commit.assert_called_once_with(
            message=message, asynchronous=False
        )


class DurableReceiptTests(unittest.TestCase):
    def test_duplicate_request_is_computed_once_and_returns_one_logical_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(Path(temp_dir) / "receipts.db")
            service._dispatch = Mock(return_value=MLResult(
                event_id="event-1",
                event_type=EVENT_TYPE_IF_SCORE,
                tenant_id="tenant-1",
                model_outputs={"score": 0.4},
                model_version="isolation_forest_v1",
            ))

            first = service.process(request())
            second = service.process(request())

            self.assertEqual(service._dispatch.call_count, 1)
            self.assertEqual(first.to_dict(), second.to_dict())
            self.assertEqual(first.prediction_id, "event-1")
            self.assertEqual(len(first.model_digest), 64)
            self.assertEqual(first.model_outputs["model_digest"], first.model_digest)
            service.close()

    def test_event_id_reuse_with_different_content_is_a_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = make_service(Path(temp_dir) / "receipts.db")
            service._dispatch = Mock(return_value=MLResult(
                event_id="event-1",
                event_type=EVENT_TYPE_IF_SCORE,
                tenant_id="tenant-1",
                model_outputs={"score": 0.4},
                model_version="isolation_forest_v1",
            ))
            service.process(request(payload={"value": 1}))

            with self.assertRaises(IdempotencyConflictError):
                service.process(request(payload={"value": 2}))
            self.assertEqual(service._dispatch.call_count, 1)
            service.close()

    def test_golden_result_survives_receipt_repository_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "receipts.db"
            req = request(payload={
                "features": {
                    "ambiguity_rate": 0.2,
                    "variance_rate": 0.1,
                    "settlement_ratio": 0.8,
                    "unresolved_ratio": 0.1,
                    "missing_ref_rate": 0.05,
                },
                "history": [],
            })
            first_service = make_service(path)
            first = first_service.process(req)
            first_service.close()

            restarted = make_service(path)
            restarted._dispatch = Mock(side_effect=AssertionError("must use receipt"))
            second = restarted.process(req)

            self.assertEqual(first.to_dict(), second.to_dict())
            restarted._dispatch.assert_not_called()
            restarted.close()


if __name__ == "__main__":
    unittest.main()
