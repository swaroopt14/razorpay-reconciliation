"""
Razorpay payment backfill DAG.

Schedules a bounded overlapping payment window and calls zord-outcome-engine.
Never talks to Razorpay APIs directly.
"""

from datetime import datetime, timedelta, timezone
from airflow.sdk import DAG, Variable
from airflow.providers.standard.operators.python import PythonOperator
from airflow.providers.http.sensors.http import HttpSensor

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, '/opt/airflow/plugins')

from operators.zord_backfill_operator import (
    ZORD_OUTCOME_ENGINE_CONN_ID,
    create_and_trigger_backfill,
    wait_for_backfill,
    run_freshness_check,
)

default_args = {
    "owner": "zord-platform",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(seconds=30),
    "retry_exponential_backoff": True,
}

with DAG(
    dag_id="razorpay_payment_backfill_dag",
    default_args=default_args,
    description="Razorpay payment API backfill via outcome-engine",
    schedule=timedelta(minutes=15),
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["zord", "razorpay", "backfill"],
) as dag:

    check_health = HttpSensor(
        task_id="check_outcome_engine_health",
        http_conn_id=ZORD_OUTCOME_ENGINE_CONN_ID,
        endpoint="/v1/health",
        poke_interval=10,
        timeout=60,
        mode="reschedule",
    )

    def _create(**context):
        lookback_hours = int(Variable.get("razorpay_payment_lookback_hours", default="4"))
        now = datetime.now(timezone.utc)
        window_to = now.isoformat().replace("+00:00", "Z")
        window_from = (now - timedelta(hours=lookback_hours)).isoformat().replace("+00:00", "Z")
        return create_and_trigger_backfill(
            resource_type="payments",
            window_from=window_from,
            window_to=window_to,
            **context,
        )

    create_job = PythonOperator(
        task_id="create_payment_backfill_jobs",
        python_callable=_create,
    )

    wait_job = PythonOperator(
        task_id="wait_for_job_completion",
        python_callable=wait_for_backfill,
    )

    freshness = PythonOperator(
        task_id="run_payment_freshness_check",
        python_callable=run_freshness_check,
    )

    check_health >> create_job >> wait_job >> freshness
