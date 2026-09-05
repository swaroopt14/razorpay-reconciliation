"""
zord_intent_transform_dag

Drives post-canonicalization ETL for zord-intent-engine (Service 2).

What this DAG does:
  1. Checks intent-engine is healthy
  2. Calls POST /internal/airflow/transform — intent-engine fetches outbox
     events not yet ETL-scored (read-only, independent of zord-relay's
     delivery lease), scores already-canonical intents, promotes etl_ingest_runs
  3. Quality gates on parse_success_rate
  4. Alerts if below 0.98 threshold

What this DAG does NOT do:
  - Does not decrypt payloads (vault.DecryptPayload runs inside ProcessIncomingIntent)
  - Does not call ProcessIncomingIntent (that runs in the Kafka consumer)
  - Does not touch zord-edge at all
"""

from datetime import datetime, timedelta
from airflow.sdk import DAG
from airflow.providers.standard.operators.python import PythonOperator, BranchPythonOperator
from airflow.providers.standard.operators.empty import EmptyOperator
from airflow.providers.http.sensors.http import HttpSensor

import sys
import os
# Add both plugins and the root folder to path for internal imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, '/opt/airflow/plugins')

from operators.zord_transform_operator import ZordTransformOperator
from config.connections import ZORD_INTENT_ENGINE_CONN_ID, PARSE_SUCCESS_THRESHOLD

default_args = {
    "owner": "zord-platform", 
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(seconds=30),
    "retry_exponential_backoff": True,
}

with DAG(
    dag_id="zord_intent_transform_dag",
    default_args=default_args,
    description="Post-canonicalization ETL for Service 2 intent engine",
    schedule=timedelta(minutes=1),
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["zord", "intent", "etl", "service-2"],
) as dag:

    check_health = HttpSensor(
        task_id="check_intent_engine_health",
        http_conn_id=ZORD_INTENT_ENGINE_CONN_ID,
        endpoint="/health",
        response_check=lambda r: r.json().get("status") == "healthy",
        poke_interval=10,
        timeout=60,
        mode="reschedule",
    )

    transform = ZordTransformOperator(
        task_id="etl_transform_batch",
        conn_id=ZORD_INTENT_ENGINE_CONN_ID,
        limit=500,
        lease_ttl_seconds=300,
        parse_success_threshold=PARSE_SUCCESS_THRESHOLD,
    )

    def _quality_branch(ti):
        below = ti.xcom_pull(task_ids="etl_transform_batch", key="below_threshold")
        return "alert_low_quality" if below else "etl_success"

    quality_gate = BranchPythonOperator(
        task_id="quality_gate",
        python_callable=_quality_branch,
    )

    etl_success = EmptyOperator(task_id="etl_success")

    def _alert(ti):
        rate = ti.xcom_pull(task_ids="etl_transform_batch", key="parse_success_rate")
        leased = ti.xcom_pull(task_ids="etl_transform_batch", key="leased")
        print(
            f"[ALERT] parse_success_rate={rate:.3f} below threshold={PARSE_SUCCESS_THRESHOLD} "
            f"leased={leased} — ops review required"
        )
        # Production: call PagerDuty/Slack notifier here

    alert_low_quality = PythonOperator(
        task_id="alert_low_quality",
        python_callable=_alert,
    )

    check_health >> transform >> quality_gate >> [etl_success, alert_low_quality]
