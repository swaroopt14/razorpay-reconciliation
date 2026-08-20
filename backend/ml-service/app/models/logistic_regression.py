"""
Online logistic regression model for ambiguity risk prediction.

Exact port of Go internal/ml/logistic/regression.go.
Uses the same hardcoded domain-knowledge weights, the same sigmoid, and the
same single-step SGD update rule so numerical outputs are identical to Go.

Domain-knowledge initial weights (not trained, encodes expert priors):
  [0] ambiguity_rate            weight=3.0  (strongest signal)
  [1] provider_ref_missing_rate weight=2.5
  [2] low_confidence_proxy      weight=2.0  (= 1 - avg_confidence, inverted)
  [3] value_at_risk_rate        weight=1.5
  bias = -2.0  (conservative — starts with low predicted risk)
"""

from __future__ import annotations

import json
import logging
import math
import os
import tempfile
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

FEATURE_SIZE = 4
DEFAULT_WEIGHTS: list[float] = [3.0, 2.5, 2.0, 1.5]
DEFAULT_BIAS: float = -2.0


def build_features(
    ambiguity_rate: float,
    provider_ref_missing_rate: float,
    avg_confidence: float,
    value_at_risk_minor: float,
    total_intended_minor: float,
) -> list[float]:
    """
    Build the 4-element feature vector.  Matches Go logistic.BuildFeatures() exactly.

    Feature[2] is INVERTED: (1 - avg_confidence) so a higher value means worse quality.
    Feature[3] is value_at_risk_rate = value_at_risk_minor / total_intended_minor,
    clamped to [0,1].  If total_intended_minor == 0 the rate is 0 (conservative).
    """
    f3 = 0.0
    if total_intended_minor > 0:
        f3 = _clamp(value_at_risk_minor / total_intended_minor)

    return [
        _clamp(ambiguity_rate),
        _clamp(provider_ref_missing_rate),
        _clamp(1.0 - avg_confidence),  # low_confidence_proxy
        f3,
    ]


def predict_level(prob: float) -> str:
    """Exact thresholds from Go logistic.PredictLevel."""
    if prob >= 0.80:
        return "CRITICAL"
    if prob >= 0.60:
        return "HIGH"
    if prob >= 0.40:
        return "MEDIUM"
    return "LOW"


class AmbiguityModel:
    """
    In-memory logistic regression model with online SGD training.
    Thread-safe for concurrent predict + train calls.
    """

    def __init__(
        self,
        weights: list[float] | None = None,
        bias: float = DEFAULT_BIAS,
        trained_on: int = 0,
        last_event_id: str = "",
    ) -> None:
        self.weights: list[float] = list(weights) if weights else list(DEFAULT_WEIGHTS)
        self.bias: float = bias
        self.num_features: int = FEATURE_SIZE
        self.trained_on: int = trained_on
        self.last_event_id: str = last_event_id
        self._lock = Lock()

    # ── Inference ──────────────────────────────────────────────────────────────

    def predict(self, features: list[float]) -> float:
        """
        sigmoid(bias + sum(weight[i] * feature[i])).
        Matches Go Model.Predict() exactly.
        """
        z = self.bias + sum(w * f for w, f in zip(self.weights, features))
        return _sigmoid(z)

    # ── Online training ────────────────────────────────────────────────────────

    def train(self, features: list[float], label: float, learning_rate: float = 0.01) -> None:
        """
        One SGD update step.  Matches Go Model.Train() exactly:
          error = predict(features) - label
          bias   -= lr * error
          w[i]   -= lr * error * features[i]
        """
        with self._lock:
            error = self.predict(features) - label
            self.bias -= learning_rate * error
            for i in range(len(self.weights)):
                self.weights[i] -= learning_rate * error * features[i]
            self.trained_on += 1

    # ── Serialisation ──────────────────────────────────────────────────────────

    def train_and_save(
        self,
        features: list[float],
        label: float,
        path: str,
        event_id: str,
        learning_rate: float = 0.01,
    ) -> bool:
        """Atomically persist one SGD step before making it visible in memory."""
        with self._lock:
            if event_id and event_id == self.last_event_id:
                return False

            error = self.predict(features) - label
            new_bias = self.bias - learning_rate * error
            new_weights = [
                weight - learning_rate * error * feature
                for weight, feature in zip(self.weights, features)
            ]
            state = {
                "weights": new_weights,
                "bias": new_bias,
                "num_features": self.num_features,
                "trained_on": self.trained_on + 1,
                "last_event_id": event_id,
            }
            _persist_state(path, state)

            self.weights = new_weights
            self.bias = new_bias
            self.trained_on += 1
            self.last_event_id = event_id
            return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "weights": self.weights,
            "bias": self.bias,
            "num_features": self.num_features,
            "trained_on": self.trained_on,
            "last_event_id": self.last_event_id,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> AmbiguityModel:
        return cls(
            weights=d.get("weights", DEFAULT_WEIGHTS),
            bias=d.get("bias", DEFAULT_BIAS),
            trained_on=d.get("trained_on", 0),
            last_event_id=d.get("last_event_id", ""),
        )

    def save(self, path: str) -> None:
        try:
            _persist_state(path, self.to_dict())
            logger.info("lr_model: saved trained_on=%d path=%s", self.trained_on, path)
        except Exception as exc:
            logger.error("lr_model: save failed: %s", exc)
            raise

    @classmethod
    def load(cls, path: str) -> AmbiguityModel:
        try:
            with open(path) as fh:
                d = json.load(fh)
            model = cls.from_dict(d)
            logger.info("lr_model: loaded trained_on=%d path=%s", model.trained_on, path)
            return model
        except FileNotFoundError:
            logger.info("lr_model: no saved model at %s — using domain-knowledge defaults", path)
            return cls()
        except Exception as exc:
            logger.error("lr_model: load failed: %s — using defaults", exc)
            return cls()


# ── Module-level helpers ────────────────────────────────────────────────────────

def _sigmoid(z: float) -> float:
    """Standard logistic sigmoid, safe against overflow."""
    try:
        return 1.0 / (1.0 + math.exp(-z))
    except OverflowError:
        return 0.0 if z < 0 else 1.0


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _persist_state(path: str, state: dict[str, Any]) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=directory,
            prefix=".lr_model_",
            suffix=".tmp",
            delete=False,
        ) as fh:
            temp_path = fh.name
            json.dump(state, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp_path, path)
    except Exception:
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
        raise
