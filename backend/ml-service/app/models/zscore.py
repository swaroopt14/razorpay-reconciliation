"""
Z-score anomaly detector.

Exact port of Go internal/ml/zscore/detector.go.

Critical implementation notes to preserve numerical equivalence with Go:
  - Uses POPULATION stddev (divide by N, not N-1).  Go explicitly uses N.
  - MinSamples = 5: fewer history points → INSUFFICIENT_DATA.
  - stddev == 0 edge case: if current == mean → LOW (z=0); else → CRITICAL (z=999).
  - score = min(|z| / 3.0, 1.0)  (3-sigma rule, capped at 1).
  - Levels from |z|: >=3.0 CRITICAL, >=2.0 HIGH, >=1.0 MEDIUM, <1.0 LOW.
"""

from __future__ import annotations

import math
from typing import Any

MIN_SAMPLES: int = 5  # matches Go const MinSamples = 5


def detect(current_value: float, history: list[float]) -> dict[str, Any]:
    """
    Compute z-score anomaly for current_value against history.
    Returns dict: {score, level, z_score, mean, std_dev}.
    """
    if len(history) < MIN_SAMPLES:
        return {
            "score": 0.0,
            "level": "INSUFFICIENT_DATA",
            "z_score": 0.0,
            "mean": 0.0,
            "std_dev": 0.0,
        }

    mean = _mean(history)
    std_dev = _population_std(history, mean)

    if std_dev == 0.0:
        if current_value == mean:
            return {"score": 0.0, "level": "LOW", "z_score": 0.0, "mean": mean, "std_dev": 0.0}
        # Non-zero deviation from a constant baseline — treat as CRITICAL
        return {"score": 1.0, "level": "CRITICAL", "z_score": 999.0, "mean": mean, "std_dev": 0.0}

    z_score = (current_value - mean) / std_dev
    abs_z = abs(z_score)
    score = min(abs_z / 3.0, 1.0)

    return {
        "score": score,
        "level": _level_from_z(abs_z),
        "z_score": z_score,
        "mean": mean,
        "std_dev": std_dev,
    }


# ── Internal helpers ─────────────────────────────────────────────────────────

def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _population_std(values: list[float], mean: float) -> float:
    """Population stddev — divide by N, not N-1.  Matches Go computeStdDev."""
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return math.sqrt(variance)


def _level_from_z(abs_z: float) -> str:
    """Exact thresholds from Go zscore.levelFromZ."""
    if abs_z >= 3.0:
        return "CRITICAL"
    if abs_z >= 2.0:
        return "HIGH"
    if abs_z >= 1.0:
        return "MEDIUM"
    return "LOW"
