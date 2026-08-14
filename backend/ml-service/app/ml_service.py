"""
MLService — routes incoming ML requests to the correct model and returns results.

Owns all in-process model instances:
  - AmbiguityModel (verified promoted LR snapshot)
  - RCAModel (verified promoted HDBSCAN snapshot)
  - LeakagePredictionModel (verified promoted CatBoost snapshot)

Managed mode stages training centrally but never mutates a live inference snapshot.
Only signed, approved versions referenced by the atomic promotion table are loaded.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from app import config
from app.exceptions import NonRetryableMessageError, UnsupportedEventTypeError
from app.event_receipts import EventReceiptRepo
from app.model_contracts import canonical_sha256, file_sha256, version_digest
from app.model_registry import (
    MODEL_LEAKAGE,
    MODEL_LR,
    MODEL_RCA,
    ModelRegistry,
    ModelRegistryError,
    Promotion,
)
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
from app.training_governance import TrainingGovernanceRepo

logger = logging.getLogger(__name__)


class MLService:
    def __init__(
        self,
        receipt_db_path: Optional[str] = None,
        registry: Optional[ModelRegistry] = None,
    ) -> None:
        self._registry: Optional[ModelRegistry] = registry
        self._training_governance = TrainingGovernanceRepo()
        self._registry_promotions: dict[str, Promotion] = {}
        self._last_registry_sync = 0.0
        if self._registry is None and config.MODEL_REGISTRY_ENABLED:
            try:
                self._registry = ModelRegistry(
                    config.INTELLIGENCE_DATABASE_URL,
                    config.MODEL_REGISTRY_PUBLIC_KEY,
                )
            except ModelRegistryError:
                if config.MODEL_REGISTRY_REQUIRED:
                    raise
                logger.exception(
                    "model_registry: unavailable; continuing in local development mode"
                )
        self._sync_registry(force=True, reload_models=False)
        self._load_models()
        self._receipt_repo = EventReceiptRepo(
            receipt_db_path or config.ML_RECEIPT_DB_PATH
        )

    def _cache_paths(self) -> dict[str, str]:
        return {
            MODEL_LR: config.LR_MODEL_PATH,
            MODEL_RCA: config.RCA_MODEL_PATH,
            MODEL_LEAKAGE: config.LEAKAGE_MODEL_PATH,
        }

    def _load_models(self) -> None:
        managed = self._registry is not None
        lr_available = not managed or MODEL_LR in self._registry_promotions
        rca_available = not managed or MODEL_RCA in self._registry_promotions
        leakage_available = not managed or MODEL_LEAKAGE in self._registry_promotions
        self._lr_model = (
            logistic_regression.AmbiguityModel.load(config.LR_MODEL_PATH)
            if lr_available else logistic_regression.AmbiguityModel()
        )
        self._lr_ready = lr_available
        self._rca_model = rca_hdbscan.RCAModel(
            config.RCA_MODEL_PATH
            if rca_available else config.RCA_MODEL_PATH + ".registry-unavailable"
        )
        self._leakage_model = leakage_prediction.LeakagePredictionModel(
            config.LEAKAGE_MODEL_PATH
            if leakage_available
            else config.LEAKAGE_MODEL_PATH + ".registry-unavailable"
        )

    def _sync_registry(self, force: bool = False, reload_models: bool = True) -> None:
        if getattr(self, "_registry", None) is None:
            return
        now = time.monotonic()
        if (
            not force
            and now - self._last_registry_sync < config.MODEL_REGISTRY_REFRESH_SECONDS
        ):
            return
        try:
            promotions = self._registry.sync_to_paths(self._cache_paths())
        except ModelRegistryError:
            if config.MODEL_REGISTRY_REQUIRED:
                raise
            logger.exception("model_registry: refresh failed; retaining verified snapshot")
            return
        changed = promotions != self._registry_promotions
        self._registry_promotions = promotions
        self._last_registry_sync = now
        if changed and reload_models and hasattr(self, "_lr_model"):
            self._load_models()
        if changed:
            logger.info(
                "model_registry: synchronized promotions=%s",
                {
                    name: {"version": item.version, "digest": item.digest}
                    for name, item in promotions.items()
                },
            )

    def _promotion(self, model_name: str) -> Optional[Promotion]:
        return getattr(self, "_registry_promotions", {}).get(model_name)

    def process(self, req: MLRequest) -> Optional[MLResult]:
        """Process once and return the cached logical result on every replay."""
        self._sync_registry()
        request_hash = req.request_hash()
        receipt_repo = getattr(self, "_receipt_repo", None)
        if receipt_repo is None:
            return self._attach_contract(req, request_hash, self._dispatch(req))

        cached = receipt_repo.lookup(req, request_hash)
        if cached.found:
            return cached.result

        result = self._attach_contract(req, request_hash, self._dispatch(req))
        recorded = receipt_repo.record(req, request_hash, result)
        return recorded.result

    def close(self) -> None:
        receipt_repo = getattr(self, "_receipt_repo", None)
        if receipt_repo is not None:
            receipt_repo.close()

    def _attach_contract(
        self,
        req: MLRequest,
        request_hash: str,
        result: Optional[MLResult],
    ) -> Optional[MLResult]:
        if result is None:
            return None

        result.schema_version = req.schema_version
        result.request_hash = request_hash
        model_name = ""
        if req.event_type == EVENT_TYPE_RCA_CLUSTER:
            model_name = MODEL_RCA
            result.model_digest = self._rca_model.model_digest
            result.model_ready = self._rca_model.is_ready
        elif req.event_type == EVENT_TYPE_LEAKAGE_PREDICT:
            model_name = MODEL_LEAKAGE
            result.model_ready = bool(result.model_outputs.get("model_ready", False))
            result.model_digest = (
                file_sha256(config.LEAKAGE_MODEL_PATH)
                if result.model_ready else ""
            )
        elif req.event_type == EVENT_TYPE_LR_PREDICT:
            model_name = MODEL_LR
            result.model_digest = canonical_sha256(self._lr_model.to_dict())
            result.model_ready = self._lr_ready
        else:
            result.model_digest = version_digest(result.model_version)
            result.model_ready = result.error is None

        if getattr(self, "_registry", None) is not None and model_name:
            promotion = self._promotion(model_name)
            if promotion is None:
                result.model_digest = ""
                result.model_ready = False
                result.model_version = "unavailable"
            else:
                result.model_digest = promotion.digest
                result.model_version = promotion.version

        if not result.model_ready:
            result.fallback_reason = (
                result.error
                or str(result.model_outputs.get("status", "MODEL_UNAVAILABLE"))
            )
        result.model_outputs["model_digest"] = result.model_digest
        result.model_outputs["model_version"] = result.model_version
        return result

    def _dispatch(self, req: MLRequest) -> Optional[MLResult]:
        """
        Dispatch request to the appropriate model handler.
        Returns None for fire-and-forget requests (LR_TRAIN).
        Raises retryable processing failures so Kafka does not commit the request.
        """
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
        raise UnsupportedEventTypeError(
            f"unknown event_type={req.event_type} event_id={req.event_id}"
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
        if not self._lr_ready:
            return MLResult(
                event_id=req.event_id,
                event_type=req.event_type,
                tenant_id=req.tenant_id,
                model_outputs={
                    "probability": 0.0,
                    "level": "",
                    "status": "MODEL_UNAVAILABLE",
                    "model_ready": False,
                },
                model_version="unavailable",
                error="MODEL_UNAVAILABLE",
                model_ready=False,
                fallback_reason="MODEL_UNAVAILABLE",
            )
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
            model_version=(
                self._promotion(MODEL_LR).version
                if self._promotion(MODEL_LR)
                else config.MODEL_VERSION_LR
            ),
        )

    def _handle_lr_train(self, req: MLRequest) -> None:
        payload = req.payload
        raw_features = payload.get("features", [])
        label = float(payload.get("label", 0.0))
        learning_rate = float(payload.get("learning_rate", 0.01))

        features = [float(f) for f in raw_features]
        if len(features) != logistic_regression.FEATURE_SIZE:
            raise NonRetryableMessageError(
                f"lr_train: expected {logistic_regression.FEATURE_SIZE} features, "
                f"got {len(features)}"
            )

        if self._registry is not None:
            version = self._registry.stage_lr_candidate(
                event_id=req.event_id,
                tenant_id=req.tenant_id,
                features=features,
                label=label,
                learning_rate=learning_rate,
                default_state=logistic_regression.AmbiguityModel().to_dict(),
                base_version=config.MODEL_VERSION_LR,
            )
            logger.info(
                "lr_train: centrally staged candidate=%s event=%s tenant=%s; "
                "approval and promotion required",
                version,
                req.event_id,
                req.tenant_id,
            )
            return

        self._training_governance.authorize(
            req.tenant_id, "AMBIGUITY", config.LR_TRAINING_SCOPE
        )

        updated = self._lr_model.train_and_save(
            features,
            label,
            config.LR_MODEL_PATH,
            event_id=req.event_id,
            learning_rate=learning_rate,
        )
        logger.info(
            "lr_train: %s tenant=%s label=%.0f trained_on=%d",
            "ok" if updated else "duplicate",
            req.tenant_id, label, self._lr_model.trained_on,
        )

    def _handle_rca_cluster(self, req: MLRequest) -> MLResult:
        """
        Run HDBSCAN RCA clustering on the submitted payment candidates.

        Payload shape (from Go InvokeRCAClustering):
          {
            "candidates": [ { ...RCACandidate fields... }, ... ],
            "batch_id": "BATCH_2026_04_21",
            "feature_contract_version": "rca_v1",
          }

        If the approved model bundle is not loaded, returns MODEL_UNAVAILABLE
        with no predictions so Go falls back cleanly.

        When a finality_label is present in the payload (sent by Go after a batch
        reaches FULLY_SETTLED or PARTIALLY_SETTLED or FAILED), the candidates are buffered for retrain.
        """
        payload = req.payload
        raw_candidates: list[dict] = payload.get("candidates") or []
        batch_id: str = payload.get("batch_id", "")
        finality_label: str = payload.get("finality_label", "")

        if not self._rca_model.is_ready:
            logger.error(
                "rca_cluster: MODEL_UNAVAILABLE event_id=%s batch=%s tenant=%s",
                req.event_id, batch_id, req.tenant_id,
            )
            model_outputs = rca_hdbscan._empty_result()
            model_outputs.update({
                "status": "MODEL_UNAVAILABLE",
                "model_ready": False,
            })
            return MLResult(
                event_id=req.event_id,
                event_type=req.event_type,
                tenant_id=req.tenant_id,
                model_outputs=model_outputs,
                model_version="unavailable",
                error="MODEL_UNAVAILABLE",
                model_ready=False,
                fallback_reason="MODEL_UNAVAILABLE",
            )

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
        if finality_label in ("FULLY_SETTLED","FULLY_RECONCILED", "FAILED") and assignments:
            true_labels = [a["cluster_code"] for a in assignments]
            if self._registry is not None:
                self._registry.record_training_trigger(
                    req.event_id,
                    MODEL_RCA,
                    "RCA",
                    config.RCA_TRAINING_SCOPE,
                    req.tenant_id,
                    req.payload,
                )
            else:
                self._training_governance.authorize(
                    req.tenant_id, "RCA", config.RCA_TRAINING_SCOPE
                )
                logger.info(
                    "rca_cluster: governed trigger accepted; raw intent-level "
                    "runtime retraining is disabled event=%s tenant=%s",
                    req.event_id,
                    req.tenant_id,
                )
            logger.info(
                "rca_cluster: recorded %d examples for controlled retrain "
                "batch=%s label=%s tenant=%s",
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
            model_version=(
                self._promotion(MODEL_RCA).version
                if self._promotion(MODEL_RCA)
                else config.MODEL_VERSION_RCA
            ),
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
            model_version=(
                self._promotion(MODEL_LEAKAGE).version
                if self._promotion(MODEL_LEAKAGE)
                else config.MODEL_VERSION_LEAKAGE
            ),
        )

    def _handle_leakage_train(self, req: MLRequest) -> None:
        if self._registry is not None:
            self._registry.record_training_trigger(
                req.event_id,
                MODEL_LEAKAGE,
                "LEAKAGE",
                config.LEAKAGE_TRAINING_SCOPE,
                req.tenant_id,
                req.payload,
            )
            logger.info(
                "leakage_train: centrally recorded controlled-training trigger "
                "event=%s tenant=%s", req.event_id, req.tenant_id,
            )
            return
        payload = req.payload
        self._training_governance.authorize(
            req.tenant_id, "LEAKAGE", config.LEAKAGE_TRAINING_SCOPE
        )
        self._leakage_model.maybe_retrain_async(
            batch_id=str(payload.get("batch_id", "")),
            tenant_id=req.tenant_id,
        )
