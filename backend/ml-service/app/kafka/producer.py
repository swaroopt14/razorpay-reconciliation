"""
Kafka producer for ml.result.events.

Uses acks=all for durability.  Delivery failures are logged but not raised —
the Go side handles missing results via its timeout/fallback mechanism.
"""

from __future__ import annotations

import json
import logging

from confluent_kafka import Producer as _KafkaProducer

from app import config
from app.schemas import MLResult

logger = logging.getLogger(__name__)


class MLProducer:
    def __init__(self) -> None:
        kafka_config = {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "acks": "all",
            "retries": 3,
            "retry.backoff.ms": 100,
            "delivery.timeout.ms": 10_000,
        }

        # SASL/SCRAM-SHA-512 authentication (PLAT-06)
        sasl_username = config.KAFKA_SASL_USERNAME
        sasl_password = config.KAFKA_SASL_PASSWORD
        if sasl_username and sasl_password:
            kafka_config.update({
                "security.protocol": "SASL_PLAINTEXT",
                "sasl.mechanism": "SCRAM-SHA-512",
                "sasl.username": sasl_username,
                "sasl.password": sasl_password,
            })

        self._producer = _KafkaProducer(kafka_config)

    def publish_result(self, result: MLResult) -> None:
        """Publish an ML result to ml.result.events, keyed by tenant_id."""
        try:
            payload = json.dumps(result.to_dict()).encode("utf-8")
            self._producer.produce(
                topic=config.ML_RESULT_TOPIC,
                key=result.tenant_id.encode("utf-8"),
                value=payload,
                on_delivery=self._on_delivery,
            )
            self._producer.poll(0)  # trigger buffered callbacks without blocking
        except Exception as exc:
            logger.error("ml_producer: produce failed event_id=%s: %s", result.event_id, exc)

    def flush(self, timeout: float = 10.0) -> None:
        self._producer.flush(timeout=timeout)

    def close(self) -> None:
        self.flush()

    @staticmethod
    def _on_delivery(err, msg) -> None:
        if err:
            logger.error("ml_producer: delivery failed topic=%s err=%s", msg.topic(), err)
        else:
            logger.debug(
                "ml_producer: delivered event_id implicit topic=%s part=%d offset=%d",
                msg.topic(), msg.partition(), msg.offset(),
            )
