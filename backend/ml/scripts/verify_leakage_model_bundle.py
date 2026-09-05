"""
Verify that the exported leakage joblib bundle matches the saved CatBoost model.

Checks:
  - prediction parity on the synthetic combined dataset
  - prediction parity on the 18 real uploaded batch rows
  - metric parity on both datasets
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "generated" / "leakage_training" / "models"
CBM_PATH = MODEL_DIR / "leakage_catboost_regressor.cbm"
BUNDLE_PATH = MODEL_DIR / "leakage_prediction_bundle.joblib"
COMBINED_PATH = ROOT / "generated" / "leakage_training" / "synthetic" / "combined_model_ready_378.csv"
REAL_PATH = ROOT / "generated" / "leakage_training" / "extracted" / "training_dataset_full.csv"


def clip_rate(values: np.ndarray) -> np.ndarray:
    return np.clip(values, 0.0, 1.0)


def evaluate(y_true_rate: np.ndarray, y_pred_rate: np.ndarray, intended_amount: np.ndarray) -> dict[str, float]:
    y_pred_rate = clip_rate(y_pred_rate)
    y_true_amount = y_true_rate * intended_amount
    y_pred_amount = y_pred_rate * intended_amount
    return {
        "rate_mae": float(mean_absolute_error(y_true_rate, y_pred_rate)),
        "rate_rmse": float(math.sqrt(mean_squared_error(y_true_rate, y_pred_rate))),
        "rate_r2": float(r2_score(y_true_rate, y_pred_rate)),
        "amount_mae_minor": float(mean_absolute_error(y_true_amount, y_pred_amount)),
    }


def main() -> None:
    bundle = joblib.load(BUNDLE_PATH)
    bundle_model = bundle["model"]
    feature_columns = bundle["feature_columns"]
    target_column = bundle["target_column"]

    cbm_model = CatBoostRegressor()
    cbm_model.load_model(str(CBM_PATH))

    datasets: list[tuple[str, Path]] = [
        ("combined", COMBINED_PATH),
        ("real_uploaded_batches", REAL_PATH),
    ]

    report: dict[str, object] = {
        "bundle_path": str(BUNDLE_PATH.relative_to(ROOT)),
        "cbm_path": str(CBM_PATH.relative_to(ROOT)),
        "bundle_version": bundle["bundle_version"],
        "datasets": {},
    }

    for dataset_name, path in datasets:
        df = pd.read_csv(path)
        X = df[feature_columns]
        y = df[target_column].to_numpy(dtype=float)
        intended_amount = df["batch_total_intended_amount_minor"].to_numpy(dtype=float)

        cbm_pred = clip_rate(np.asarray(cbm_model.predict(X), dtype=float))
        bundle_pred = clip_rate(np.asarray(bundle_model.predict(X), dtype=float))

        max_abs_delta = float(np.max(np.abs(cbm_pred - bundle_pred)))
        mean_abs_delta = float(np.mean(np.abs(cbm_pred - bundle_pred)))

        cbm_metrics = evaluate(y, cbm_pred, intended_amount)
        bundle_metrics = evaluate(y, bundle_pred, intended_amount)
        metric_deltas = {
            key: float(abs(cbm_metrics[key] - bundle_metrics[key]))
            for key in cbm_metrics
        }

        report["datasets"][dataset_name] = {
            "rows": int(len(df)),
            "max_abs_prediction_delta": max_abs_delta,
            "mean_abs_prediction_delta": mean_abs_delta,
            "cbm_metrics": cbm_metrics,
            "bundle_metrics": bundle_metrics,
            "metric_abs_deltas": metric_deltas,
        }

    out_path = MODEL_DIR / "bundle_parity_report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
