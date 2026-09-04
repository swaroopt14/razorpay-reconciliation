"""
ml-service entrypoint.

Starts a Kafka consumer that reads ML requests, dispatches them to the
appropriate model (Isolation Forest, Z-Score, Logistic Regression), and
publishes results back to Kafka for the Go intelligence services to consume.
"""

from __future__ import annotations

import logging
import sys

from app.kafka.consumer import MLConsumer
from app.kafka.producer import MLProducer
from app.ml_service import MLService
from app.schemas import MLRequest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("ml-service: starting")

    producer = MLProducer()
    ml_service = MLService()

    def handle(req: MLRequest) -> None:
        result = ml_service.process(req)
        if result is not None:
            producer.publish_result(result)

    consumer = MLConsumer(handler=handle, dead_letter_handler=producer.publish_dead_letter)
    try:
        consumer.start()        # blocks until interrupted
    except KeyboardInterrupt:
        logger.info("ml-service: interrupted — shutting down")
    finally:
        ml_service.close()
        producer.close()
        consumer.close()
        logger.info("ml-service: stopped")


if __name__ == "__main__":
    main()
