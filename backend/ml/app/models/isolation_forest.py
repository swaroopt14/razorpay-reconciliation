"""
Isolation Forest anomaly detector.

Ported from Go internal/ml/isolation/forest.go.
Uses sklearn.IsolationForest with the same hyperparameters (100 trees, 256 subsample,
seed=42) and normalises the raw sklearn score to [0,1] matching the Go implementation's
level thresholds: >=0.80 CRITICAL, >=0.65 HIGH, >=0.55 MEDIUM, <0.55 LOW.

Normalisation strategy: the sklearn score_samples() output is rescaled against the
training-data range so the most-normal point maps to 0 and the most-anomalous maps to
1.  Out-of-range test samples are clamped.  This faithfully preserves the relative
ordering produced by Go's cFactor path-length normalisation.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest as _SklearnIF

logger = logging.getLogger(__name__)

# Must match Go isolation.FeatureNames order exactly
FEATURE_NAMES: list[str] = [
    "ambiguity_rate",
    "variance_rate",
    "settlement_gap",
    "unresolved_ratio",
    "missing_ref_rate",
]

N_ESTIMATORS = 100
MAX_SAMPLES = 256
RANDOM_STATE = 42
MIN_SAMPLES = 10  # matches Go const minBatches = 10


def build_features(
    ambiguity_rate: float,
    variance_rate: float,
    settlement_ratio: float,
    unresolved_ratio: float,
    missing_ref_rate: float,
) -> list[float]:
    """
    Build the 5-element feature vector.  Matches Go isolation.BuildFeatures() exactly.
    settlement_ratio is converted to settlement_gap = 1 - settlement_ratio so that
    higher values always mean worse (consistent with other features).
    """
    return [
        _clamp(ambiguity_rate),
        _clamp(variance_rate),
        _clamp(1.0 - settlement_ratio),   # settlement_gap — matches Go
        _clamp(unresolved_ratio),
        _clamp(missing_ref_rate),
    ]


def score(
    features: list[float],
    history: list[list[float]],
) -> dict[str, Any]:
    """
    Score a single sample against the provided history using IsolationForest.
    Returns a dict: {score, level, anomaly_type}.

    If history is too short, returns the same INSUFFICIENT_DATA fallback as Go.
    """
    if len(history) < MIN_SAMPLES:
        return {
            "score": 0.5,
            "level": "INSUFFICIENT_DATA",
            "anomaly_type": "not_enough_history",
        }

    X_train = np.array(history, dtype=np.float64)
    sample = np.array(features, dtype=np.float64).reshape(1, -1)

    clf = _SklearnIF(
        n_estimators=N_ESTIMATORS,
        max_samples=min(MAX_SAMPLES, len(history)),
        random_state=RANDOM_STATE,
        contamination="auto",
    )
    clf.fit(X_train)

    # score_samples: higher (less negative) = more normal, lower = more anomalous.
    # We flip and normalise using the training range so the output matches Go's [0,1]
    # where 0 = perfectly normal, 1 = maximally anomalous.
    train_scores: np.ndarray = clf.score_samples(X_train)
    sample_score: float = float(clf.score_samples(sample)[0])

    min_s = float(train_scores.min())
    max_s = float(train_scores.max())

    if max_s == min_s:
        normalised = 0.5
    else:
        # Lower raw score → more anomalous → higher normalised score
        normalised = float((max_s - sample_score) / (max_s - min_s))

    normalised = max(0.0, min(1.0, normalised))

    return {
        "score": normalised,
        "level": _level_from_score(normalised),
        "anomaly_type": _dominant_anomaly_type(features),
    }


# ── Internal helpers ────────────────────────────────────────────────────────────

def _level_from_score(s: float) -> str:
    """Exact thresholds from Go isolation.levelFromScore."""
    if s >= 0.80:
        return "CRITICAL"
    if s >= 0.65:
        return "HIGH"
    if s >= 0.55:
        return "MEDIUM"
    return "LOW"


def _dominant_anomaly_type(features: list[float]) -> str:
    """Mirrors Go dominantAnomalyType: returns the name of the highest feature."""
    if not features:
        return "unknown"
    idx = int(np.argmax(features))
    return FEATURE_NAMES[idx]


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, float(v)))
