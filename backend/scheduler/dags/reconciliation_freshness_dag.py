"""
Reconciliation freshness DAG.

Compares API observations against webhook receipts via outcome-engine.
Does not fetch Razorpay.
"""

from datetime import datetime, timedelta
from airflow.sdk import DAG
from airflow.providers.standard.operators.python import PythonOperator
from airflow.providers.http.sensors.http import HttpSensor

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, '/opt/airflow/plugins')

from operators.zord_backfill_operator import (
    ZORD_OUTCOME_ENGINE_CONN_ID,
    run_freshness_check,
    run_recon,
)

default_args = {
    "owner": "zord-platform",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=1),
}

with DAG(
    dag_id="reconciliation_freshness_dag",
    default_args=default_args,
    description="API vs webhook freshness via outcome-engine",
    schedule=timedelta(minutes=30),
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["zord", "razorpay", "freshness"],
) as dag:

    check_health = HttpSensor(
        task_id="check_outcome_engine_health",
        http_conn_id=ZORD_OUTCOME_ENGINE_CONN_ID,
        endpoint="/v1/health",
        poke_interval=10,
        timeout=60,
        mode="reschedule",
    )

    freshness = PythonOperator(
        task_id="run_freshness",
        python_callable=run_freshness_check,
    )

    recon = PythonOperator(
        task_id="run_recon",
        python_callable=run_recon,
    )

    check_health >> freshness >> recon
