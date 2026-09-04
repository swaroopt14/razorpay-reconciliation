from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from confluent_kafka import KafkaError, KafkaException

from app.exceptions import NonRetryableMessageError, UnsupportedEventTypeError
from app.kafka.consumer import MLConsumer
from app.kafka.producer import MLProducer
from app.ml_service import MLService
from app.models.logistic_regression import AmbiguityModel
from app.schemas import EVENT_TYPE_IF_SCORE, MLRequest, MLResult


class FakeMessage:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def value(self) -> bytes:
        return self._payload

    def topic(self) -> str:
        return "ml.request.events"

    def partition(self) -> int:
        return 2

    def offset(self) -> int:
        return 17


class FakeDeliveryMessage:
    def topic(self) -> str:
        return "ml.result.events"

    def partition(self) -> int:
        return 1

    def offset(self) -> int:
        return 9


def request_payload(event_type: str = EVENT_TYPE_IF_SCORE) -> bytes:
    return json.dumps({
        "event_id": "event-123",
        "event_type": event_type,
        "tenant_id": "tenant-1",
        "payload": {},
        "timestamp": 1,
    }).encode("utf-8")


class ConsumerCommitTests(unittest.TestCase):
    @patch("app.kafka.consumer.Consumer")
    def test_successful_handler_is_committed(self, consumer_cls: Mock) -> None:
        kafka_consumer = consumer_cls.return_value
        handler = Mock()
        consumer = MLConsumer(handler=handler)
        message = FakeMessage(request_payload())

        consumer._process_message(message)

        handler.assert_called_once()
        kafka_consumer.commit.assert_called_once_with(message=message, asynchronous=False)
        kafka_consumer.seek.assert_not_called()

    @patch("app.kafka.consumer.Consumer")
    def test_retryable_handler_failure_is_rewound_without_commit(self, consumer_cls: Mock) -> None:
        kafka_consumer = consumer_cls.return_value
        handler = Mock(side_effect=RuntimeError("inference failed"))
        consumer = MLConsumer(handler=handler)
        message = FakeMessage(request_payload())

        with self.assertRaisesRegex(RuntimeError, "inference failed"):
            consumer._process_message(message)

        kafka_consumer.commit.assert_not_called()
        rewind = kafka_consumer.seek.call_args.args[0]
        self.assertEqual((rewind.topic, rewind.partition, rewind.offset),
                         (message.topic(), message.partition(), message.offset()))

    @patch("app.kafka.consumer.Consumer")
    def test_poison_message_commits_only_after_dlq_ack(self, consumer_cls: Mock) -> None:
        kafka_consumer = consumer_cls.return_value
        dead_letter = Mock()
        consumer = MLConsumer(handler=Mock(), dead_letter_handler=dead_letter)
        message = FakeMessage(b"not-json")

        consumer._process_message(message)

        dead_letter.assert_called_once()
        kafka_consumer.commit.assert_called_once_with(message=message, asynchronous=False)

    @patch("app.kafka.consumer.Consumer")
    def test_dlq_failure_is_rewound_without_commit(self, consumer_cls: Mock) -> None:
        kafka_consumer = consumer_cls.return_value
        dead_letter = Mock(side_effect=RuntimeError("dlq unavailable"))
        consumer = MLConsumer(handler=Mock(), dead_letter_handler=dead_letter)
        message = FakeMessage(b"not-json")

        with self.assertRaisesRegex(RuntimeError, "dlq unavailable"):
            consumer._process_message(message)

        kafka_consumer.commit.assert_not_called()
        kafka_consumer.seek.assert_called_once()

    @patch("app.kafka.consumer.Consumer")
    def test_non_retryable_handler_failure_is_dead_lettered(self, consumer_cls: Mock) -> None:
        kafka_consumer = consumer_cls.return_value
        dead_letter = Mock()
        handler = Mock(side_effect=NonRetryableMessageError("unsupported"))
        consumer = MLConsumer(handler=handler, dead_letter_handler=dead_letter)
        message = FakeMessage(request_payload("UNKNOWN"))

        consumer._process_message(message)

        dead_letter.assert_called_once()
        kafka_consumer.commit.assert_called_once_with(message=message, asynchronous=False)


class ProducerAcknowledgementTests(unittest.TestCase):
    def make_producer(self) -> tuple[MLProducer, Mock]:
        producer = MLProducer.__new__(MLProducer)
        kafka_producer = Mock()
        producer._producer = kafka_producer
        return producer, kafka_producer

    def result(self) -> MLResult:
        return MLResult(
            event_id="event-123",
            event_type=EVENT_TYPE_IF_SCORE,
            tenant_id="tenant-1",
            model_outputs={"score": 0.4},
            model_version="isolation_forest_v1",
        )

    def test_publish_returns_after_delivery_ack(self) -> None:
        producer, kafka_producer = self.make_producer()

        def acknowledge(**kwargs) -> None:
            kwargs["on_delivery"](None, FakeDeliveryMessage())

        kafka_producer.produce.side_effect = acknowledge

        producer.publish_result(self.result(), timeout=0.1)

        published = kafka_producer.produce.call_args.kwargs
        self.assertEqual(published["key"], b"tenant-1")
        self.assertEqual(json.loads(published["value"])["prediction_id"], "event-123")

    def test_delivery_error_is_raised(self) -> None:
        producer, kafka_producer = self.make_producer()
        error = KafkaError(KafkaError._ALL_BROKERS_DOWN, "broker unavailable")

        def reject(**kwargs) -> None:
            kwargs["on_delivery"](error, FakeDeliveryMessage())

        kafka_producer.produce.side_effect = reject

        with self.assertRaises(KafkaException):
            producer.publish_result(self.result(), timeout=0.1)

    def test_synchronous_produce_error_is_raised(self) -> None:
        producer, kafka_producer = self.make_producer()
        kafka_producer.produce.side_effect = BufferError("queue full")

        with self.assertRaisesRegex(BufferError, "queue full"):
            producer.publish_result(self.result(), timeout=0.1)

    def test_delivery_timeout_is_raised(self) -> None:
        producer, _ = self.make_producer()

        with self.assertRaises(TimeoutError):
            producer.publish_result(self.result(), timeout=0.0)


class ModelProcessingTests(unittest.TestCase):
    def test_processing_failure_is_not_converted_to_successful_result(self) -> None:
        service = MLService.__new__(MLService)
        service._handle_if_score = Mock(side_effect=RuntimeError("model failed"))
        request = MLRequest("event-123", EVENT_TYPE_IF_SCORE, "tenant-1", {})

        with self.assertRaisesRegex(RuntimeError, "model failed"):
            service.process(request)

    def test_unknown_event_is_non_retryable(self) -> None:
        service = MLService.__new__(MLService)
        request = MLRequest("event-123", "UNKNOWN", "tenant-1", {})

        with self.assertRaises(UnsupportedEventTypeError):
            service.process(request)


class DurableTrainingTests(unittest.TestCase):
    def test_training_is_persisted_and_immediate_replay_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "lr_model.json"
            model = AmbiguityModel()

            self.assertTrue(model.train_and_save([0.2, 0.3, 0.4, 0.5], 1.0, str(path), "train-1"))
            self.assertTrue(path.exists())

            restored = AmbiguityModel.load(str(path))
            self.assertEqual(restored.trained_on, 1)
            self.assertEqual(restored.last_event_id, "train-1")
            self.assertFalse(
                restored.train_and_save([0.2, 0.3, 0.4, 0.5], 1.0, str(path), "train-1")
            )
            self.assertEqual(restored.trained_on, 1)

    def test_persist_failure_does_not_mutate_in_memory_model(self) -> None:
        model = AmbiguityModel()
        original = model.to_dict()

        with patch("app.models.logistic_regression._persist_state", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                model.train_and_save([0.2, 0.3, 0.4, 0.5], 1.0, "ignored", "train-1")

        self.assertEqual(model.to_dict(), original)


if __name__ == "__main__":
    unittest.main()
