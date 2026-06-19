from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# Event type constants — must match mlclient/schemas.go exactly
EVENT_TYPE_IF_SCORE = "ISOLATION_FOREST_SCORE"
EVENT_TYPE_ZSCORE = "ZSCORE_DETECT"
EVENT_TYPE_LR_PREDICT = "LOGISTIC_REGRESSION_PREDICT"
EVENT_TYPE_LR_TRAIN = "LOGISTIC_REGRESSION_TRAIN"
EVENT_TYPE_RCA_CLUSTER = "RCA_CLUSTER_SUMMARIZE"
EVENT_TYPE_LEAKAGE_PREDICT = "LEAKAGE_PREDICTION_PREDICT"
EVENT_TYPE_LEAKAGE_TRAIN = "LEAKAGE_PREDICTION_TRAIN"


@dataclass
class RCACandidate:
    """
    One payment intent with all merged signals from Services 2, 5B, 5C, 6, 7.
    Field names and order must stay in sync with Go mlclient.RCACandidate.
    """
    intent_id: str = ""
    reason_text: str = ""
    intended_amount_minor: int = 0
    # Categorical
    source_strength_class: str = "UNKNOWN"
    observation_kind: str = "UNKNOWN"
    decision_type: str = "UNKNOWN"
    governance_state: str = "UNKNOWN"
    # Numeric
    parse_confidence: float = 0.0
    mapping_confidence: float = 0.0
    carrier_richness_score: float = 0.0
    attachment_readiness_score: float = 0.0
    ambiguity_score: float = 0.0
    confidence_score: float = 0.0
    amount_variance_pct: float = 0.0
    settlement_delay_days: int = 0
    proof_readiness_score: float = 0.0
    matchability_score: float = 0.0
    pack_completeness_score: float = 0.0
    candidate_count: int = 0
    missing_leaf_count: int = 0
    # Binary flags
    missing_client_ref: int = 0
    missing_provider_ref: int = 0
    missing_bank_ref: int = 0
    reversal_flag: int = 0
    return_flag: int = 0
    duplicate_row_detected: int = 0
    value_date_mismatch_flag: int = 0
    cross_period_flag: int = 0
    duplicate_risk_flag: int = 0
    missing_evidence_pack: int = 0
    governance_leaf_missing: int = 0
    idempotency_key_missing: int = 0
    weak_batch_ref_flag: int = 0


@dataclass
class MLRequest:
    event_id: str
    event_type: str
    tenant_id: str
    payload: dict[str, Any]
    timestamp: int = field(default_factory=lambda: int(time.time()))

    @classmethod
    def from_dict(cls, d: dict) -> MLRequest:
        return cls(
            event_id=d["event_id"],
            event_type=d["event_type"],
            tenant_id=d["tenant_id"],
            payload=d.get("payload", {}),
            timestamp=d.get("timestamp", int(time.time())),
        )


@dataclass
class MLResult:
    event_id: str
    event_type: str
    tenant_id: str
    model_outputs: dict[str, Any]
    model_version: str
    processed_at: int = field(default_factory=lambda: int(time.time()))
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)
