"""
Evaluate the trained leakage regression model and compare predictions on the
real uploaded anchor batches against truth and system-produced labels.

Outputs under backend/generated/leakage_training/models/evaluation:
  - evaluation_summary.json
  - evaluation_report.md
  - real_batch_prediction_comparison.csv
  - real_batch_family_summary.csv
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "generated" / "leakage_training" / "models" / "leakage_catboost_regressor.cbm"
TRAINING_SUMMARY_PATH = ROOT / "generated" / "leakage_training" / "models" / "training_summary.json"
OOF_PATH = ROOT / "generated" / "leakage_training" / "models" / "oof_predictions.csv"
COMBINED_PATH = ROOT / "generated" / "leakage_training" / "synthetic" / "combined_model_ready_378.csv"
REAL_FULL_PATH = ROOT / "generated" / "leakage_training" / "extracted" / "training_dataset_full.csv"
BATCH_INDEX_PATH = ROOT / "generated" / "leakage_training" / "batch_index.csv"
OUTPUT_DIR = ROOT / "generated" / "leakage_training" / "models" / "evaluation"

FEATURE_COLUMNS = [
    "batch_total_intended_amount_minor",
    "batch_intent_count",
    "batch_avg_amount_minor",
    "batch_max_amount_minor",
    "batch_min_amount_minor",
    "batch_amount_stddev",
    "batch_same_beneficiary_amount_density",
    "batch_max_pair_count",
    "client_payout_ref_coverage_rate",
    "currency",
    "source_system",
    "rail",
    "created_hour",
    "created_day_of_week",
    "weekend_flag",
    "intent_type",
    "parse_success_rate",
    "mapping_confidence_score",
    "required_field_completeness_rate",
    "canonicalization_error_rate",
    "missing_required_field_rate",
    "unknown_column_count",
    "invalid_amount_rate",
    "invalid_beneficiary_rate",
    "provider_key",
    "provider_missing_provider_ref_rate",
    "provider_missing_client_ref_rate",
    "provider_settlement_delay_p50_days",
    "provider_settlement_delay_p95_days",
    "settlement_delay_p50_days",
    "settlement_delay_p95_days",
]

TARGET_COLUMN = "predicted_leakage_rate"
WEIGHT_COLUMN = "sample_weight"
AMOUNT_COLUMN = "batch_total_intended_amount_minor"


def clip_rate(values: np.ndarray) -> np.ndarray:
    return np.clip(values, 0.0, 1.0)


def rate_to_amount(rate: np.ndarray, intended_amount: np.ndarray) -> np.ndarray:
    return clip_rate(rate) * intended_amount


def weighted_rmse(y_true: np.ndarray, y_pred: np.ndarray, weights: np.ndarray) -> float:
    return float(math.sqrt(np.average((y_true - y_pred) ** 2, weights=weights)))


def weighted_wape(y_true: np.ndarray, y_pred: np.ndarray, weights: np.ndarray) -> float:
    numerator = float(np.sum(weights * np.abs(y_true - y_pred)))
    denominator = float(np.sum(weights * np.abs(y_true)))
    if denominator == 0.0:
        return 0.0
    return numerator / denominator


def evaluate_predictions(
    y_true_rate: np.ndarray,
    y_pred_rate: np.ndarray,
    intended_amount: np.ndarray,
    weights: np.ndarray,
) -> dict[str, float]:
    y_pred_rate = clip_rate(y_pred_rate)
    y_true_amount = y_true_rate * intended_amount
    y_pred_amount = rate_to_amount(y_pred_rate, intended_amount)
    return {
        "rows": float(len(y_true_rate)),
        "rate_mae": float(mean_absolute_error(y_true_rate, y_pred_rate)),
        "rate_weighted_mae": float(np.average(np.abs(y_true_rate - y_pred_rate), weights=weights)),
        "rate_rmse": float(math.sqrt(mean_squared_error(y_true_rate, y_pred_rate))),
        "rate_weighted_rmse": weighted_rmse(y_true_rate, y_pred_rate, weights),
        "rate_r2": float(r2_score(y_true_rate, y_pred_rate)),
        "amount_mae_minor": float(mean_absolute_error(y_true_amount, y_pred_amount)),
        "amount_weighted_mae_minor": float(np.average(np.abs(y_true_amount - y_pred_amount), weights=weights)),
        "amount_wape": weighted_wape(y_true_amount, y_pred_amount, weights),
    }


def model_predict(df: pd.DataFrame) -> np.ndarray:
    model = CatBoostRegressor()
    model.load_model(str(MODEL_PATH))
    return clip_rate(model.predict(df[FEATURE_COLUMNS]))


def real_batch_family_summary(comparison_df: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, float | str]] = []
    for family, family_df in comparison_df.groupby("batch_template"):
        truth_rate = family_df["truth_predicted_leakage_rate"].to_numpy(dtype=float)
        truth_amount = family_df["truth_total_leakage_amount_minor"].to_numpy(dtype=float)
        intended = family_df[AMOUNT_COLUMN].to_numpy(dtype=float)
        weights = np.ones(len(family_df), dtype=float)
        model_rate = family_df["model_predicted_leakage_rate"].to_numpy(dtype=float)
        model_oof_rate = family_df["model_oof_predicted_leakage_rate"].to_numpy(dtype=float)
        system_rate = family_df["system_predicted_leakage_rate"].fillna(0.0).to_numpy(dtype=float)

        model_metrics = evaluate_predictions(truth_rate, model_rate, intended, weights)
        oof_metrics = evaluate_predictions(truth_rate, model_oof_rate, intended, weights)
        system_metrics = evaluate_predictions(truth_rate, system_rate, intended, weights)

        rows.append({
            "batch_template": str(family),
            "rows": int(len(family_df)),
            "truth_total_leakage_amount_minor_sum": float(np.sum(truth_amount)),
            "model_rate_mae": model_metrics["rate_mae"],
            "model_rate_r2": model_metrics["rate_r2"],
            "model_amount_mae_minor": model_metrics["amount_mae_minor"],
            "model_oof_rate_mae": oof_metrics["rate_mae"],
            "model_oof_rate_r2": oof_metrics["rate_r2"],
            "model_oof_amount_mae_minor": oof_metrics["amount_mae_minor"],
            "system_rate_mae": system_metrics["rate_mae"],
            "system_rate_r2": system_metrics["rate_r2"],
            "system_amount_mae_minor": system_metrics["amount_mae_minor"],
        })
    return pd.DataFrame(rows).sort_values("batch_template").reset_index(drop=True)


def build_real_batch_comparison() -> tuple[pd.DataFrame, pd.DataFrame]:
    real_df = pd.read_csv(REAL_FULL_PATH)
    batch_index = pd.read_csv(BATCH_INDEX_PATH)
    oof_df = pd.read_csv(OOF_PATH)
    batch_index_subset = batch_index[[
        "batch_id",
        "intent_file",
        "settlement_truth_file",
        "settlement_replay_file",
        "expected_leakage_rate",
        "expected_total_leakage_amount",
        "expected_unmatched_amount",
        "expected_under_settlement_amount",
        "expected_reversal_amount",
    ]].copy()

    model_preds = model_predict(real_df)
    real_df = real_df.copy()
    real_df["model_predicted_leakage_rate"] = model_preds
    real_df["model_predicted_leakage_amount_minor"] = rate_to_amount(model_preds, real_df[AMOUNT_COLUMN].to_numpy(dtype=float))

    anchor_oof = oof_df[oof_df["row_id"].astype(str).str.startswith("anchor::")].copy()
    anchor_oof = anchor_oof.rename(columns={
        "predicted_leakage_rate_oof": "model_oof_predicted_leakage_rate",
        "predicted_leakage_amount_minor_oof": "model_oof_predicted_leakage_amount_minor",
        "abs_rate_error": "model_oof_abs_rate_error",
        "abs_amount_error_minor": "model_oof_abs_amount_error_minor",
    })
    anchor_oof = anchor_oof[[
        "batch_id",
        "model_oof_predicted_leakage_rate",
        "model_oof_predicted_leakage_amount_minor",
        "model_oof_abs_rate_error",
        "model_oof_abs_amount_error_minor",
    ]]

    comparison = real_df.merge(batch_index_subset, on="batch_id", how="left")
    comparison = comparison.merge(anchor_oof, on="batch_id", how="left")
    comparison["truth_predicted_leakage_rate"] = comparison["predicted_leakage_rate"]
    comparison["model_abs_rate_error"] = np.abs(
        comparison["truth_predicted_leakage_rate"] - comparison["model_predicted_leakage_rate"]
    )
    comparison["model_abs_amount_error_minor"] = np.abs(
        comparison["truth_total_leakage_amount_minor"] - comparison["model_predicted_leakage_amount_minor"]
    )
    comparison["system_abs_rate_error"] = np.abs(
        comparison["truth_predicted_leakage_rate"] - comparison["system_predicted_leakage_rate"].fillna(0.0)
    )
    comparison["system_abs_amount_error_minor"] = np.abs(
        comparison["truth_total_leakage_amount_minor"] - comparison["system_total_leakage_amount_minor"].fillna(0.0)
    )

    comparison["intent_file"] = comparison["intent_file"].fillna("").map(
        lambda value: str((ROOT / "generated" / "leakage_training" / value).resolve()) if value else ""
    )
    comparison["settlement_truth_file"] = comparison["settlement_truth_file"].fillna("").map(
        lambda value: str((ROOT / "generated" / "leakage_training" / value).resolve()) if value else ""
    )
    comparison["settlement_replay_file"] = comparison["settlement_replay_file"].fillna("").map(
        lambda value: str((ROOT / "generated" / "leakage_training" / value).resolve()) if value else ""
    )

    selected_columns = [
        "batch_id",
        "runtime_batch_id",
        "batch_template",
        "batch_anchor_date",
        "runtime_anchor_date",
        "batch_intent_count",
        AMOUNT_COLUMN,
        "expected_unmatched_amount",
        "expected_under_settlement_amount",
        "expected_reversal_amount",
        "truth_predicted_leakage_rate",
        "truth_total_leakage_amount_minor",
        "model_predicted_leakage_rate",
        "model_predicted_leakage_amount_minor",
        "model_abs_rate_error",
        "model_abs_amount_error_minor",
        "model_oof_predicted_leakage_rate",
        "model_oof_predicted_leakage_amount_minor",
        "model_oof_abs_rate_error",
        "model_oof_abs_amount_error_minor",
        "system_predicted_leakage_rate",
        "system_total_leakage_amount_minor",
        "system_abs_rate_error",
        "system_abs_amount_error_minor",
        "best_system_label_source",
        "intent_file",
        "settlement_truth_file",
        "settlement_replay_file",
    ]
    comparison = comparison[selected_columns].sort_values("batch_id").reset_index(drop=True)
    family_summary = real_batch_family_summary(real_df.merge(anchor_oof, on="batch_id", how="left"))
    return comparison, family_summary


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    combined_df = pd.read_csv(COMBINED_PATH)
    real_df = pd.read_csv(REAL_FULL_PATH)
    training_summary = json.loads(TRAINING_SUMMARY_PATH.read_text(encoding="utf-8"))

    combined_preds = model_predict(combined_df)
    real_preds = model_predict(real_df)

    combined_metrics = evaluate_predictions(
        combined_df[TARGET_COLUMN].to_numpy(dtype=float),
        combined_preds,
        combined_df[AMOUNT_COLUMN].to_numpy(dtype=float),
        combined_df[WEIGHT_COLUMN].to_numpy(dtype=float),
    )
    anchor_mask = combined_df["synthetic_flag"].astype(int) == 0
    synthetic_mask = combined_df["synthetic_flag"].astype(int) == 1

    anchor_fit_metrics = evaluate_predictions(
        combined_df.loc[anchor_mask, TARGET_COLUMN].to_numpy(dtype=float),
        combined_preds[anchor_mask.to_numpy()],
        combined_df.loc[anchor_mask, AMOUNT_COLUMN].to_numpy(dtype=float),
        combined_df.loc[anchor_mask, WEIGHT_COLUMN].to_numpy(dtype=float),
    )
    synthetic_fit_metrics = evaluate_predictions(
        combined_df.loc[synthetic_mask, TARGET_COLUMN].to_numpy(dtype=float),
        combined_preds[synthetic_mask.to_numpy()],
        combined_df.loc[synthetic_mask, AMOUNT_COLUMN].to_numpy(dtype=float),
        combined_df.loc[synthetic_mask, WEIGHT_COLUMN].to_numpy(dtype=float),
    )

    real_comparison_df, family_summary_df = build_real_batch_comparison()

    oof_anchor_metrics = evaluate_predictions(
        real_comparison_df["truth_predicted_leakage_rate"].to_numpy(dtype=float),
        real_comparison_df["model_oof_predicted_leakage_rate"].to_numpy(dtype=float),
        real_comparison_df[AMOUNT_COLUMN].to_numpy(dtype=float),
        np.ones(len(real_comparison_df), dtype=float),
    )
    real_fit_metrics = evaluate_predictions(
        real_df[TARGET_COLUMN].to_numpy(dtype=float),
        real_preds,
        real_df[AMOUNT_COLUMN].to_numpy(dtype=float),
        np.ones(len(real_df), dtype=float),
    )
    system_real_metrics = evaluate_predictions(
        real_comparison_df["truth_predicted_leakage_rate"].to_numpy(dtype=float),
        real_comparison_df["system_predicted_leakage_rate"].fillna(0.0).to_numpy(dtype=float),
        real_comparison_df[AMOUNT_COLUMN].to_numpy(dtype=float),
        np.ones(len(real_comparison_df), dtype=float),
    )

    summary = {
        "model_path": str(MODEL_PATH.relative_to(ROOT)),
        "data_sources": {
            "combined_csv": str(COMBINED_PATH.relative_to(ROOT)),
            "real_uploaded_batches_csv": str(REAL_FULL_PATH.relative_to(ROOT)),
            "batch_index_csv": str(BATCH_INDEX_PATH.relative_to(ROOT)),
            "training_summary_json": str(TRAINING_SUMMARY_PATH.relative_to(ROOT)),
            "oof_predictions_csv": str(OOF_PATH.relative_to(ROOT)),
        },
        "training_cv_metrics": training_summary["cv_metrics"],
        "training_grouped_baseline_metrics": training_summary["grouped_baseline_metrics"],
        "full_fit_metrics_on_378_rows": combined_metrics,
        "anchor_fit_metrics_on_18_real_rows": anchor_fit_metrics,
        "synthetic_fit_metrics_on_360_rows": synthetic_fit_metrics,
        "real_uploaded_batches_fit_metrics": real_fit_metrics,
        "real_uploaded_batches_oof_metrics": oof_anchor_metrics,
        "real_uploaded_batches_system_metrics": system_real_metrics,
    }

    real_comparison_df.to_csv(OUTPUT_DIR / "real_batch_prediction_comparison.csv", index=False)
    family_summary_df.to_csv(OUTPUT_DIR / "real_batch_family_summary.csv", index=False)
    (OUTPUT_DIR / "evaluation_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    lines = [
        "# Leakage Model Evaluation",
        "",
        "## Data Used",
        f"- Combined training-style rows: `{len(combined_df)}`",
        f"- Real uploaded anchor batches: `{len(real_df)}`",
        f"- Model: `{MODEL_PATH.relative_to(ROOT)}`",
        "",
        "## Grouped Cross-Validation",
        f"- Rate weighted MAE: `{training_summary['cv_metrics']['rate_weighted_mae']:.4f}`",
        f"- Rate RMSE: `{training_summary['cv_metrics']['rate_rmse']:.4f}`",
        f"- Rate R-square: `{training_summary['cv_metrics']['rate_r2']:.4f}`",
        f"- Amount weighted MAE: `{training_summary['cv_metrics']['amount_weighted_mae_minor']:.2f}`",
        "",
        "## Grouped Baseline",
        f"- Rate weighted MAE: `{training_summary['grouped_baseline_metrics']['rate_weighted_mae']:.4f}`",
        f"- Rate R-square: `{training_summary['grouped_baseline_metrics']['rate_r2']:.4f}`",
        f"- Amount weighted MAE: `{training_summary['grouped_baseline_metrics']['amount_weighted_mae_minor']:.2f}`",
        "",
        "## In-Sample Fit On 378 Rows",
        f"- Rate MAE: `{combined_metrics['rate_mae']:.4f}`",
        f"- Rate RMSE: `{combined_metrics['rate_rmse']:.4f}`",
        f"- Rate R-square: `{combined_metrics['rate_r2']:.4f}`",
        f"- Amount MAE: `{combined_metrics['amount_mae_minor']:.2f}`",
        "",
        "## Real Uploaded Batches",
        "These are the 18 batch files that were actually uploaded during the earlier replay/extraction run.",
        f"- Final model fit on those 18 rows: rate MAE=`{real_fit_metrics['rate_mae']:.4f}`, rate R-square=`{real_fit_metrics['rate_r2']:.4f}`, amount MAE=`{real_fit_metrics['amount_mae_minor']:.2f}`",
        f"- Out-of-fold estimate on those same 18 rows: rate MAE=`{oof_anchor_metrics['rate_mae']:.4f}`, rate R-square=`{oof_anchor_metrics['rate_r2']:.4f}`, amount MAE=`{oof_anchor_metrics['amount_mae_minor']:.2f}`",
        f"- Current system label vs truth on those 18 rows: rate MAE=`{system_real_metrics['rate_mae']:.4f}`, rate R-square=`{system_real_metrics['rate_r2']:.4f}`, amount MAE=`{system_real_metrics['amount_mae_minor']:.2f}`",
        "",
        "## Outputs",
        f"- Comparison CSV: `{(OUTPUT_DIR / 'real_batch_prediction_comparison.csv').relative_to(ROOT)}`",
        f"- Family summary CSV: `{(OUTPUT_DIR / 'real_batch_family_summary.csv').relative_to(ROOT)}`",
        f"- JSON summary: `{(OUTPUT_DIR / 'evaluation_summary.json').relative_to(ROOT)}`",
    ]
    (OUTPUT_DIR / "evaluation_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
