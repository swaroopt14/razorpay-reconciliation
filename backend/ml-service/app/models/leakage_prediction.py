from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

from app import config
from app.leakage_training_repo import LeakageTrainingRepo

logger = logging.getLogger(__name__)

MODEL_BUNDLE_VERSION = "leakage_prediction_v1"
TARGET_COLUMN = "predicted_leakage_rate"
STATUS_READY = "READY"
STATUS_INSUFFICIENT_DATA = "INSUFFICIENT_DATA"

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

MISSING_CATEGORY_TOKENS = {"", "unknown", "na", "n/a", "null", "none"}


class LeakagePredictionModel:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._repo = LeakageTrainingRepo()
        self._bundle: dict[str, Any] = _base_bundle()
        self._retraining = False
        self._last_trained_row_count = 0
        self._model_path = Path(config.LEAKAGE_MODEL_PATH)

        self._ensure_model_dir()
        self._load_bundle()

    def predict(self, raw_features: dict[str, Any]) -> dict[str, Any]:
        bundle = self._get_bundle()
        training_row_count = self._current_training_row_count(bundle)
        model = bundle.get("model")
        if model is None:
            return {
                "predicted_leakage_rate": 0.0,
                "predicted_leakage_minor": 0.0,
                "risk_tier": "",
                "model_ready": False,
                "status": STATUS_INSUFFICIENT_DATA,
                "training_row_count": training_row_count,
                "min_training_rows": config.LEAKAGE_RETRAIN_THRESHOLD,
                "fallback_feature_count": 0,
                "fallback_features": [],
                "fallback_segment_level": "global",
            }

        frame, diagnostics = self._frame_from_features(raw_features, bundle)
        rate = float(np.clip(model.predict(frame)[0], 0.0, 1.0))
        intended = float(frame["batch_total_intended_amount_minor"].iloc[0])
        amount = rate * max(intended, 0.0)
        return {
            "predicted_leakage_rate": rate,
            "predicted_leakage_minor": amount,
            "risk_tier": _risk_tier(rate),
            "model_ready": True,
            "status": STATUS_READY,
            "training_row_count": training_row_count,
            "min_training_rows": config.LEAKAGE_RETRAIN_THRESHOLD,
            "fallback_feature_count": diagnostics["fallback_feature_count"],
            "fallback_features": diagnostics["fallback_features"],
            "fallback_segment_level": diagnostics["fallback_segment_level"],
        }

    def maybe_retrain_async(self, batch_id: str = "", tenant_id: str = "") -> None:
        if not self._repo.is_configured():
            logger.warning("leakage_model: INTELLIGENCE_DATABASE_URL not configured; batch=%s tenant=%s", batch_id, tenant_id)
            return

        try:
            labeled_row_count = self._repo.count_labeled_rows()
        except Exception:
            logger.exception("leakage_model: failed counting labeled rows batch=%s tenant=%s", batch_id, tenant_id)
            return

        threshold = config.LEAKAGE_RETRAIN_THRESHOLD
        with self._lock:
            pending = labeled_row_count - self._last_trained_row_count
            if labeled_row_count < threshold:
                logger.info(
                    "leakage_model: waiting for first training set rows=%d threshold=%d",
                    labeled_row_count,
                    threshold,
                )
                return
            if pending < threshold:
                logger.info(
                    "leakage_model: retrain deferred rows=%d trained_rows=%d pending=%d threshold=%d",
                    labeled_row_count,
                    self._last_trained_row_count,
                    pending,
                    threshold,
                )
                return
            if self._retraining:
                logger.info("leakage_model: retrain already in progress rows=%d", labeled_row_count)
                return
            self._retraining = True

        thread = threading.Thread(target=self._retrain, daemon=True, name="leakage-retrain")
        thread.start()

    def _ensure_model_dir(self) -> None:
        try:
            self._model_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            logger.exception("leakage_model: failed ensuring model directory path=%s", self._model_path)

    def _load_bundle(self) -> None:
        if not self._model_path.exists():
            logger.info("leakage_model: starting from base bundle path=%s", self._model_path)
            return

        try:
            loaded = joblib.load(self._model_path)
            bundle = self._sanitize_loaded_bundle(loaded)
            with self._lock:
                self._bundle = bundle
                self._last_trained_row_count = self._current_training_row_count(bundle)
            logger.info(
                "leakage_model: loaded bundle path=%s version=%s model_ready=%s training_rows=%d",
                self._model_path,
                bundle.get("bundle_version"),
                bundle.get("model") is not None,
                self._last_trained_row_count,
            )
        except Exception:
            logger.exception("leakage_model: failed loading bundle path=%s; using base bundle", self._model_path)

    def _sanitize_loaded_bundle(self, loaded: Any) -> dict[str, Any]:
        bundle = _base_bundle()
        if not isinstance(loaded, dict):
            return bundle

        bundle["model"] = loaded.get("model")
        bundle["bundle_version"] = loaded.get("bundle_version", MODEL_BUNDLE_VERSION)
        bundle["feature_columns"] = list(loaded.get("feature_columns") or FEATURE_COLUMNS)
        bundle["categorical_columns"] = list(loaded.get("categorical_columns") or CATEGORICAL_COLUMNS)
        bundle["missing_category_tokens"] = sorted(
            set(loaded.get("missing_category_tokens") or MISSING_CATEGORY_TOKENS)
        )
        bundle["segment_levels"] = [tuple(level) for level in (loaded.get("segment_levels") or SEGMENT_LEVELS)]
        bundle["target_column"] = loaded.get("target_column", TARGET_COLUMN)
        bundle["fallback_priors"] = loaded.get("fallback_priors") or {"global": {"numeric": {}, "categorical": {}}, "segments": {}}

        training_summary = dict(loaded.get("training_summary") or {})
        synthetic_row_count = int(training_summary.get("synthetic_row_count", 0) or 0)
        anchor_row_count = int(training_summary.get("anchor_row_count", 0) or 0)
        real_row_count = int(training_summary.get("real_labeled_rows", 0) or 0)
        trained_from_feature_store = training_summary.get("training_source") == "ml_feature_store"

        if bundle["model"] is not None and not trained_from_feature_store and real_row_count <= 0 and (synthetic_row_count > 0 or anchor_row_count > 0):
            logger.info("leakage_model: discarding synthetic pretrained bundle and reverting to base model")
            bundle["model"] = None
            bundle["training_summary"] = {
                "status": "base_model",
                "training_source": "ml_feature_store",
                "real_labeled_rows": 0,
                "training_row_count": 0,
            }
            return bundle

        if bundle["model"] is None:
            bundle["training_summary"] = {
                "status": "base_model",
                "training_source": "ml_feature_store",
                "real_labeled_rows": real_row_count,
                "training_row_count": real_row_count,
            }
            return bundle

        training_row_count = int(training_summary.get("training_row_count", 0) or 0)
        if training_row_count <= 0:
            training_row_count = real_row_count

        bundle["training_summary"] = {
            **training_summary,
            "status": training_summary.get("status", "trained"),
            "training_source": "ml_feature_store",
            "real_labeled_rows": max(real_row_count, training_row_count),
            "training_row_count": max(training_row_count, real_row_count),
        }
        return bundle

    def _get_bundle(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._bundle)

    def _current_training_row_count(self, bundle: dict[str, Any]) -> int:
        summary = dict(bundle.get("training_summary") or {})
        training_row_count = int(summary.get("training_row_count", 0) or 0)
        if training_row_count > 0:
            return training_row_count
        return int(summary.get("real_labeled_rows", 0) or 0)

    def _retrain(self) -> None:
        try:
            rows = self._repo.load_labeled_rows()
            if len(rows) < config.LEAKAGE_RETRAIN_THRESHOLD:
                logger.info(
                    "leakage_model: retrain aborted rows=%d threshold=%d",
                    len(rows),
                    config.LEAKAGE_RETRAIN_THRESHOLD,
                )
                return

            bundle = self._get_bundle()
            train_df = self._build_training_dataframe(rows, bundle)
            if train_df.empty:
                logger.warning("leakage_model: no usable labeled rows found in ml_feature_store")
                return

            feature_columns = list(bundle["feature_columns"])
            categorical_columns = list(bundle["categorical_columns"])
            target_column = str(bundle["target_column"])

            frame = train_df[feature_columns].copy()
            for col in categorical_columns:
                frame[col] = frame[col].map(lambda value: _normalize_categorical_value(value, bundle) or "unknown")
            for col in feature_columns:
                if col not in categorical_columns:
                    frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0.0)

            y = pd.to_numeric(train_df[target_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
            weights = pd.to_numeric(train_df.get("sample_weight", 1.0), errors="coerce").fillna(1.0)

            model = CatBoostRegressor(
                loss_function="MAE",
                eval_metric="MAE",
                random_seed=20260612,
                depth=4,
                learning_rate=0.03,
                l2_leaf_reg=5.0,
                min_data_in_leaf=4,
                random_strength=0.5,
                bagging_temperature=0.0,
                iterations=700,
                verbose=False,
                allow_writing_files=False,
            )
            model.fit(frame, y, cat_features=categorical_columns, sample_weight=weights)

            updated_bundle = dict(bundle)
            updated_bundle["model"] = model
            updated_bundle["fallback_priors"] = self._build_fallback_priors(train_df, feature_columns, categorical_columns)
            updated_bundle["training_summary"] = {
                "status": "trained",
                "training_source": "ml_feature_store",
                "real_labeled_rows": int(len(train_df)),
                "training_row_count": int(len(train_df)),
                "retrained_at": pd.Timestamp.utcnow().isoformat(),
            }

            self._persist_bundle(updated_bundle)
            with self._lock:
                self._bundle = updated_bundle
                self._last_trained_row_count = len(train_df)
            logger.info("leakage_model: retrain complete rows=%d", len(train_df))
        except Exception:
            logger.exception("leakage_model: retrain failed; keeping previous bundle")
        finally:
            with self._lock:
                self._retraining = False

    def _persist_bundle(self, bundle: dict[str, Any]) -> None:
        tmp_path = self._model_path.with_suffix(".tmp")
        joblib.dump(bundle, tmp_path)
        tmp_path.replace(self._model_path)

    def _build_training_dataframe(self, rows: list[dict[str, Any]], bundle: dict[str, Any]) -> pd.DataFrame:
        normalized_rows: list[dict[str, Any]] = []
        for item in rows:
            raw_features = item.get("features") or {}
            label = item.get("label") or {}
            batch_id = str(item.get("batch_id", "") or "")
            tenant_id = str(item.get("tenant_id", "") or "")

            row, _ = self._normalized_training_row(raw_features, bundle)
            row[TARGET_COLUMN] = clamp_01(
                _to_float(
                    label.get("predicted_leakage_rate", label.get("label_rate", 0.0))
                )
            )
            row["target_leakage_amount_minor"] = max(
                _to_float(
                    label.get("target_leakage_amount_minor", label.get("label_amount", 0.0))
                ),
                0.0,
            )
            row["sample_weight"] = max(_to_float(label.get("sample_weight", 1.0)), 1.0)
            row["row_id"] = f"db::{tenant_id}::{batch_id}"
            row["parent_batch_id"] = batch_id
            row["batch_id"] = batch_id
            row["scenario_family"] = "real_runtime"
            normalized_rows.append(row)

        columns = FEATURE_COLUMNS + [
            TARGET_COLUMN,
            "target_leakage_amount_minor",
            "sample_weight",
            "row_id",
            "parent_batch_id",
            "batch_id",
            "scenario_family",
        ]
        return pd.DataFrame(normalized_rows, columns=columns)

    def _frame_from_features(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
        row, diagnostics = self._normalized_training_row(raw_features, bundle)
        return pd.DataFrame([row], columns=bundle["feature_columns"]), diagnostics

    def _normalized_training_row(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        feature_columns = bundle["feature_columns"]
        categorical_columns = list(bundle["categorical_columns"])
        categorical_set = set(categorical_columns)
        priors = bundle.get("fallback_priors", {})

        normalized: dict[str, Any] = {}
        fallback_features: list[str] = []
        fallback_level = "global"

        for col in feature_columns:
            value = raw_features.get(col)
            if col in categorical_set:
                normalized[col] = _normalize_categorical_value(value, bundle)
            else:
                normalized[col] = _to_float_or_none(value)

        normalized["source_system"], source_used, source_level = self._fill_categorical_with_prior(
            normalized.get("source_system"),
            "source_system",
            normalized,
            priors,
            bundle,
        )
        if source_used:
            fallback_features.append("source_system")
            fallback_level = more_specific_level(fallback_level, source_level)

        normalized["rail"], rail_used, rail_level = self._fill_categorical_with_prior(
            normalized.get("rail"),
            "rail",
            normalized,
            priors,
            bundle,
        )
        if rail_used:
            fallback_features.append("rail")
            fallback_level = more_specific_level(fallback_level, rail_level)

        normalized["provider_key"], provider_used, provider_level = self._fill_categorical_with_prior(
            normalized.get("provider_key"),
            "provider_key",
            normalized,
            priors,
            bundle,
        )
        if provider_used:
            fallback_features.append("provider_key")
            fallback_level = more_specific_level(fallback_level, provider_level)

        for col in categorical_columns:
            if col in {"source_system", "rail", "provider_key"}:
                continue
            filled, used, level = self._fill_categorical_with_prior(normalized.get(col), col, normalized, priors, bundle)
            normalized[col] = filled
            if used:
                fallback_features.append(col)
                fallback_level = more_specific_level(fallback_level, level)

        for col in feature_columns:
            if col in categorical_set:
                continue
            if normalized[col] is None:
                filled, level = self._fill_numeric_with_prior(col, normalized, priors, bundle)
                normalized[col] = filled
                fallback_level = more_specific_level(fallback_level, level)
                fallback_features.append(col)
            else:
                normalized[col] = float(normalized[col])

        for col in categorical_columns:
            if normalized[col] is None:
                normalized[col] = "unknown"

        return normalized, {
            "fallback_feature_count": len(fallback_features),
            "fallback_features": sorted(set(fallback_features)),
            "fallback_segment_level": fallback_level,
        }

    def _fill_categorical_with_prior(
        self,
        value: str | None,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
    ) -> tuple[str | None, bool, str]:
        if value is not None:
            return value, False, "global"
        fallback, level = self._lookup_prior(feature, row, priors, bundle, "categorical")
        return (_normalize_categorical_value(fallback, bundle) or "unknown"), True, level

    def _fill_numeric_with_prior(
        self,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
    ) -> tuple[float, str]:
        fallback, level = self._lookup_prior(feature, row, priors, bundle, "numeric")
        return float(0.0 if fallback is None else fallback), level

    def _lookup_prior(
        self,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
        family: str,
    ) -> tuple[Any, str]:
        segments = priors.get("segments", {})
        segment_levels = bundle.get("segment_levels", [])
        best_level = "global"
        for level_columns in reversed(segment_levels):
            level_key = "__".join(level_columns)
            segment_key = _row_segment_key(row, list(level_columns))
            if segment_key is None:
                continue
            level_map = segments.get(level_key, {})
            values = level_map.get(segment_key, {})
            family_values = values.get(family, {})
            if feature in family_values:
                return family_values[feature], level_key
        return priors.get("global", {}).get(family, {}).get(feature), best_level

    def _build_fallback_priors(
        self,
        train_df: pd.DataFrame,
        feature_columns: list[str],
        categorical_columns: list[str],
    ) -> dict[str, Any]:
        numeric_columns = [col for col in feature_columns if col not in categorical_columns]
        frame = train_df.copy()
        for col in categorical_columns:
            frame[col] = frame[col].map(lambda value: _normalize_categorical_value(value, {"missing_category_tokens": []}) or "unknown")

        global_numeric = {
            col: float(pd.to_numeric(frame[col], errors="coerce").dropna().median())
            for col in numeric_columns
        }
        global_categorical = {
            col: _mode_or_default(frame[col], "unknown")
            for col in categorical_columns
        }

        segments: dict[str, dict[str, dict[str, Any]]] = {}
        for level_columns in (["source_system"], ["source_system", "rail"], ["source_system", "rail", "provider_key"]):
            level_key = "__".join(level_columns)
            level_segments: dict[str, dict[str, Any]] = {}
            grouped = frame.groupby(level_columns, dropna=False, sort=False)
            for group_values, group_df in grouped:
                if not isinstance(group_values, tuple):
                    group_values = (group_values,)
                normalized_values = [str(value).strip().lower() for value in group_values]
                if any(not value or value == "unknown" for value in normalized_values):
                    continue
                segment_key = "||".join(normalized_values)
                level_segments[segment_key] = {
                    "numeric": {
                        col: float(pd.to_numeric(group_df[col], errors="coerce").dropna().median())
                        for col in numeric_columns
                    },
                    "categorical": {
                        col: _mode_or_default(group_df[col], global_categorical[col])
                        for col in categorical_columns
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


def _base_bundle() -> dict[str, Any]:
    return {
        "bundle_version": MODEL_BUNDLE_VERSION,
        "model": None,
        "feature_columns": list(FEATURE_COLUMNS),
        "categorical_columns": list(CATEGORICAL_COLUMNS),
        "missing_category_tokens": sorted(MISSING_CATEGORY_TOKENS),
        "segment_levels": [tuple(level) for level in SEGMENT_LEVELS],
        "target_column": TARGET_COLUMN,
        "fallback_priors": {
            "global": {"numeric": {}, "categorical": {}},
            "segments": {},
        },
        "training_summary": {
            "status": "base_model",
            "training_source": "ml_feature_store",
            "real_labeled_rows": 0,
            "training_row_count": 0,
        },
    }


def _to_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def _to_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _normalize_categorical_value(value: Any, bundle: dict[str, Any]) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    missing_tokens = set(bundle.get("missing_category_tokens", []))
    if text in missing_tokens:
        return None
    return text


def _row_segment_key(row: dict[str, Any], columns: list[str]) -> str | None:
    values: list[str] = []
    for col in columns:
        value = row.get(col)
        if value in (None, "", "unknown"):
            return None
        values.append(str(value))
    return "||".join(values)


def _mode_or_default(series: pd.Series, default: str) -> str:
    cleaned = [str(value).strip() for value in series.tolist() if str(value).strip()]
    if not cleaned:
        return default
    return pd.Series(cleaned).mode(dropna=True).iloc[0]


def more_specific_level(current: str, candidate: str) -> str:
    rank = {
        "global": 0,
        "source_system": 1,
        "source_system__rail": 2,
        "source_system__rail__provider_key": 3,
    }
    if rank.get(candidate, 0) > rank.get(current, 0):
        return candidate
    return current


def _risk_tier(rate: float) -> str:
    if rate > 0.05:
        return "CRITICAL"
    if rate > 0.025:
        return "HIGH"
    if rate > 0.01:
        return "MEDIUM"
    if rate > 0:
        return "LOW"
    return "CLEAN"


def clamp_01(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value
