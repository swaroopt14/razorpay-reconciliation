"""
Kafka consumer for ml.request.events.

Provides at-least-once delivery via manual commit. Offsets are committed only
after successful handling, or after an invalid message is acknowledged by the
DLQ. Retryable failures rewind the partition to the failed offset.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Callable, Optional

from confluent_kafka import Consumer, KafkaError, KafkaException, TopicPartition

from app import config
from app.exceptions import NonRetryableMessageError
from app.schemas import MLRequest

logger = logging.getLogger(__name__)

_INITIAL_BACKOFF = 2
_MAX_BACKOFF = 30
_POLL_TIMEOUT = 3.0


class MLConsumer:
    def __init__(
        self,
        handler: Callable[[MLRequest], None],
        dead_letter_handler: Optional[Callable[[bytes, str, str, int, int], None]] = None,
    ) -> None:
        self._handler = handler
        self._dead_letter_handler = dead_letter_handler
        kafka_config = {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "group.id": config.KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
            "max.poll.interval.ms": 300_000,
            "session.timeout.ms": 30_000,
            "heartbeat.interval.ms": 10_000,
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

        self._consumer = Consumer(kafka_config)

    def start(self) -> None:
        """Block forever, consuming messages and dispatching to handler."""
        self._consumer.subscribe([config.ML_REQUEST_TOPIC])
        logger.info("ml_consumer: subscribed to topic=%s group=%s",
                    config.ML_REQUEST_TOPIC, config.KAFKA_GROUP_ID)

        backoff = _INITIAL_BACKOFF
        while True:
            try:
                self._poll_loop()
                backoff = _INITIAL_BACKOFF
            except KafkaException as exc:
                logger.error("ml_consumer: kafka error - retrying in %ds: %s", backoff, exc)
                time.sleep(backoff)
                backoff = min(backoff * 2, _MAX_BACKOFF)
            except Exception:
                logger.exception("ml_consumer: unexpected error - retrying in %ds", backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, _MAX_BACKOFF)

    def close(self) -> None:
        try:
            self._consumer.close()
        except Exception:
            pass

    def _poll_loop(self) -> None:
        while True:
            msg = self._consumer.poll(timeout=_POLL_TIMEOUT)
            if msg is None:
                continue

            if msg.error():
                code = msg.error().code()
                if code == KafkaError._PARTITION_EOF:
                    continue
                raise KafkaException(msg.error())

            self._process_message(msg)

    def _process_message(self, msg) -> None:
        raw_payload = msg.value() or b""
        try:
            raw = json.loads(raw_payload.decode("utf-8"))
            req = MLRequest.from_dict(raw)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            self._dead_letter_and_commit(msg, raw_payload, exc)
            return

        try:
            logger.debug("ml_consumer: dispatching event_id=%s type=%s", req.event_id, req.event_type)
            self._handler(req)
        except NonRetryableMessageError as exc:
            self._dead_letter_and_commit(msg, raw_payload, exc)
            return
        except Exception:
            self._rewind(msg)
            logger.exception(
                "ml_consumer: retryable processing failure topic=%s partition=%d offset=%d",
                msg.topic(), msg.partition(), msg.offset(),
            )
            raise

        try:
            self._consumer.commit(message=msg, asynchronous=False)
        except Exception:
            self._rewind(msg)
            raise

    def _dead_letter_and_commit(self, msg, raw_payload: bytes, exc: Exception) -> None:
        if self._dead_letter_handler is None:
            self._rewind(msg)
            raise exc

        try:
            self._dead_letter_handler(
                raw_payload,
                f"{type(exc).__name__}: {exc}",
                msg.topic(),
                msg.partition(),
                msg.offset(),
            )
            self._consumer.commit(message=msg, asynchronous=False)
            logger.warning(
                "ml_consumer: dead-lettered topic=%s partition=%d offset=%d error=%s",
                msg.topic(), msg.partition(), msg.offset(), exc,
            )
        except Exception:
            self._rewind(msg)
            raise

    def _rewind(self, msg) -> None:
        self._consumer.seek(TopicPartition(msg.topic(), msg.partition(), msg.offset()))
