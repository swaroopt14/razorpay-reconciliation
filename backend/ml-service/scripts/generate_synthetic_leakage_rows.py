from __future__ import annotations

import csv
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = ROOT / "generated" / "leakage_training" / "extracted" / "training_dataset_intent_safe.csv"
OUTPUT_DIR = ROOT / "generated" / "leakage_training" / "synthetic"
GENERATION_VERSION = "v1"
SYNTHETIC_ROWS_PER_ANCHOR = 20
SEED = 20260611


MODEL_FEATURES = [
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

OUTPUT_COLUMNS = [
    "row_id",
    "synthetic_flag",
    "parent_batch_id",
    "batch_id",
    "scenario_family",
    "batch_template",
    "generation_version",
    "sample_weight",
    *MODEL_FEATURES,
    "predicted_leakage_rate",
    "target_leakage_amount_minor",
]


@dataclass
class TemplateConfig:
    target_bounds: tuple[float, float]
    ref_coverage_bounds: tuple[float, float]
    parse_bounds: tuple[float, float]
    mapping_bounds: tuple[float, float]
    completeness_bounds: tuple[float, float]
    canonical_error_bounds: tuple[float, float]
    missing_required_bounds: tuple[float, float]
    unknown_column_bounds: tuple[int, int]
    invalid_amount_bounds: tuple[float, float]
    invalid_beneficiary_bounds: tuple[float, float]
    provider_missing_provider_ref_bounds: tuple[float, float]
    provider_missing_client_ref_bounds: tuple[float, float]
    provider_delay_p50_bounds: tuple[float, float]
    provider_delay_p95_bounds: tuple[float, float]
    tenant_delay_p50_bounds: tuple[float, float]
    tenant_delay_p95_bounds: tuple[float, float]
    density_bounds: tuple[float, float]
    count_multiplier_bounds: tuple[float, float]
    avg_amount_multiplier_bounds: tuple[float, float]
    stddev_multiplier_bounds: tuple[float, float]
    max_pair_bounds: tuple[int, int]


TEMPLATE_CONFIG: dict[str, TemplateConfig] = {
    "control_clean": TemplateConfig(
        target_bounds=(0.00, 0.02),
        ref_coverage_bounds=(0.97, 1.00),
        parse_bounds=(0.985, 1.00),
        mapping_bounds=(0.80, 0.95),
        completeness_bounds=(0.97, 1.00),
        canonical_error_bounds=(0.00, 0.01),
        missing_required_bounds=(0.00, 0.01),
        unknown_column_bounds=(0, 2),
        invalid_amount_bounds=(0.00, 0.003),
        invalid_beneficiary_bounds=(0.00, 0.003),
        provider_missing_provider_ref_bounds=(0.10, 0.18),
        provider_missing_client_ref_bounds=(0.00, 0.01),
        provider_delay_p50_bounds=(0.0, 1.0),
        provider_delay_p95_bounds=(3.0, 5.5),
        tenant_delay_p50_bounds=(0.0, 1.0),
        tenant_delay_p95_bounds=(3.0, 5.5),
        density_bounds=(0.00, 0.04),
        count_multiplier_bounds=(0.90, 1.12),
        avg_amount_multiplier_bounds=(0.92, 1.08),
        stddev_multiplier_bounds=(0.88, 1.12),
        max_pair_bounds=(1, 3),
    ),
    "unmatched_heavy": TemplateConfig(
        target_bounds=(0.24, 0.40),
        ref_coverage_bounds=(0.90, 0.99),
        parse_bounds=(0.96, 0.995),
        mapping_bounds=(0.72, 0.90),
        completeness_bounds=(0.94, 0.99),
        canonical_error_bounds=(0.00, 0.03),
        missing_required_bounds=(0.005, 0.03),
        unknown_column_bounds=(1, 5),
        invalid_amount_bounds=(0.00, 0.008),
        invalid_beneficiary_bounds=(0.00, 0.008),
        provider_missing_provider_ref_bounds=(0.13, 0.22),
        provider_missing_client_ref_bounds=(0.00, 0.02),
        provider_delay_p50_bounds=(0.5, 2.5),
        provider_delay_p95_bounds=(3.0, 7.0),
        tenant_delay_p50_bounds=(0.5, 2.0),
        tenant_delay_p95_bounds=(3.0, 6.5),
        density_bounds=(0.00, 0.06),
        count_multiplier_bounds=(0.92, 1.18),
        avg_amount_multiplier_bounds=(0.92, 1.08),
        stddev_multiplier_bounds=(0.90, 1.15),
        max_pair_bounds=(1, 4),
    ),
    "under_heavy": TemplateConfig(
        target_bounds=(0.03, 0.09),
        ref_coverage_bounds=(0.94, 1.00),
        parse_bounds=(0.97, 1.00),
        mapping_bounds=(0.74, 0.92),
        completeness_bounds=(0.95, 0.99),
        canonical_error_bounds=(0.00, 0.02),
        missing_required_bounds=(0.00, 0.025),
        unknown_column_bounds=(0, 4),
        invalid_amount_bounds=(0.00, 0.006),
        invalid_beneficiary_bounds=(0.00, 0.006),
        provider_missing_provider_ref_bounds=(0.12, 0.20),
        provider_missing_client_ref_bounds=(0.00, 0.015),
        provider_delay_p50_bounds=(1.0, 3.0),
        provider_delay_p95_bounds=(4.0, 8.0),
        tenant_delay_p50_bounds=(0.8, 2.8),
        tenant_delay_p95_bounds=(4.0, 7.5),
        density_bounds=(0.00, 0.05),
        count_multiplier_bounds=(0.92, 1.16),
        avg_amount_multiplier_bounds=(0.92, 1.08),
        stddev_multiplier_bounds=(0.90, 1.15),
        max_pair_bounds=(1, 4),
    ),
    "mixed_leakage": TemplateConfig(
        target_bounds=(0.14, 0.30),
        ref_coverage_bounds=(0.88, 0.98),
        parse_bounds=(0.93, 0.99),
        mapping_bounds=(0.68, 0.88),
        completeness_bounds=(0.90, 0.97),
        canonical_error_bounds=(0.01, 0.05),
        missing_required_bounds=(0.01, 0.05),
        unknown_column_bounds=(1, 6),
        invalid_amount_bounds=(0.00, 0.012),
        invalid_beneficiary_bounds=(0.00, 0.012),
        provider_missing_provider_ref_bounds=(0.14, 0.25),
        provider_missing_client_ref_bounds=(0.00, 0.025),
        provider_delay_p50_bounds=(1.5, 4.0),
        provider_delay_p95_bounds=(5.0, 10.0),
        tenant_delay_p50_bounds=(1.3, 3.5),
        tenant_delay_p95_bounds=(5.0, 9.0),
        density_bounds=(0.01, 0.08),
        count_multiplier_bounds=(0.92, 1.18),
        avg_amount_multiplier_bounds=(0.90, 1.10),
        stddev_multiplier_bounds=(0.92, 1.18),
        max_pair_bounds=(1, 5),
    ),
    "reference_stress": TemplateConfig(
        target_bounds=(0.04, 0.14),
        ref_coverage_bounds=(0.78, 0.95),
        parse_bounds=(0.88, 0.97),
        mapping_bounds=(0.60, 0.82),
        completeness_bounds=(0.82, 0.95),
        canonical_error_bounds=(0.02, 0.08),
        missing_required_bounds=(0.02, 0.08),
        unknown_column_bounds=(2, 8),
        invalid_amount_bounds=(0.00, 0.015),
        invalid_beneficiary_bounds=(0.005, 0.020),
        provider_missing_provider_ref_bounds=(0.20, 0.38),
        provider_missing_client_ref_bounds=(0.01, 0.08),
        provider_delay_p50_bounds=(1.0, 4.0),
        provider_delay_p95_bounds=(4.0, 9.0),
        tenant_delay_p50_bounds=(1.0, 3.5),
        tenant_delay_p95_bounds=(4.0, 8.0),
        density_bounds=(0.01, 0.10),
        count_multiplier_bounds=(0.88, 1.14),
        avg_amount_multiplier_bounds=(0.90, 1.10),
        stddev_multiplier_bounds=(0.92, 1.18),
        max_pair_bounds=(1, 6),
    ),
}


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_float(value: str | None, default: float | None = None) -> float | None:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    return float(text)


def parse_int(value: str | None, default: int | None = None) -> int | None:
    f = parse_float(value, None)
    if f is None:
        return default
    return int(round(f))


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def bounded_normal(rng: random.Random, mean: float, sigma: float, lo: float, hi: float) -> float:
    for _ in range(12):
        value = rng.gauss(mean, sigma)
        if lo <= value <= hi:
            return value
    return clamp(value, lo, hi)


def interpolate(bounds: tuple[float, float], severity: float, positive: bool = True) -> float:
    lo, hi = bounds
    if positive:
        return lo + severity * (hi - lo)
    return hi - severity * (hi - lo)


def family_from_template(template: str) -> str:
    return template


def anchor_template_medians(anchors: list[dict[str, str]]) -> dict[str, dict[str, float]]:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    numeric_cols = [col for col in MODEL_FEATURES if col not in {"currency", "source_system", "rail", "intent_type", "provider_key"}]
    for row in anchors:
        template = row["batch_template"]
        for col in numeric_cols:
            value = parse_float(row.get(col), None)
            if value is not None:
                grouped[template][col].append(value)
    result: dict[str, dict[str, float]] = {}
    for template, cols in grouped.items():
        result[template] = {col: statistics.median(vals) for col, vals in cols.items() if vals}
    return result


def clean_anchor_row(row: dict[str, str], medians: dict[str, dict[str, float]]) -> dict[str, Any]:
    template = row["batch_template"]
    cleaned: dict[str, Any] = {
        "row_id": f"anchor::{row['batch_id']}",
        "synthetic_flag": 0,
        "parent_batch_id": row["batch_id"],
        "batch_id": row["batch_id"],
        "scenario_family": family_from_template(template),
        "batch_template": template,
        "generation_version": GENERATION_VERSION,
        "sample_weight": 3.0,
    }
    for col in MODEL_FEATURES:
        if col in {"currency", "source_system", "rail", "intent_type", "provider_key"}:
            cleaned[col] = row[col]
            continue
        value = parse_float(row.get(col), None)
        if value is None:
            value = medians[template][col]
        if col in {"batch_intent_count", "batch_max_pair_count", "created_hour", "created_day_of_week", "weekend_flag", "unknown_column_count"}:
            cleaned[col] = int(round(value))
        else:
            cleaned[col] = float(value)
    cleaned["predicted_leakage_rate"] = float(parse_float(row["predicted_leakage_rate"], 0.0))
    cleaned["target_leakage_amount_minor"] = cleaned["batch_total_intended_amount_minor"] * cleaned["predicted_leakage_rate"]
    return cleaned


def choose_rail(rng: random.Random, anchor_rail: str) -> str:
    if rng.random() < 0.75:
        return anchor_rail
    return "IMPS" if anchor_rail == "UPI" else "UPI"


def choose_day(rng: random.Random, anchor_day: int) -> tuple[int, int]:
    if rng.random() < 0.55:
        day = anchor_day
    else:
        day = rng.randint(0, 6)
    return day, 1 if day >= 5 else 0


def generate_synthetic_row(
    rng: random.Random,
    anchor: dict[str, Any],
    anchor_index: int,
    variant_index: int,
) -> dict[str, Any]:
    template = anchor["batch_template"]
    cfg = TEMPLATE_CONFIG[template]
    family_lo, family_hi = cfg.target_bounds
    anchor_rate = anchor["predicted_leakage_rate"]
    if family_hi > family_lo:
        anchor_severity = clamp((anchor_rate - family_lo) / (family_hi - family_lo), 0.0, 1.0)
    else:
        anchor_severity = 0.5
    severity = clamp(rng.gauss(anchor_severity, 0.14), 0.0, 1.0)

    count_multiplier = bounded_normal(
        rng,
        mean=1.0 + (severity - 0.5) * 0.06,
        sigma=0.08,
        lo=cfg.count_multiplier_bounds[0],
        hi=cfg.count_multiplier_bounds[1],
    )
    avg_multiplier = bounded_normal(
        rng,
        mean=1.0 + (severity - 0.5) * 0.04,
        sigma=0.06,
        lo=cfg.avg_amount_multiplier_bounds[0],
        hi=cfg.avg_amount_multiplier_bounds[1],
    )
    std_multiplier = bounded_normal(
        rng,
        mean=1.0 + severity * 0.06,
        sigma=0.07,
        lo=cfg.stddev_multiplier_bounds[0],
        hi=cfg.stddev_multiplier_bounds[1],
    )

    batch_intent_count = max(80, int(round(anchor["batch_intent_count"] * count_multiplier)))
    batch_avg_amount = max(100.0, anchor["batch_avg_amount_minor"] * avg_multiplier)
    batch_amount_stddev = max(50.0, anchor["batch_amount_stddev"] * std_multiplier)

    density_base = interpolate(cfg.density_bounds, severity, positive=True)
    batch_same_beneficiary_amount_density = clamp(
        rng.gauss((anchor["batch_same_beneficiary_amount_density"] + density_base) / 2.0, 0.015),
        cfg.density_bounds[0],
        cfg.density_bounds[1],
    )
    batch_max_pair_estimate = int(round(1 + severity * (cfg.max_pair_bounds[1] - 1) + batch_same_beneficiary_amount_density * 25))
    batch_max_pair_count = clamp(batch_max_pair_estimate, cfg.max_pair_bounds[0], cfg.max_pair_bounds[1])

    client_payout_ref_coverage_rate = clamp(
        rng.gauss(interpolate(cfg.ref_coverage_bounds, severity, positive=False), 0.012),
        *cfg.ref_coverage_bounds,
    )
    parse_success_rate = clamp(
        rng.gauss(interpolate(cfg.parse_bounds, severity, positive=False), 0.008),
        *cfg.parse_bounds,
    )
    mapping_confidence_score = clamp(
        rng.gauss(interpolate(cfg.mapping_bounds, severity, positive=False), 0.02),
        *cfg.mapping_bounds,
    )
    required_field_completeness_rate = clamp(
        rng.gauss(interpolate(cfg.completeness_bounds, severity, positive=False), 0.01),
        *cfg.completeness_bounds,
    )

    missing_required_field_rate = clamp(
        rng.gauss(interpolate(cfg.missing_required_bounds, severity, positive=True), 0.006),
        *cfg.missing_required_bounds,
    )
    canonicalization_error_rate = clamp(
        max(
            rng.gauss(interpolate(cfg.canonical_error_bounds, severity, positive=True), 0.006),
            max(0.0, 1.0 - parse_success_rate) * 0.85,
        ),
        *cfg.canonical_error_bounds,
    )
    unknown_column_count = int(round(clamp(
        rng.gauss(interpolate((float(cfg.unknown_column_bounds[0]), float(cfg.unknown_column_bounds[1])), severity, positive=True), 0.8),
        float(cfg.unknown_column_bounds[0]),
        float(cfg.unknown_column_bounds[1]),
    )))
    invalid_amount_rate = clamp(
        rng.gauss(interpolate(cfg.invalid_amount_bounds, severity, positive=True), 0.002),
        *cfg.invalid_amount_bounds,
    )
    invalid_beneficiary_rate = clamp(
        rng.gauss(interpolate(cfg.invalid_beneficiary_bounds, severity, positive=True), 0.002),
        *cfg.invalid_beneficiary_bounds,
    )

    provider_missing_provider_ref_rate = clamp(
        rng.gauss(interpolate(cfg.provider_missing_provider_ref_bounds, severity, positive=True), 0.01),
        *cfg.provider_missing_provider_ref_bounds,
    )
    provider_missing_client_ref_rate = clamp(
        rng.gauss(interpolate(cfg.provider_missing_client_ref_bounds, severity, positive=True), 0.006),
        *cfg.provider_missing_client_ref_bounds,
    )
    provider_settlement_delay_p50_days = clamp(
        rng.gauss(interpolate(cfg.provider_delay_p50_bounds, severity, positive=True), 0.25),
        *cfg.provider_delay_p50_bounds,
    )
    provider_settlement_delay_p95_days = clamp(
        rng.gauss(interpolate(cfg.provider_delay_p95_bounds, severity, positive=True), 0.5),
        max(cfg.provider_delay_p95_bounds[0], provider_settlement_delay_p50_days + 1.0),
        cfg.provider_delay_p95_bounds[1],
    )
    settlement_delay_p50_days = clamp(
        rng.gauss((provider_settlement_delay_p50_days + interpolate(cfg.tenant_delay_p50_bounds, severity, positive=True)) / 2.0, 0.2),
        *cfg.tenant_delay_p50_bounds,
    )
    settlement_delay_p95_days = clamp(
        rng.gauss((provider_settlement_delay_p95_days + interpolate(cfg.tenant_delay_p95_bounds, severity, positive=True)) / 2.0, 0.35),
        max(cfg.tenant_delay_p95_bounds[0], settlement_delay_p50_days + 1.0),
        cfg.tenant_delay_p95_bounds[1],
    )

    target_rate = clamp(
        rng.gauss(anchor_rate * 0.65 + interpolate(cfg.target_bounds, severity, positive=True) * 0.35, 0.012),
        *cfg.target_bounds,
    )
    if template == "control_clean":
        target_rate = min(target_rate, 0.02)

    created_day_of_week, weekend_flag = choose_day(rng, anchor["created_day_of_week"])
    created_hour = int(clamp(round(rng.gauss(anchor["created_hour"], 0.9)), 6, 12))
    rail = choose_rail(rng, anchor["rail"])

    batch_total_intended_amount_minor = batch_intent_count * batch_avg_amount
    batch_total_intended_amount_minor *= bounded_normal(rng, 1.0, 0.02, 0.96, 1.04)

    min_ratio = clamp(rng.gauss(anchor["batch_min_amount_minor"] / anchor["batch_avg_amount_minor"], 0.03), 0.02, 0.35)
    max_ratio = clamp(rng.gauss(anchor["batch_max_amount_minor"] / anchor["batch_avg_amount_minor"], 0.10), 1.25, 3.20)
    batch_min_amount_minor = min(batch_avg_amount * min_ratio, batch_avg_amount * 0.8)
    batch_max_amount_minor = max(batch_avg_amount * max_ratio, batch_avg_amount * 1.2)
    batch_amount_stddev = min(batch_amount_stddev, batch_max_amount_minor - batch_min_amount_minor)
    batch_amount_stddev = max(40.0, batch_amount_stddev)

    row = {
        "row_id": f"synthetic::{anchor['batch_id']}::{variant_index + 1:03d}",
        "synthetic_flag": 1,
        "parent_batch_id": anchor["batch_id"],
        "batch_id": f"SYN_{anchor_index + 1:02d}_{variant_index + 1:03d}",
        "scenario_family": family_from_template(template),
        "batch_template": template,
        "generation_version": GENERATION_VERSION,
        "sample_weight": 1.0,
        "batch_total_intended_amount_minor": batch_total_intended_amount_minor,
        "batch_intent_count": batch_intent_count,
        "batch_avg_amount_minor": batch_avg_amount,
        "batch_max_amount_minor": batch_max_amount_minor,
        "batch_min_amount_minor": batch_min_amount_minor,
        "batch_amount_stddev": batch_amount_stddev,
        "batch_same_beneficiary_amount_density": batch_same_beneficiary_amount_density,
        "batch_max_pair_count": int(batch_max_pair_count),
        "client_payout_ref_coverage_rate": client_payout_ref_coverage_rate,
        "currency": anchor["currency"],
        "source_system": anchor["source_system"],
        "rail": rail,
        "created_hour": created_hour,
        "created_day_of_week": created_day_of_week,
        "weekend_flag": weekend_flag,
        "intent_type": anchor["intent_type"],
        "parse_success_rate": parse_success_rate,
        "mapping_confidence_score": mapping_confidence_score,
        "required_field_completeness_rate": required_field_completeness_rate,
        "canonicalization_error_rate": canonicalization_error_rate,
        "missing_required_field_rate": missing_required_field_rate,
        "unknown_column_count": int(unknown_column_count),
        "invalid_amount_rate": invalid_amount_rate,
        "invalid_beneficiary_rate": invalid_beneficiary_rate,
        "provider_key": anchor["provider_key"],
        "provider_missing_provider_ref_rate": provider_missing_provider_ref_rate,
        "provider_missing_client_ref_rate": provider_missing_client_ref_rate,
        "provider_settlement_delay_p50_days": provider_settlement_delay_p50_days,
        "provider_settlement_delay_p95_days": provider_settlement_delay_p95_days,
        "settlement_delay_p50_days": settlement_delay_p50_days,
        "settlement_delay_p95_days": settlement_delay_p95_days,
        "predicted_leakage_rate": target_rate,
        "target_leakage_amount_minor": batch_total_intended_amount_minor * target_rate,
    }
    return row


def format_value(column: str, value: Any) -> str:
    if isinstance(value, str):
        return value
    if column in {"synthetic_flag", "batch_intent_count", "batch_max_pair_count", "created_hour", "created_day_of_week", "weekend_flag", "unknown_column_count"}:
        return str(int(value))
    if column == "sample_weight":
        return f"{float(value):.2f}"
    return f"{float(value):.6f}"


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: format_value(column, row[column]) for column in OUTPUT_COLUMNS})


def correlation(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    if max(xs) == min(xs) or max(ys) == min(ys):
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x <= 0 or var_y <= 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def build_quality_report(anchor_rows: list[dict[str, Any]], synthetic_rows: list[dict[str, Any]], combined_rows: list[dict[str, Any]]) -> dict[str, Any]:
    target_values = [row["predicted_leakage_rate"] for row in combined_rows]
    family_counts = Counter(row["scenario_family"] for row in combined_rows)
    target_by_family = {
        family: {
            "count": len(values),
            "min": min(values),
            "p50": statistics.median(values),
            "max": max(values),
            "mean": sum(values) / len(values),
        }
        for family, values in defaultdict(list, {
            family: [row["predicted_leakage_rate"] for row in combined_rows if row["scenario_family"] == family]
            for family in family_counts
        }).items()
    }

    null_counts = {
        col: sum(1 for row in combined_rows if row[col] in ("", None))
        for col in OUTPUT_COLUMNS
    }
    constant_columns = [
        col for col in OUTPUT_COLUMNS
        if col not in {"row_id", "parent_batch_id", "batch_id"} and len({row[col] for row in combined_rows}) == 1
    ]

    logical_violations = {
        "min_gt_avg": sum(1 for row in combined_rows if row["batch_min_amount_minor"] > row["batch_avg_amount_minor"]),
        "avg_gt_max": sum(1 for row in combined_rows if row["batch_avg_amount_minor"] > row["batch_max_amount_minor"]),
        "p50_gt_p95_provider": sum(
            1 for row in combined_rows
            if row["provider_settlement_delay_p50_days"] > row["provider_settlement_delay_p95_days"]
        ),
        "p50_gt_p95_tenant": sum(
            1 for row in combined_rows
            if row["settlement_delay_p50_days"] > row["settlement_delay_p95_days"]
        ),
        "rate_out_of_bounds": sum(
            1 for row in combined_rows
            if not (0.0 <= row["predicted_leakage_rate"] <= 1.0)
        ),
        "coverage_out_of_bounds": sum(
            1 for row in combined_rows
            if not (0.0 <= row["client_payout_ref_coverage_rate"] <= 1.0)
        ),
    }

    corr_features = [
        "provider_missing_provider_ref_rate",
        "provider_missing_client_ref_rate",
        "provider_settlement_delay_p50_days",
        "provider_settlement_delay_p95_days",
        "missing_required_field_rate",
        "canonicalization_error_rate",
        "parse_success_rate",
        "mapping_confidence_score",
        "batch_same_beneficiary_amount_density",
    ]
    correlations = {}
    ys = [row["predicted_leakage_rate"] for row in combined_rows]
    for col in corr_features:
        xs = [float(row[col]) for row in combined_rows]
        correlations[col] = correlation(xs, ys)

    report = {
        "generation_version": GENERATION_VERSION,
        "seed": SEED,
        "anchor_row_count": len(anchor_rows),
        "synthetic_row_count": len(synthetic_rows),
        "combined_row_count": len(combined_rows),
        "family_counts": dict(family_counts),
        "target_summary": {
            "min": min(target_values),
            "p50": statistics.median(target_values),
            "max": max(target_values),
            "mean": sum(target_values) / len(target_values),
        },
        "target_by_family": target_by_family,
        "null_counts": null_counts,
        "constant_columns": constant_columns,
        "logical_violations": logical_violations,
        "feature_target_correlations": correlations,
        "anchor_target_values": [
            {
                "batch_id": row["batch_id"],
                "scenario_family": row["scenario_family"],
                "predicted_leakage_rate": row["predicted_leakage_rate"],
            }
            for row in anchor_rows
        ],
        "learnability_assessment": {
            "label_variety_ok": len(set(round(v, 3) for v in target_values)) >= 12,
            "null_free_model_columns": all(null_counts[col] == 0 for col in OUTPUT_COLUMNS if col not in {"row_id", "parent_batch_id"}),
            "non_constant_feature_count": sum(
                1
                for col in MODEL_FEATURES
                if len({row[col] for row in combined_rows}) > 1
            ),
            "notes": [
                "Synthetic rows preserve leakage families instead of sampling columns independently.",
                "The dataset is suitable for quick prototyping but not final production validation.",
                "Currency/source/provider remain constant because the anchor corpus only contains Razorpay INR payouts.",
            ],
        },
    }
    return report


def write_quality_markdown(path: Path, report: dict[str, Any]) -> None:
    lines = [
        "# Synthetic Leakage Dataset Quality",
        "",
        f"- Generation version: `{report['generation_version']}`",
        f"- Seed: `{report['seed']}`",
        f"- Anchor rows: `{report['anchor_row_count']}`",
        f"- Synthetic rows: `{report['synthetic_row_count']}`",
        f"- Combined rows: `{report['combined_row_count']}`",
        "",
        "## Target Summary",
        "",
        f"- Min leakage rate: `{report['target_summary']['min']:.4f}`",
        f"- Median leakage rate: `{report['target_summary']['p50']:.4f}`",
        f"- Max leakage rate: `{report['target_summary']['max']:.4f}`",
        f"- Mean leakage rate: `{report['target_summary']['mean']:.4f}`",
        "",
        "## Family Counts",
        "",
    ]
    for family, count in sorted(report["family_counts"].items()):
        lines.append(f"- `{family}`: `{count}`")
    lines.extend(["", "## Target By Family", ""])
    for family, stats in sorted(report["target_by_family"].items()):
        lines.append(
            f"- `{family}`: count=`{stats['count']}`, min=`{stats['min']:.4f}`, p50=`{stats['p50']:.4f}`, max=`{stats['max']:.4f}`, mean=`{stats['mean']:.4f}`"
        )
    lines.extend(["", "## Logical Violations", ""])
    for key, value in sorted(report["logical_violations"].items()):
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Feature/Target Correlations", ""])
    for key, value in sorted(report["feature_target_correlations"].items()):
        rendered = "n/a" if value is None else f"{value:.4f}"
        lines.append(f"- `{key}`: `{rendered}`")
    lines.extend(["", "## Learnability Notes", ""])
    for note in report["learnability_assessment"]["notes"]:
        lines.append(f"- {note}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    rng = random.Random(SEED)
    raw_rows = read_rows(INPUT_PATH)
    medians = anchor_template_medians(raw_rows)
    anchor_rows = [clean_anchor_row(row, medians) for row in raw_rows]

    synthetic_rows: list[dict[str, Any]] = []
    for anchor_index, anchor in enumerate(anchor_rows):
        for variant_index in range(SYNTHETIC_ROWS_PER_ANCHOR):
            synthetic_rows.append(generate_synthetic_row(rng, anchor, anchor_index, variant_index))

    combined_rows = anchor_rows + synthetic_rows
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    anchor_out = OUTPUT_DIR / "anchor_model_ready.csv"
    synthetic_out = OUTPUT_DIR / f"synthetic_model_ready_{len(synthetic_rows)}.csv"
    combined_out = OUTPUT_DIR / f"combined_model_ready_{len(combined_rows)}.csv"
    report_json_out = OUTPUT_DIR / "quality_report.json"
    report_md_out = OUTPUT_DIR / "quality_report.md"

    write_csv(anchor_out, anchor_rows)
    write_csv(synthetic_out, synthetic_rows)
    write_csv(combined_out, combined_rows)

    report = build_quality_report(anchor_rows, synthetic_rows, combined_rows)
    report_json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_quality_markdown(report_md_out, report)
    print(json.dumps(
        {
            "anchor_rows": len(anchor_rows),
            "synthetic_rows": len(synthetic_rows),
            "combined_rows": len(combined_rows),
            "outputs": {
                "anchor": str(anchor_out.relative_to(ROOT)),
                "synthetic": str(synthetic_out.relative_to(ROOT)),
                "combined": str(combined_out.relative_to(ROOT)),
                "quality_json": str(report_json_out.relative_to(ROOT)),
                "quality_md": str(report_md_out.relative_to(ROOT)),
            },
        },
        indent=2,
    ))


if __name__ == "__main__":
    main()
