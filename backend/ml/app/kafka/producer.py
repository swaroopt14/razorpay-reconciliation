"""
Kafka producer for ML result and dead-letter events.

Uses idempotent, acknowledged delivery. A publish call returns only after Kafka
confirms the record, so the request consumer can safely commit its offset.
"""

from __future__ import annotations

import json
import logging
import time
from hashlib import sha256
from typing import Any

from confluent_kafka import KafkaException, Producer as _KafkaProducer

from app import config
from app.schemas import MLResult

logger = logging.getLogger(__name__)

_PUBLISH_TIMEOUT = 15.0


class MLProducer:
    def __init__(self) -> None:
        kafka_config = {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "acks": "all",
            "enable.idempotence": True,
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

    def publish_result(self, result: MLResult, timeout: float = _PUBLISH_TIMEOUT) -> None:
        """Publish a result and return only after the broker acknowledges it."""
        payload = json.dumps(result.to_dict()).encode("utf-8")
        self._publish_and_wait(
            topic=config.ML_RESULT_TOPIC,
            key=result.tenant_id.encode("utf-8"),
            payload=payload,
            record_id=result.prediction_id,
            timeout=timeout,
        )

    def publish_dead_letter(
        self,
        raw_payload: bytes,
        error: str,
        source_topic: str,
        partition: int,
        offset: int,
        timeout: float = _PUBLISH_TIMEOUT,
    ) -> None:
        """Durably publish a rejected request before its source offset is committed."""
        payload_hash = sha256(raw_payload).hexdigest()
        payload = json.dumps({
            "payload_sha256": payload_hash,
            "raw_payload": raw_payload.decode("utf-8", errors="replace"),
            "error": error,
            "source_topic": source_topic,
            "source_partition": partition,
            "source_offset": offset,
            "failed_at": int(time.time()),
        }).encode("utf-8")
        self._publish_and_wait(
            topic=config.ML_DLQ_TOPIC,
            key=payload_hash.encode("utf-8"),
            payload=payload,
            record_id=payload_hash,
            timeout=timeout,
        )

    def flush(self, timeout: float = 10.0) -> None:
        self._producer.flush(timeout=timeout)

    def close(self) -> None:
        self.flush()

    def _publish_and_wait(
        self,
        topic: str,
        key: bytes,
        payload: bytes,
        record_id: str,
        timeout: float,
    ) -> None:
        delivered = False
        delivery_error: Any = None

        def on_delivery(err, msg) -> None:
            nonlocal delivered, delivery_error
            delivery_error = err
            delivered = True
            if err is None:
                logger.debug(
                    "ml_producer: delivered record_id=%s topic=%s part=%d offset=%d",
                    record_id, msg.topic(), msg.partition(), msg.offset(),
                )

        self._producer.produce(
            topic=topic,
            key=key,
            value=payload,
            on_delivery=on_delivery,
        )

        deadline = time.monotonic() + timeout
        while not delivered:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(
                    f"timed out waiting for Kafka delivery record_id={record_id} topic={topic}"
                )
            self._producer.poll(min(0.1, remaining))

        if delivery_error is not None:
            raise KafkaException(delivery_error)
