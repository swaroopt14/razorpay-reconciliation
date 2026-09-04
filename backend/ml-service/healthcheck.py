"""
Kafka connectivity health check.
Exits 0 if the broker is reachable, 1 otherwise.
Used by Docker HEALTHCHECK instead of the shallow import check.
"""
import os
import sys

from app import config
from app.model_registry import ModelRegistry
from confluent_kafka.admin import AdminClient

brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
try:
    client = AdminClient({
        "bootstrap.servers": brokers,
        "socket.timeout.ms": 5000,
        "api.version.request.timeout.ms": 5000,
    })
    meta = client.list_topics(timeout=5)
    if meta is not None:
        if config.MODEL_REGISTRY_REQUIRED:
            registry = ModelRegistry(
                config.INTELLIGENCE_DATABASE_URL,
                config.MODEL_REGISTRY_PUBLIC_KEY,
            )
            registry.verify_promotions()
        print("ok")
        sys.exit(0)
    sys.exit(1)
except Exception as exc:
    print(f"unhealthy: {exc}", file=sys.stderr)
    sys.exit(1)
