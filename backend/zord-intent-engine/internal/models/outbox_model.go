package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type OutboxEvent struct {
	EventID       string    `json:"event_id" db:"event_id"`
	EnvelopeID    string    `json:"envelope_id" db:"envelope_id"`
	TraceID       string    `json:"trace_id" db:"trace_id"`
	TenantID      string    `json:"tenant_id" db:"tenant_id"`
	ContractID    string    `json:"contract_id,omitempty" db:"contract_id"`
	AggregateType string    `json:"aggregate_type" db:"aggregate_type"`
	AggregateID   uuid.UUID `json:"aggregate_id" db:"aggregate_id"`
	IntentID      string    `json:"intent_id"`
	EventType     string    `json:"event_type" db:"event_type"`

	SchemaVersion string          `json:"schema_version" db:"schema_version"`
	Amount        decimal.Decimal `json:"amount" db:"amount"`
	Currency      string          `json:"currency" db:"currency"`

	RetryCount  int             `json:"retry_count" db:"retry_count"`
	NextRetryAt *time.Time      `json:"next_attempt_at,omitempty" db:"next_attempt_at"`
	Payload     json.RawMessage `json:"payload" db:"payload"`
	Status      string          `json:"status" db:"status"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
	LeaseID     string          `json:"lease_id,omitempty" db:"lease_id"`
	LeasedBy    string          `json:"leased_by,omitempty" db:"leased_by"`
	LeaseUntil  *time.Time      `json:"lease_until,omitempty" db:"lease_until"`
	PayloadHash string          `json:"payload_hash" db:"payload_hash"`
	BatchID     *string         `json:"batchid,omitempty" db:"batchid"`
	CorridorID  *string         `json:"corridor_id"`

	// Intent Metadata (Synchronized from payment_intents)
	IdempotencyKey   string          `json:"idempotency_key,omitempty" db:"idempotency_key"`
	SalientHash      string          `json:"salient_hash,omitempty" db:"salient_hash"`
	IntentType       string          `json:"intent_type,omitempty" db:"intent_type"`
	CanonicalVersion string          `json:"canonical_version,omitempty" db:"canonical_version"`
	IntendedExecutionAt   *time.Time      `json:"intended_execution_at,omitempty" db:"intended_execution_at"`
	Constraints      json.RawMessage `json:"constraints,omitempty" db:"constraints"`
	BeneficiaryType  string          `json:"beneficiary_type,omitempty" db:"beneficiary_type"`
	PIITokens        json.RawMessage `json:"pii_tokens,omitempty" db:"pii_tokens"`
	Beneficiary      json.RawMessage `json:"beneficiary,omitempty" db:"beneficiary"`
	IntentStatus     string          `json:"intent_status,omitempty" db:"intent_status"`
	ConfidenceScore  *float64        `json:"confidence_score,omitempty" db:"confidence_score"`

	CanonicalHash         string `json:"canonical_hash,omitempty" db:"canonical_hash"`
	CanonicalSnapshotRef  string `json:"canonical_snapshot_ref,omitempty" db:"canonical_snapshot_ref"`
	NIRSnapshotRef        string `json:"nir_snapshot_ref,omitempty" db:"nir_snapshot_ref"`
	GovernanceSnapshotRef string `json:"governance_snapshot_ref,omitempty" db:"governance_snapshot_ref"`
	GovernanceHash        string `json:"governance_hash,omitempty" db:"governance_hash"`

	ClientPayoutRef       string          `json:"client_payout_ref,omitempty" db:"client_payout_ref"`
	ProviderHint          string          `json:"provider_hint,omitempty" db:"provider_hint"`
	RequestFingerprint    string          `json:"request_fingerprint,omitempty" db:"request_fingerprint"`
	RoutingHintsJSON      json.RawMessage `json:"routing_hints_json,omitempty" db:"routing_hints_json"`
	GovernanceState       string          `json:"governance_state,omitempty" db:"governance_state"`
	BusinessState         string          `json:"business_state,omitempty" db:"business_state"`
	DuplicateRiskFlag     bool            `json:"duplicate_risk_flag,omitempty" db:"duplicate_risk_flag"`
	MappingProfileID      string          `json:"mapping_profile_used,omitempty" db:"mapping_profile_id"`
	MappingProfileVersion string          `json:"mapping_profile_version,omitempty" db:"mapping_profile_version"`
	SourceSystem          string          `json:"source_system,omitempty" db:"source_system"`

	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty" db:"payment_instruction_received"`
	CanonicalIntentCreated    *time.Time `json:"canonical_intent_created,omitempty" db:"canonical_intent_created"`

	BusinessIdempotencyKey    string          `json:"business_idempotency_key,omitempty" db:"business_idempotency_key"`
	BeneficiaryFingerprint    string          `json:"beneficiary_fingerprint,omitempty" db:"beneficiary_fingerprint"`
	ProofReadinessScore       float64         `json:"proof_readiness_score,omitempty" db:"proof_readiness_score"`
	MatchabilityScore         float64         `json:"matchability_score,omitempty" db:"matchability_score"`
	IntentQualityScore        float64         `json:"intent_quality_score,omitempty" db:"intent_quality_score"`
	MappingConfidenceScore    float64         `json:"mapping_confidence_score,omitempty" db:"mapping_confidence_score"`
	SchemaCompletenessScore   float64         `json:"schema_completeness_score,omitempty" db:"schema_completeness_score"`
	GovernanceReasonCodesJSON json.RawMessage `json:"governance_reason_codes_json,omitempty" db:"governance_reason_codes_json"`
	DuplicateReasonCode       string          `json:"duplicate_reason_code,omitempty" db:"duplicate_reason_code"`
	ClientBatchRef            string          `json:"client_batch_ref,omitempty" db:"client_batch_ref"`
	AggregateConfidenceScore  *float64        `json:"aggregate_confidence_score,omitempty" db:"aggregate_confidence_score"` // NEW
	SourceRowNum              *int            `json:"source_row_num,omitempty" db:"source_row_num"`

	// 🆕 Status Fields
	RequiredFieldsStatus *bool   `json:"required_fields_status,omitempty" db:"required_fields_status"`
	TokenizationStatus   *bool   `json:"tokenization_status,omitempty" db:"tokenization_status"`
	GovernanceDecision   *string `json:"governance_decision,omitempty" db:"governance_decision"`
}
