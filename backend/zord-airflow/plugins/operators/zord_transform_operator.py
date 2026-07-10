from airflow.sdk import BaseOperator
from airflow.providers.http.hooks.http import HttpHook
from config.connections import (
    ZORD_INTENT_ENGINE_CONN_ID,
    TRANSFORM_ENDPOINT,
    PARSE_SUCCESS_THRESHOLD,
)

class ZordTransformOperator(BaseOperator):
    """
    Calls POST /internal/airflow/transform on zord-intent-engine.
    zord-intent-engine fetches outbox events that haven't been ETL-scored yet
    (tracked via etl_ingest_runs, independent of delivery status), runs
    quality scoring on already-canonical intents, and returns a summary.

    This is a read-only, non-leasing fetch — it does NOT lease/ack/nack the
    outbox, so it never competes with zord-relay's delivery pipeline for the
    same rows. `lease_ttl_seconds` is accepted for backward compatibility but
    has no effect server-side; it's kept as a template field so existing DAG
    configs don't need to change.

    This operator does NOT decrypt anything.
    Decryption happened upstream inside ProcessIncomingIntent (Kafka consumer).
    This operator only drives the post-canonicalization ETL stage.
    """

    template_fields = ("limit", "lease_ttl_seconds")

    def __init__(
        self,
        *,
        conn_id: str = ZORD_INTENT_ENGINE_CONN_ID,
        limit: int = 500,
        lease_ttl_seconds: int = 300,
        parse_success_threshold: float = PARSE_SUCCESS_THRESHOLD,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.conn_id = conn_id
        self.limit = limit
        self.lease_ttl_seconds = lease_ttl_seconds
        self.parse_success_threshold = parse_success_threshold

    def execute(self, context):
        hook = HttpHook(method="POST", http_conn_id=self.conn_id)

        response = hook.run(
            endpoint=f"{TRANSFORM_ENDPOINT}?limit={self.limit}&lease_ttl_seconds={self.lease_ttl_seconds}",
            headers={
                "Content-Type": "application/json",
                "X-Relay-Instance-ID": f"airflow-task-{context['task_instance_key_str']}",
            },
        )

        result = response.json()
        self.log.info(
            "Transform complete: leased=%d accepted=%d failed=%d parse_success_rate=%.3f",
            result.get("leased", 0),
            result.get("accepted", 0),
            result.get("failed", 0),
            result.get("parse_success_rate", 1.0),
        )

        below = result.get("parse_success_rate", 1.0) < self.parse_success_threshold
        context["ti"].xcom_push(key="parse_success_rate", value=result.get("parse_success_rate"))
        context["ti"].xcom_push(key="below_threshold", value=below)
        context["ti"].xcom_push(key="leased", value=result.get("leased", 0))

        return result
