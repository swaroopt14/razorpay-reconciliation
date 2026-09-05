"""
Razorpay settlement recon backfill DAG.

Calls zord-outcome-engine only. Never calls Razorpay APIs.
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
    "retry_delay": timedelta(minutes=2),
}

with DAG(
    dag_id="razorpay_settlement_backfill_dag",
    default_args=default_args,
    description="Razorpay settlement recon backfill via outcome-engine",
    schedule=timedelta(hours=1),
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["zord", "razorpay", "settlement", "backfill"],
) as dag:

    check_health = HttpSensor(
        task_id="check_outcome_engine_health",
        http_conn_id=ZORD_OUTCOME_ENGINE_CONN_ID,
        endpoint="/v1/health",
        poke_interval=15,
        timeout=90,
        mode="reschedule",
    )

    def _create(**context):
        lookback_days = int(Variable.get("razorpay_settlement_lookback_days", default="2"))
        now = datetime.now(timezone.utc)
        window_to = now.isoformat().replace("+00:00", "Z")
        window_from = (now - timedelta(days=lookback_days)).isoformat().replace("+00:00", "Z")
        return create_and_trigger_backfill(
            resource_type="settlements",
            window_from=window_from,
            window_to=window_to,
            **context,
        )

    create_job = PythonOperator(
        task_id="create_settlement_day_jobs",
        python_callable=_create,
    )

    wait_job = PythonOperator(
        task_id="wait_for_job_completion",
        python_callable=wait_for_backfill,
    )

    freshness = PythonOperator(
        task_id="run_settlement_freshness_check",
        python_callable=run_freshness_check,
    )

    check_health >> create_job >> wait_job >> freshness
