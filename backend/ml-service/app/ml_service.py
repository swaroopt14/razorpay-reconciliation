"""
MLService — routes incoming ML requests to the correct model and returns results.

Owns all in-process model instances:
  - AmbiguityModel   (online SGD LR, persistent across requests)
  - RCAModel         (HDBSCAN bundle loaded from disk, async background retrain)

The LR model is persisted to disk every 10 training steps so it survives restarts.
The RCA bundle is loaded once at startup; retraining happens in a background thread
when enough labeled batches have been buffered.
"""

from __future__ import annotations

import logging
from typing import Optional

from app import config
from app.models import isolation_forest, leakage_prediction, logistic_regression, zscore
from app.models import rca_hdbscan
from app.schemas import (
    EVENT_TYPE_IF_SCORE,
    EVENT_TYPE_LEAKAGE_PREDICT,
    EVENT_TYPE_LEAKAGE_TRAIN,
    EVENT_TYPE_LR_PREDICT,
    EVENT_TYPE_LR_TRAIN,
    EVENT_TYPE_RCA_CLUSTER,
    EVENT_TYPE_ZSCORE,
    MLRequest,
    MLResult,
)

logger = logging.getLogger(__name__)

_SAVE_EVERY_N_STEPS = 10


class MLService:
    def __init__(self) -> None:
        self._lr_model = logistic_regression.AmbiguityModel.load(config.LR_MODEL_PATH)
        self._rca_model = rca_hdbscan.RCAModel(config.RCA_MODEL_PATH)
        self._leakage_model = leakage_prediction.LeakagePredictionModel()
        self._steps_since_save = 0

    def process(self, req: MLRequest) -> Optional[MLResult]:
        """
        Dispatch request to the appropriate model handler.
        Returns None for fire-and-forget requests (LR_TRAIN).
        Returns an MLResult with error field set if processing fails.
        """
        try:
            if req.event_type == EVENT_TYPE_IF_SCORE:
                return self._handle_if_score(req)
            if req.event_type == EVENT_TYPE_ZSCORE:
                return self._handle_zscore(req)
            if req.event_type == EVENT_TYPE_LR_PREDICT:
                return self._handle_lr_predict(req)
            if req.event_type == EVENT_TYPE_LR_TRAIN:
                self._handle_lr_train(req)
                return None
            if req.event_type == EVENT_TYPE_RCA_CLUSTER:
                return self._handle_rca_cluster(req)
            if req.event_type == EVENT_TYPE_LEAKAGE_PREDICT:
                return self._handle_leakage_predict(req)
            if req.event_type == EVENT_TYPE_LEAKAGE_TRAIN:
                self._handle_leakage_train(req)
                return None
            logger.warning(
                "ml_service: unknown event_type=%s event_id=%s",
                req.event_type, req.event_id,
            )
            return None
        except Exception as exc:
            logger.exception(
                "ml_service: error processing event_id=%s event_type=%s",
                req.event_id, req.event_type,
            )
            return MLResult(
                event_id=req.event_id,
                event_type=req.event_type,
                tenant_id=req.tenant_id,
                model_outputs={},
                model_version="error",
                error=str(exc),
            )

    # ── Handlers ──────────────────────────────────────────────────────────────

    def _handle_if_score(self, req: MLRequest) -> MLResult:
        payload = req.payload
        raw = payload.get("features") or {}
        history: list[list[float]] = payload.get("history") or []

        features = isolation_forest.build_features(
            ambiguity_rate=float(raw.get("ambiguity_rate", 0.0)),
            variance_rate=float(raw.get("variance_rate", 0.0)),
            settlement_ratio=float(raw.get("settlement_ratio", 0.0)),
            unresolved_ratio=float(raw.get("unresolved_ratio", 0.0)),
            missing_ref_rate=float(raw.get("missing_ref_rate", 0.0)),
        )
        result = isolation_forest.score(features, history)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=result,
            model_version=config.MODEL_VERSION_IF,
        )

    def _handle_zscore(self, req: MLRequest) -> MLResult:
        payload = req.payload
        current_value = float(payload.get("current_value", 0.0))
        history = [float(v) for v in (payload.get("history") or [])]

        result = zscore.detect(current_value, history)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=result,
            model_version=config.MODEL_VERSION_ZSCORE,
        )

    def _handle_lr_predict(self, req: MLRequest) -> MLResult:
        payload = req.payload
        raw = payload.get("features") or {}

        features = logistic_regression.build_features(
            ambiguity_rate=float(raw.get("ambiguity_rate", 0.0)),
            provider_ref_missing_rate=float(raw.get("provider_ref_missing_rate", 0.0)),
            avg_confidence=float(raw.get("avg_confidence", 1.0)),
            value_at_risk_minor=float(raw.get("value_at_risk_minor", 0.0)),
            total_intended_minor=float(raw.get("total_intended_minor", 0.0)),
        )
        prob = self._lr_model.predict(features)
        level = logistic_regression.predict_level(prob)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs={"probability": prob, "level": level},
            model_version=config.MODEL_VERSION_LR,
        )

    def _handle_lr_train(self, req: MLRequest) -> None:
        payload = req.payload
        raw_features = payload.get("features", [])
        label = float(payload.get("label", 0.0))
        learning_rate = float(payload.get("learning_rate", 0.01))

        features = [float(f) for f in raw_features]
        if len(features) != logistic_regression.FEATURE_SIZE:
            logger.error(
                "lr_train: expected %d features, got %d — skipping",
                logistic_regression.FEATURE_SIZE, len(features),
            )
            return

        self._lr_model.train(features, label, learning_rate)
        logger.info(
            "lr_train: ok tenant=%s label=%.0f trained_on=%d",
            req.tenant_id, label, self._lr_model.trained_on,
        )

        self._steps_since_save += 1
        if self._steps_since_save >= _SAVE_EVERY_N_STEPS:
            self._lr_model.save(config.LR_MODEL_PATH)
            self._steps_since_save = 0

    def _handle_rca_cluster(self, req: MLRequest) -> MLResult:
        """
        Run HDBSCAN RCA clustering on the submitted payment candidates.

        Payload shape (from Go InvokeRCAClustering):
          {
            "candidates": [ { ...RCACandidate fields... }, ... ],
            "batch_id": "BATCH_2026_04_21",
            "feature_contract_version": "rca_v1",
          }

        If the model bundle is not loaded (no .pkl), returns an empty result
        so Go falls back cleanly — business logic is never blocked.

        When a finality_label is present in the payload (sent by Go after a batch
        reaches FULLY_SETTLED or FAILED), the candidates are buffered for retrain.
        """
        payload = req.payload
        raw_candidates: list[dict] = payload.get("candidates") or []
        batch_id: str = payload.get("batch_id", "")
        finality_label: str = payload.get("finality_label", "")

        if not raw_candidates:
            logger.info(
                "rca_cluster: no candidates in payload event_id=%s tenant=%s",
                req.event_id, req.tenant_id,
            )
            return MLResult(
                event_id=req.event_id,
                event_type=req.event_type,
                tenant_id=req.tenant_id,
                model_outputs=rca_hdbscan._empty_result(),
                model_version=config.MODEL_VERSION_RCA,
            )

        assignments = self._rca_model.predict(raw_candidates)

        model_outputs = rca_hdbscan.summarize_clusters(
            assignments=assignments,
            batch_id=batch_id,
            tenant_id=req.tenant_id,
        )

        # Buffer for retrain when batch has reached finality (ground truth available)
        if finality_label in ("FULLY_SETTLED", "FAILED") and assignments:
            true_labels = [a["cluster_code"] for a in assignments]
            self._rca_model.maybe_retrain_async(
                candidates=raw_candidates,
                true_labels=true_labels,
                threshold=config.RCA_RETRAIN_THRESHOLD,
            )
            logger.info(
                "rca_cluster: buffered %d examples for retrain batch=%s label=%s tenant=%s",
                len(raw_candidates), batch_id, finality_label, req.tenant_id,
            )

        logger.info(
            "rca_cluster: ok batch=%s candidates=%d clusters=%d noise=%d tenant=%s",
            batch_id,
            model_outputs["total_points"],
            model_outputs["cluster_count"],
            model_outputs["noise_points"],
            req.tenant_id,
        )

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=model_outputs,
            model_version=config.MODEL_VERSION_RCA,
        )

    def _handle_leakage_predict(self, req: MLRequest) -> MLResult:
        payload = req.payload
        features = payload.get("features") or {}
        result = self._leakage_model.predict(features)
        batch_id = payload.get("batch_id", "")
        logger.info(
            "leakage_predict: ok tenant=%s batch=%s status=%s model_ready=%s rate=%.6f amount=%.2f fallback_count=%s level=%s",
            req.tenant_id,
            batch_id,
            result.get("status", ""),
            result.get("model_ready", False),
            result["predicted_leakage_rate"],
            result["predicted_leakage_minor"],
            result.get("fallback_feature_count", 0),
            result.get("fallback_segment_level", "global"),
        )
        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=result,
            model_version=config.MODEL_VERSION_LEAKAGE,
        )

    def _handle_leakage_train(self, req: MLRequest) -> None:
        payload = req.payload
        self._leakage_model.maybe_retrain_async(
            batch_id=str(payload.get("batch_id", "")),
            tenant_id=req.tenant_id,
        )
