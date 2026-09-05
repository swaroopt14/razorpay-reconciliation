"""
zord_intent_normalization_quality_dag

Monitors header normalization quality in zord-intent-engine.
Runs every 5 minutes. Reads quality metrics from the intent engine
and alerts if:
  - fuzzy match rate is high (>10% of fields matched via fuzzy)
  - unmapped field count is rising
  - parse_success_rate drops below 0.98

This DAG does NOT run normalization. Normalization runs synchronously
in Go inside ProcessIncomingIntent at Step 5.1.
Airflow only observes and alerts.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.providers.http.operators.http import HttpOperator

from config.connections import ZORD_INTENT_ENGINE_CONN_ID, PARSE_SUCCESS_THRESHOLD

default_args = {
    "owner": "zord-platform",
    "retries": 1,
    "retry_delay": timedelta(seconds=30),
}

with DAG(
    dag_id="zord_intent_normalization_quality_dag",
    default_args=default_args,
    description="Monitors header normalization quality — does not run normalization",
    schedule=timedelta(minutes=5),
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["zord", "intent", "normalization", "quality", "service-2"],
) as dag:

    # Fetch normalization quality metrics from intent engine
    fetch_quality = HttpOperator(
        task_id="fetch_normalization_quality",
        http_conn_id=ZORD_INTENT_ENGINE_CONN_ID,
        endpoint="/internal/normalization/quality",
        method="GET",
        response_filter=lambda r: r.json(),
        log_response=True,
    )

    def _check_quality(ti):
        metrics = ti.xcom_pull(task_ids="fetch_normalization_quality")
        if not metrics:
            return "quality_ok"
        fuzzy_rate   = metrics.get("fuzzy_match_rate", 0.0)
        unmapped_pct = metrics.get("unmapped_field_pct", 0.0)
        success_rate = metrics.get("parse_success_rate", 1.0)
        if (fuzzy_rate > 0.10 or unmapped_pct > 0.05 or success_rate < PARSE_SUCCESS_THRESHOLD):
            return "alert_normalization_degraded"
        return "quality_ok"

    quality_gate = BranchPythonOperator(
        task_id="normalization_quality_gate",
        python_callable=_check_quality,
    )

    quality_ok = EmptyOperator(task_id="quality_ok")

    def _alert(ti):
        metrics = ti.xcom_pull(task_ids="fetch_normalization_quality")
        print(
            f"[ALERT] Normalization quality degraded: "
            f"fuzzy_match_rate={metrics.get('fuzzy_match_rate', 0):.2%} "
            f"unmapped_field_pct={metrics.get('unmapped_field_pct', 0):.2%} "
            f"parse_success_rate={metrics.get('parse_success_rate', 1):.3f} "
            f"— review tenant_synonym_profiles or update synonym_dict.go"
        )

    alert_degraded = PythonOperator(
        task_id="alert_normalization_degraded",
        python_callable=_alert,
    )

    fetch_quality >> quality_gate >> [quality_ok, alert_degraded]
