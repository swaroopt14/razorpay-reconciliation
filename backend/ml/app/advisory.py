"""Explainability helpers for advisory-only ML outputs."""

from __future__ import annotations

from typing import Iterable


def magnitude_contributions(
    feature_names: Iterable[str],
    values: Iterable[float],
) -> list[dict[str, object]]:
    """Return an honest input-magnitude proxy when a model has no local explainer."""
    pairs = [
        (str(name), float(value))
        for name, value in zip(feature_names, values)
    ]
    denominator = sum(abs(value) for _, value in pairs)
    return [
        {
            "feature": name,
            "value": value,
            "contribution": (
                abs(value) / denominator if denominator > 0 else 0.0
            ),
            "method": "normalized_input_magnitude_proxy",
        }
        for name, value in sorted(
            pairs, key=lambda item: abs(item[1]), reverse=True
        )
    ]
