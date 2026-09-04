"""
Train a batch-level leakage-rate regression model from the model-ready dataset.

The script is intentionally conservative about evaluation:
  - it predicts only from pre-settlement / historical-safe features
  - it uses GroupKFold on parent_batch_id so synthetic siblings never leak
    across train/validation folds
  - it respects sample_weight so the 18 true anchor batches count more than
    their synthetic descendants

Outputs:
  - leakage_catboost_regressor.cbm
  - feature_importance.csv
  - oof_predictions.csv
  - training_summary.json

Example:
    python backend/ml-service/scripts/train_leakage_model.py
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "generated" / "leakage_training" / "synthetic" / "combined_model_ready_378.csv"
DEFAULT_OUTPUT_DIR = ROOT / "generated" / "leakage_training" / "models"
SEED = 20260612
MODEL_BUNDLE_VERSION = "leakage_prediction_v1"

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

CATEGORICAL_COLUMNS = [
    "currency",
    "source_system",
    "rail",
    "intent_type",
    "provider_key",
]

SEGMENT_LEVELS = [
    ("source_system",),
    ("source_system", "rail"),
    ("source_system", "rail", "provider_key"),
]

TARGET_COLUMN = "predicted_leakage_rate"
GROUP_COLUMN = "parent_batch_id"
WEIGHT_COLUMN = "sample_weight"
AMOUNT_COLUMN = "batch_total_intended_amount_minor"
FAMILY_COLUMN = "scenario_family"
ROW_ID_COLUMN = "row_id"
BATCH_ID_COLUMN = "batch_id"

MISSING_CATEGORY_TOKENS = {"", "unknown", "na", "n/a", "null", "none"}


@dataclass(frozen=True)
class CandidateConfig:
    depth: int
    learning_rate: float
    l2_leaf_reg: float
    min_data_in_leaf: int
    random_strength: float
    bagging_temperature: float
    iterations: int = 700


def weighted_rmse(y_true: np.ndarray, y_pred: np.ndarray, weights: np.ndarray) -> float:
    return float(math.sqrt(np.average((y_true - y_pred) ** 2, weights=weights)))


def weighted_wape(y_true: np.ndarray, y_pred: np.ndarray, weights: np.ndarray) -> float:
    numerator = float(np.sum(weights * np.abs(y_true - y_pred)))
    denominator = float(np.sum(weights * np.abs(y_true)))
    if denominator == 0.0:
        return 0.0
    return numerator / denominator


def build_candidates() -> list[CandidateConfig]:
    return [
        CandidateConfig(depth=4, learning_rate=0.03, l2_leaf_reg=5.0, min_data_in_leaf=4, random_strength=0.5, bagging_temperature=0.0),
        CandidateConfig(depth=4, learning_rate=0.05, l2_leaf_reg=7.0, min_data_in_leaf=4, random_strength=1.0, bagging_temperature=0.2),
        CandidateConfig(depth=5, learning_rate=0.03, l2_leaf_reg=6.0, min_data_in_leaf=4, random_strength=0.5, bagging_temperature=0.5),
        CandidateConfig(depth=5, learning_rate=0.05, l2_leaf_reg=8.0, min_data_in_leaf=3, random_strength=1.0, bagging_temperature=0.5),
        CandidateConfig(depth=6, learning_rate=0.03, l2_leaf_reg=8.0, min_data_in_leaf=3, random_strength=1.5, bagging_temperature=0.75),
        CandidateConfig(depth=6, learning_rate=0.05, l2_leaf_reg=10.0, min_data_in_leaf=2, random_strength=2.0, bagging_temperature=1.0),
    ]


def validate_columns(df: pd.DataFrame) -> None:
    required = set(FEATURE_COLUMNS + [TARGET_COLUMN, GROUP_COLUMN, WEIGHT_COLUMN, AMOUNT_COLUMN, FAMILY_COLUMN, ROW_ID_COLUMN, BATCH_ID_COLUMN])
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")


def load_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    validate_columns(df)
    normalized = df.copy()
    for col in CATEGORICAL_COLUMNS:
        normalized[col] = normalized[col].map(normalize_categorical_value)
        normalized[col] = normalized[col].fillna("unknown")
    return normalized


def normalize_categorical_value(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in MISSING_CATEGORY_TOKENS:
        return None
    return text


def build_model(config: CandidateConfig) -> CatBoostRegressor:
    return CatBoostRegressor(
        loss_function="MAE",
        eval_metric="MAE",
        random_seed=SEED,
        depth=config.depth,
        learning_rate=config.learning_rate,
        l2_leaf_reg=config.l2_leaf_reg,
        min_data_in_leaf=config.min_data_in_leaf,
        random_strength=config.random_strength,
        bagging_temperature=config.bagging_temperature,
        iterations=config.iterations,
        od_type="Iter",
        od_wait=60,
        verbose=False,
        allow_writing_files=False,
    )


def clip_rate(values: np.ndarray) -> np.ndarray:
    return np.clip(values, 0.0, 1.0)


def rate_to_amount(rate: np.ndarray, intended_amount: np.ndarray) -> np.ndarray:
    return clip_rate(rate) * intended_amount


def evaluate_fold(
    y_true_rate: np.ndarray,
    y_pred_rate: np.ndarray,
    intended_amount: np.ndarray,
    weights: np.ndarray,
) -> dict[str, float]:
    y_pred_rate = clip_rate(y_pred_rate)
    y_true_amount = y_true_rate * intended_amount
    y_pred_amount = rate_to_amount(y_pred_rate, intended_amount)
    return {
        "rate_mae": float(mean_absolute_error(y_true_rate, y_pred_rate)),
        "rate_weighted_mae": float(np.average(np.abs(y_true_rate - y_pred_rate), weights=weights)),
        "rate_rmse": float(math.sqrt(mean_squared_error(y_true_rate, y_pred_rate))),
        "rate_weighted_rmse": weighted_rmse(y_true_rate, y_pred_rate, weights),
        "rate_r2": float(r2_score(y_true_rate, y_pred_rate)),
        "amount_mae_minor": float(mean_absolute_error(y_true_amount, y_pred_amount)),
        "amount_weighted_mae_minor": float(np.average(np.abs(y_true_amount - y_pred_amount), weights=weights)),
        "amount_wape": weighted_wape(y_true_amount, y_pred_amount, weights),
    }


def aggregate_metric_dicts(metric_dicts: list[dict[str, float]]) -> dict[str, float]:
    keys = metric_dicts[0].keys()
    return {key: float(np.mean([item[key] for item in metric_dicts])) for key in keys}


def baseline_cross_validate(df: pd.DataFrame, n_splits: int) -> dict[str, float]:
    splitter = GroupKFold(n_splits=n_splits)
    y = df[TARGET_COLUMN].to_numpy(dtype=float)
    groups = df[GROUP_COLUMN].astype(str).to_numpy()
    weights = df[WEIGHT_COLUMN].to_numpy(dtype=float)
    intended_amount = df[AMOUNT_COLUMN].to_numpy(dtype=float)
    fold_metrics: list[dict[str, float]] = []

    for train_idx, valid_idx in splitter.split(df[FEATURE_COLUMNS], y, groups):
        y_train = y[train_idx]
        w_train = weights[train_idx]
        baseline_rate = float(np.average(y_train, weights=w_train))
        pred_valid = np.full(len(valid_idx), baseline_rate, dtype=float)
        fold_metrics.append(
            evaluate_fold(
                y_true_rate=y[valid_idx],
                y_pred_rate=pred_valid,
                intended_amount=intended_amount[valid_idx],
                weights=weights[valid_idx],
            )
        )

    return aggregate_metric_dicts(fold_metrics)


def cross_validate(
    df: pd.DataFrame,
    config: CandidateConfig,
    n_splits: int,
) -> tuple[dict[str, float], list[dict[str, float]], pd.DataFrame]:
    splitter = GroupKFold(n_splits=n_splits)
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN].to_numpy(dtype=float)
    groups = df[GROUP_COLUMN].astype(str).to_numpy()
    weights = df[WEIGHT_COLUMN].to_numpy(dtype=float)
    intended_amount = df[AMOUNT_COLUMN].to_numpy(dtype=float)

    folds: list[dict[str, float]] = []
    oof_rows: list[pd.DataFrame] = []

    for fold_number, (train_idx, valid_idx) in enumerate(splitter.split(X, y, groups), start=1):
        train_frame = X.iloc[train_idx]
        valid_frame = X.iloc[valid_idx]
        y_train = y[train_idx]
        y_valid = y[valid_idx]
        w_train = weights[train_idx]
        w_valid = weights[valid_idx]
        intended_valid = intended_amount[valid_idx]

        model = build_model(config)
        model.fit(
            train_frame,
            y_train,
            cat_features=CATEGORICAL_COLUMNS,
            sample_weight=w_train,
            eval_set=(valid_frame, y_valid),
            use_best_model=True,
        )

        pred_valid = clip_rate(model.predict(valid_frame))
        fold_metrics = evaluate_fold(y_valid, pred_valid, intended_valid, w_valid)
        fold_metrics["fold"] = float(fold_number)
        fold_metrics["best_iteration"] = float(model.get_best_iteration())
        folds.append(fold_metrics)

        y_valid_amount = y_valid * intended_valid
        pred_valid_amount = rate_to_amount(pred_valid, intended_valid)
        fold_oof = df.iloc[valid_idx][[
            ROW_ID_COLUMN,
            GROUP_COLUMN,
            BATCH_ID_COLUMN,
            FAMILY_COLUMN,
            WEIGHT_COLUMN,
            AMOUNT_COLUMN,
            TARGET_COLUMN,
        ]].copy()
        fold_oof["fold"] = fold_number
        fold_oof["predicted_leakage_rate_oof"] = pred_valid
        fold_oof["true_leakage_amount_minor"] = y_valid_amount
        fold_oof["predicted_leakage_amount_minor_oof"] = pred_valid_amount
        fold_oof["abs_rate_error"] = np.abs(y_valid - pred_valid)
        fold_oof["abs_amount_error_minor"] = np.abs(y_valid_amount - pred_valid_amount)
        oof_rows.append(fold_oof)

    return aggregate_metric_dicts(folds), folds, pd.concat(oof_rows, ignore_index=True)


def family_metrics(oof_df: pd.DataFrame) -> list[dict[str, float | str]]:
    rows: list[dict[str, float | str]] = []
    for family, family_df in oof_df.groupby(FAMILY_COLUMN):
        y_true_rate = family_df[TARGET_COLUMN].to_numpy(dtype=float)
        y_pred_rate = family_df["predicted_leakage_rate_oof"].to_numpy(dtype=float)
        weights = family_df[WEIGHT_COLUMN].to_numpy(dtype=float)
        intended_amount = family_df[AMOUNT_COLUMN].to_numpy(dtype=float)
        metrics = evaluate_fold(y_true_rate, y_pred_rate, intended_amount, weights)
        metrics["family"] = str(family)
        metrics["rows"] = float(len(family_df))
        rows.append(metrics)
    rows.sort(key=lambda item: str(item["family"]))
    return rows


def feature_importance_rows(model: CatBoostRegressor) -> pd.DataFrame:
    importance = model.get_feature_importance()
    frame = pd.DataFrame({
        "feature": FEATURE_COLUMNS,
        "importance": importance,
    })
    return frame.sort_values("importance", ascending=False).reset_index(drop=True)


def best_config_summary(config: CandidateConfig) -> dict[str, float | int]:
    return asdict(config)


def choose_best_config(df: pd.DataFrame, n_splits: int) -> tuple[CandidateConfig, dict[str, float], list[dict[str, float]], pd.DataFrame, list[dict[str, object]]]:
    search_results: list[dict[str, object]] = []
    best_config: CandidateConfig | None = None
    best_metrics: dict[str, float] | None = None
    best_fold_metrics: list[dict[str, float]] | None = None
    best_oof: pd.DataFrame | None = None

    for candidate in build_candidates():
        avg_metrics, fold_metrics, oof_df = cross_validate(df, candidate, n_splits=n_splits)
        search_results.append({
            "params": best_config_summary(candidate),
            "cv_metrics": avg_metrics,
        })
        if best_metrics is None or avg_metrics["rate_weighted_mae"] < best_metrics["rate_weighted_mae"]:
            best_config = candidate
            best_metrics = avg_metrics
            best_fold_metrics = fold_metrics
            best_oof = oof_df

    assert best_config is not None
    assert best_metrics is not None
    assert best_fold_metrics is not None
    assert best_oof is not None
    return best_config, best_metrics, best_fold_metrics, best_oof, search_results


def train_final_model(df: pd.DataFrame, config: CandidateConfig) -> CatBoostRegressor:
    model = build_model(config)
    model.fit(
        df[FEATURE_COLUMNS],
        df[TARGET_COLUMN].to_numpy(dtype=float),
        cat_features=CATEGORICAL_COLUMNS,
        sample_weight=df[WEIGHT_COLUMN].to_numpy(dtype=float),
        use_best_model=False,
    )
    return model


def build_summary(
    df: pd.DataFrame,
    input_path: Path,
    n_splits: int,
    best_config: CandidateConfig,
    cv_metrics: dict[str, float],
    baseline_metrics: dict[str, float],
    fold_metrics: list[dict[str, float]],
    search_results: list[dict[str, object]],
    oof_df: pd.DataFrame,
) -> dict[str, object]:
    unique_groups = sorted(df[GROUP_COLUMN].astype(str).unique().tolist())
    return {
        "training_date": pd.Timestamp.utcnow().isoformat(),
        "input_csv": str(input_path.relative_to(ROOT)),
        "row_count": int(len(df)),
        "anchor_row_count": int((df["synthetic_flag"] == 0).sum()),
        "synthetic_row_count": int((df["synthetic_flag"] == 1).sum()),
        "feature_count": len(FEATURE_COLUMNS),
        "categorical_feature_count": len(CATEGORICAL_COLUMNS),
        "target_column": TARGET_COLUMN,
        "group_column": GROUP_COLUMN,
        "weight_column": WEIGHT_COLUMN,
        "n_splits": n_splits,
        "unique_group_count": len(unique_groups),
        "groups": unique_groups,
        "best_params": best_config_summary(best_config),
        "cv_metrics": cv_metrics,
        "grouped_baseline_metrics": baseline_metrics,
        "improvement_vs_grouped_baseline": {
            "rate_weighted_mae_reduction_pct": (
                0.0
                if baseline_metrics["rate_weighted_mae"] == 0.0
                else 100.0 * (baseline_metrics["rate_weighted_mae"] - cv_metrics["rate_weighted_mae"]) / baseline_metrics["rate_weighted_mae"]
            ),
            "amount_weighted_mae_reduction_pct": (
                0.0
                if baseline_metrics["amount_weighted_mae_minor"] == 0.0
                else 100.0 * (baseline_metrics["amount_weighted_mae_minor"] - cv_metrics["amount_weighted_mae_minor"]) / baseline_metrics["amount_weighted_mae_minor"]
            ),
        },
        "fold_metrics": fold_metrics,
        "family_metrics": family_metrics(oof_df),
        "hyperparameter_search": search_results,
    }


def build_model_bundle(
    model: CatBoostRegressor,
    summary: dict[str, object],
    priors: dict[str, object],
) -> dict[str, object]:
    return {
        "bundle_version": MODEL_BUNDLE_VERSION,
        "model_family": "LEAKAGE_PREDICTION",
        "target_column": TARGET_COLUMN,
        "feature_columns": FEATURE_COLUMNS,
        "categorical_columns": CATEGORICAL_COLUMNS,
        "missing_category_tokens": sorted(MISSING_CATEGORY_TOKENS),
        "segment_levels": [list(level) for level in SEGMENT_LEVELS],
        "fallback_priors": priors,
        "clip_range": [0.0, 1.0],
        "training_summary": summary,
        "model": model,
    }


def _mode_or_default(series: pd.Series, default: str = "unknown") -> str:
    cleaned = [str(value).strip() for value in series.tolist() if str(value).strip()]
    if not cleaned:
        return default
    return pd.Series(cleaned).mode(dropna=True).iloc[0]


def _segment_key(row: pd.Series | dict[str, object], columns: tuple[str, ...]) -> str | None:
    values: list[str] = []
    for col in columns:
        value = normalize_categorical_value((row[col] if isinstance(row, dict) else row[col]))
        if value is None:
            return None
        values.append(value)
    return "||".join(values)


def build_fallback_priors(df: pd.DataFrame) -> dict[str, object]:
    numeric_columns = [col for col in FEATURE_COLUMNS if col not in CATEGORICAL_COLUMNS]

    global_numeric = {
        col: float(pd.to_numeric(df[col], errors="coerce").dropna().median())
        for col in numeric_columns
    }
    global_categorical = {
        col: _mode_or_default(df[col], default="unknown")
        for col in CATEGORICAL_COLUMNS
    }

    segments: dict[str, dict[str, dict[str, object]]] = {}
    for level in SEGMENT_LEVELS:
        level_key = "__".join(level)
        level_segments: dict[str, dict[str, object]] = {}
        grouped = df.groupby(list(level), dropna=False, sort=False)
        for group_values, group_df in grouped:
            if not isinstance(group_values, tuple):
                group_values = (group_values,)
            normalized_values = [normalize_categorical_value(value) for value in group_values]
            if any(value is None for value in normalized_values):
                continue
            segment_key = "||".join(str(value) for value in normalized_values)
            level_segments[segment_key] = {
                "numeric": {
                    col: float(pd.to_numeric(group_df[col], errors="coerce").dropna().median())
                    for col in numeric_columns
                },
                "categorical": {
                    col: _mode_or_default(group_df[col], default=global_categorical[col])
                    for col in CATEGORICAL_COLUMNS
                },
                "row_count": int(len(group_df)),
            }
        segments[level_key] = level_segments

    return {
        "global": {
            "numeric": global_numeric,
            "categorical": global_categorical,
        },
        "segments": segments,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the leakage prediction CatBoost regressor.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--n-splits", type=int, default=5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.input.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(input_path)
    unique_group_count = df[GROUP_COLUMN].nunique()
    n_splits = min(args.n_splits, unique_group_count)
    if n_splits < 2:
        raise ValueError(f"Need at least 2 unique {GROUP_COLUMN} values, found {unique_group_count}")

    best_config, cv_metrics, fold_metrics, oof_df, search_results = choose_best_config(df, n_splits=n_splits)
    baseline_metrics = baseline_cross_validate(df, n_splits=n_splits)
    final_model = train_final_model(df, best_config)
    importance_df = feature_importance_rows(final_model)
    priors = build_fallback_priors(df)
    summary = build_summary(
        df=df,
        input_path=input_path,
        n_splits=n_splits,
        best_config=best_config,
        cv_metrics=cv_metrics,
        baseline_metrics=baseline_metrics,
        fold_metrics=fold_metrics,
        search_results=search_results,
        oof_df=oof_df,
    )

    model_path = output_dir / "leakage_catboost_regressor.cbm"
    bundle_path = output_dir / "leakage_prediction_bundle.joblib"
    priors_path = output_dir / "leakage_feature_priors.json"
    final_model.save_model(str(model_path))
    joblib.dump(build_model_bundle(final_model, summary, priors), bundle_path)
    importance_df.to_csv(output_dir / "feature_importance.csv", index=False)
    oof_df.to_csv(output_dir / "oof_predictions.csv", index=False)
    (output_dir / "training_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    priors_path.write_text(json.dumps(priors, indent=2), encoding="utf-8")

    print(json.dumps({
        "model_path": str(model_path.relative_to(ROOT)),
        "bundle_path": str(bundle_path.relative_to(ROOT)),
        "priors_path": str(priors_path.relative_to(ROOT)),
        "cv_rate_weighted_mae": round(cv_metrics["rate_weighted_mae"], 6),
        "cv_rate_rmse": round(cv_metrics["rate_rmse"], 6),
        "cv_amount_weighted_mae_minor": round(cv_metrics["amount_weighted_mae_minor"], 2),
        "baseline_rate_weighted_mae": round(baseline_metrics["rate_weighted_mae"], 6),
        "baseline_amount_weighted_mae_minor": round(baseline_metrics["amount_weighted_mae_minor"], 2),
        "best_params": best_config_summary(best_config),
    }, indent=2))


if __name__ == "__main__":
    main()
