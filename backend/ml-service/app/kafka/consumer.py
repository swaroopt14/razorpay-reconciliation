"""
Kafka consumer for ml.request.events.

Provides at-least-once delivery via manual commit.  Uses exponential back-off
on transient errors so a Kafka restart does not kill the service.  Poison
messages (parse failures) are committed and skipped — they are never retried —
to prevent a single bad message from blocking the entire partition.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Callable

from confluent_kafka import Consumer, KafkaError, KafkaException

from app import config
from app.schemas import MLRequest

logger = logging.getLogger(__name__)

_INITIAL_BACKOFF = 2
_MAX_BACKOFF = 30
_POLL_TIMEOUT = 3.0


class MLConsumer:
    def __init__(self, handler: Callable[[MLRequest], None]) -> None:
        self._handler = handler

        kafka_config = {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "group.id": config.KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,      # manual commit — at-least-once
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
                logger.error("ml_consumer: kafka error — retrying in %ds: %s", backoff, exc)
                time.sleep(backoff)
                backoff = min(backoff * 2, _MAX_BACKOFF)
            except Exception as exc:
                logger.exception("ml_consumer: unexpected error — retrying in %ds", backoff)
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

            try:
                raw = json.loads(msg.value().decode("utf-8"))
                req = MLRequest.from_dict(raw)
                logger.debug("ml_consumer: dispatching event_id=%s type=%s", req.event_id, req.event_type)
                self._handler(req)
            except Exception as exc:
                # Log and commit so the bad message doesn't block the partition
                logger.error(
                    "ml_consumer: failed to process offset=%d: %s",
                    msg.offset(), exc,
                )
            finally:
                self._consumer.commit(message=msg, asynchronous=False)
