package model

import (
	"encoding/json"
	"time"

	"github.com/shopspring/decimal"
)

// IntentOutboxEvent is the event shape published by zord-intent-engine's
// outbox (see zord-intent-engine/internal/models.OutboxEvent for the
// source-of-truth row it mirrors). It is scoped to the
// zord-intent-engine -> zord-relay -> zord-outcome-engine (and the other
// consumers of payments.intent.events.v1: zord-relay's own dispatch loop,
// zord-intelligence, zord-evidence) path only — other upstream services
// keep using the shared OutboxEvent struct above.
type IntentOutboxEvent struct {
	EventID           string `json:"event_id"`
	EnvelopeID        string `json:"envelope_id"`
	TraceID           string `json:"trace_id"`
	TenantID          string `json:"tenant_id"`
	ContractID        string `json:"contract_id,omitempty"`
	ArtifactID        string `json:"artifact_id,omitempty"`
	ArtifactVersionID string `json:"artifact_version_id,omitempty"`
	AggregateType     string `json:"aggregate_type"`
	AggregateID       string `json:"aggregate_id"`
	IntentID          string `json:"intent_id"`
	EventType         string `json:"event_type"`

	// EventVersion / SourceService are part of the standard cross-service
	// event envelope stamped by zord-intent-engine's outbox lease handler.
	EventVersion  string `json:"event_version,omitempty"`
	SourceService string `json:"source_service,omitempty"`

	SchemaVersion string          `json:"schema_version"`
	Amount        decimal.Decimal `json:"amount"`
	Currency      string          `json:"currency"`

	RetryCount  int             `json:"retry_count"`
	NextRetryAt *time.Time      `json:"next_attempt_at,omitempty"`
	Payload     json.RawMessage `json:"payload"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	LeaseID     string          `json:"lease_id,omitempty"`
	LeasedBy    string          `json:"leased_by,omitempty"`
	LeaseUntil  *time.Time      `json:"lease_until,omitempty"`
	PayloadHash string          `json:"payload_hash"`
	BatchID     *string         `json:"batchid,omitempty"`
	CorridorID  *string         `json:"corridor_id,omitempty"`

	// Intent metadata (synchronized from payment_intents).
	IdempotencyKey      string          `json:"idempotency_key,omitempty"`
	SalientHash         string          `json:"salient_hash,omitempty"`
	IntentType          string          `json:"intent_type,omitempty"`
	CanonicalVersion    string          `json:"canonical_version,omitempty"`
	IntendedExecutionAt *time.Time      `json:"intended_execution_at,omitempty"`
	Constraints         json.RawMessage `json:"constraints,omitempty"`
	BeneficiaryType     string          `json:"beneficiary_type,omitempty"`
	PIITokens           json.RawMessage `json:"pii_tokens,omitempty"`
	Beneficiary         json.RawMessage `json:"beneficiary,omitempty"`
	IntentStatus        string          `json:"intent_status,omitempty"`
	ConfidenceScore     *float64        `json:"confidence_score,omitempty"`

	CanonicalHash                string `json:"canonical_hash,omitempty"`
	RawRowHash                   string `json:"raw_row_hash,omitempty"`
	SourceRowRef                 string `json:"source_row_ref,omitempty"`
	CanonicalRowHash             string `json:"canonical_row_hash,omitempty"`
	TokenizedDataHash            string `json:"tokenized_data_hash,omitempty"`
	RawRowEvidenceLeafHash       string `json:"raw_row_evidence_leaf_hash,omitempty"`
	CanonicalRowEvidenceLeafHash string `json:"canonical_row_evidence_leaf_hash,omitempty"`
	CanonicalSnapshotRef         string `json:"canonical_snapshot_ref,omitempty"`
	NIRSnapshotRef                string `json:"nir_snapshot_ref,omitempty"`
	GovernanceSnapshotRef         string `json:"governance_snapshot_ref,omitempty"`
	GovernanceHash                string `json:"governance_hash,omitempty"`
	GovernanceInputFactsHash      string `json:"input_facts_hash,omitempty"`

	ClientPayoutRef      string          `json:"client_payout_ref,omitempty"`
	ProviderHint         string          `json:"provider_hint,omitempty"`
	RequestFingerprint   string          `json:"request_fingerprint,omitempty"`
	RoutingHintsJSON     json.RawMessage `json:"routing_hints_json,omitempty"`
	GovernanceState      string          `json:"governance_state,omitempty"`
	BusinessState        string          `json:"business_state,omitempty"`
	IntentLifecycleState string          `json:"intent_lifecycle_state,omitempty"`
	DuplicateRiskFlag    bool            `json:"duplicate_risk_flag,omitempty"`
	MappingProfileID     string          `json:"mapping_profile_used,omitempty"`
	MappingProfileVersion string         `json:"mapping_profile_version,omitempty"`
	MappingProfileHash    string         `json:"mapping_profile_hash,omitempty"`
	PolicySource          string         `json:"policy_source,omitempty"`
	PolicyVersion         string         `json:"policy_version,omitempty"`
	PolicyHash            string         `json:"policy_hash,omitempty"`
	SourceSystem          string         `json:"source_system,omitempty"`

	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`

	BusinessIdempotencyKey string  `json:"business_idempotency_key,omitempty"`
	BeneficiaryFingerprint string  `json:"beneficiary_fingerprint,omitempty"`
	ProofReadinessScore    float64 `json:"proof_readiness_score,omitempty"`
	MatchabilityScore      float64 `json:"matchability_score,omitempty"`
	IntentQualityScore     float64 `json:"intent_quality_score,omitempty"`
	MappingConfidenceScore float64 `json:"mapping_confidence_score,omitempty"`
	SchemaCompletenessScore float64 `json:"schema_completeness_score,omitempty"`
	DuplicateReasonCode     string  `json:"duplicate_reason_code,omitempty"`
	ClientBatchRef          string  `json:"client_batch_ref,omitempty"`
	AggregateConfidenceScore *float64 `json:"aggregate_confidence_score,omitempty"`
	SourceRowNum             *int     `json:"source_row_num,omitempty"`

	RequiredFieldsStatus *bool   `json:"required_fields_status,omitempty"`
	TokenizationStatus   *bool   `json:"tokenization_status,omitempty"`
	GovernanceDecision   *string `json:"governance_decision,omitempty"`

	ReferenceQualityScore float64    `json:"reference_quality_score,omitempty"`
	DuplicateRiskScore    float64    `json:"duplicate_risk_score,omitempty"`
	ScoreVersion          string     `json:"score_version,omitempty"`
	ScoreValidityStatus   string     `json:"score_validity_status,omitempty"`
	ScoredAt              *time.Time `json:"scored_at,omitempty"`
}

// IntentLeaseResponse is what zord-intent-engine's /internal/outbox/lease
// endpoint returns.
type IntentLeaseResponse struct {
	LeaseID    string              `json:"lease_id"`
	LeaseUntil *time.Time          `json:"lease_until,omitempty"`
	Events     []IntentOutboxEvent `json:"events"`
}
