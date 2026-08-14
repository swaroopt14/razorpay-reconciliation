from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from app.exceptions import PayloadHashMismatchError, UnsupportedSchemaVersionError
from app.model_contracts import canonical_sha256

CURRENT_SCHEMA_VERSION = "1"
SUPPORTED_SCHEMA_VERSIONS = {CURRENT_SCHEMA_VERSION}

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
    schema_version: str = CURRENT_SCHEMA_VERSION
    payload_sha256: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> MLRequest:
        request = cls(
            event_id=d["event_id"],
            event_type=d["event_type"],
            tenant_id=d["tenant_id"],
            payload=d.get("payload", {}),
            timestamp=d.get("timestamp", int(time.time())),
            schema_version=str(d.get("schema_version", CURRENT_SCHEMA_VERSION)),
            payload_sha256=str(d.get("payload_sha256", d.get("payload_hash", ""))),
        )
        request.validate()
        return request

    def validate(self) -> None:
        self.schema_version = str(self.schema_version)
        if self.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
            raise UnsupportedSchemaVersionError(
                f"unsupported schema_version={self.schema_version}"
            )
        if not self.event_id or not self.event_type or not self.tenant_id:
            raise ValueError("event_id, event_type and tenant_id are required")
        if not isinstance(self.payload, dict):
            raise ValueError("payload must be a JSON object")
        actual_hash = canonical_sha256(self.payload)
        if self.payload_sha256 and self.payload_sha256.lower() != actual_hash:
            raise PayloadHashMismatchError(
                f"payload_sha256 mismatch event_id={self.event_id}"
            )
        self.payload_sha256 = actual_hash

    def request_hash(self) -> str:
        self.validate()
        return canonical_sha256({
            "schema_version": self.schema_version,
            "event_type": self.event_type,
            "tenant_id": self.tenant_id,
            "payload_sha256": self.payload_sha256,
        })


@dataclass
class MLResult:
    event_id: str
    event_type: str
    tenant_id: str
    model_outputs: dict[str, Any]
    model_version: str
    prediction_id: str = ""
    processed_at: int = field(default_factory=lambda: int(time.time()))
    error: Optional[str] = None
    schema_version: str = CURRENT_SCHEMA_VERSION
    request_hash: str = ""
    model_digest: str = ""
    model_ready: bool = True
    fallback_reason: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.prediction_id:
            self.prediction_id = self.event_id

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MLResult:
        return cls(**d)
