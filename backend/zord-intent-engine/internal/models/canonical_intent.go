package models

import (
	"encoding/json"
	"time"

	"github.com/shopspring/decimal"
)

type CanonicalIntent struct {
	IntentID   string `json:"intent_id"`
	EnvelopeID string `json:"envelope_id"`
	TenantID   string `json:"tenant_id"`
	ContractID string `json:"contract_id,omitempty" db:"contract_id"`

	// ✅ ADD THESE
	TraceID        string `json:"trace_id" db:"trace_id"`
	IdempotencyKey string `json:"idempotency_key" db:"idempotency_key"`
	SalientHash    string `json:"salient_hash" db:"salient_hash"`

	IntentType       string `json:"intent_type"`
	CanonicalVersion string `json:"canonical_version"`
	SchemaVersion    string `json:"schema_version"`

	Amount              decimal.Decimal `json:"amount"`
	Currency            string          `json:"currency"`
	IntendedExecutionAt *time.Time      `json:"intended_execution_at,omitempty" db:"intended_execution_at"`

	Constraints json.RawMessage `json:"constraints,omitempty"`

	BeneficiaryType string          `json:"beneficiary_type"`
	PIITokens       json.RawMessage `json:"pii_tokens,omitempty"`
	Beneficiary     json.RawMessage `json:"beneficiary,omitempty"`

	Status          string   `json:"status"`
	ConfidenceScore *float64 `json:"confidence_score,omitempty"`

	CreatedAt time.Time `json:"created_at"`

	// 🆕 WORM fields
	CanonicalSnapshotRef  string `db:"canonical_snapshot_ref" json:"canonical_snapshot_ref,omitempty"`
	NIRSnapshotRef        string `db:"nir_snapshot_ref" json:"nir_snapshot_ref,omitempty"`
	GovernanceSnapshotRef string `db:"governance_snapshot_ref" json:"governance_snapshot_ref,omitempty"`
	GovernanceHash        string `db:"governance_hash" json:"governance_hash,omitempty"`
	CanonicalHash         string `db:"canonical_hash" json:"canonical_hash,omitempty"`
	PayloadHash           string

	// 🆕 Additional Canonical Schema fields
	ClientPayoutRef       string          `json:"client_payout_ref,omitempty"`
	ProviderHint          string          `json:"provider_hint,omitempty" db:"provider_hint"`
	RequestFingerprint    string          `json:"request_fingerprint,omitempty"`
	RoutingHintsJSON      json.RawMessage `json:"routing_hints_json,omitempty"`
	GovernanceState       string          `json:"governance_state,omitempty"`
	BusinessState         string          `json:"business_state,omitempty"`
	DuplicateRiskFlag     bool            `json:"duplicate_risk_flag,omitempty"`
	MappingProfileID      string          `json:"mapping_profile_used,omitempty" db:"mapping_profile_id"`
	MappingProfileVersion string          `json:"mapping_profile_version,omitempty" db:"mapping_profile_version"`
	SourceSystem          string          `json:"source_system,omitempty" db:"source_system"`

	// 🆕 Traceability Fields
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty" db:"payment_instruction_received"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty" db:"canonical_intent_created"`

	// Service 2 mandatory fields
	BusinessIdempotencyKey    string          `json:"business_idempotency_key,omitempty" db:"business_idempotency_key"`
	BeneficiaryFingerprint    string          `json:"beneficiary_fingerprint,omitempty" db:"beneficiary_fingerprint"`
	ProofReadinessScore       float64         `json:"proof_readiness_score,omitempty" db:"proof_readiness_score"`
	MatchabilityScore         float64         `json:"matchability_score,omitempty" db:"matchability_score"`
	IntentQualityScore        float64         `json:"intent_quality_score,omitempty" db:"intent_quality_score"`
	MappingConfidenceScore    float64         `json:"mapping_confidence_score,omitempty" db:"mapping_confidence_score"`
	SchemaCompletenessScore   float64         `json:"schema_completeness_score,omitempty" db:"schema_completeness_score"`
	GovernanceReasonCodesJSON json.RawMessage `json:"governance_reason_codes_json,omitempty" db:"governance_reason_codes_json"`
	Governance                Governance      `json:"governance,omitempty" db:"-"`
	ValidationAnomalies       []string        `json:"validation_anomalies,omitempty" db:"-"`
	DuplicateReasonCode       string          `json:"duplicate_reason_code,omitempty" db:"duplicate_reason_code"`
	ClientBatchRef            string          `json:"client_batch_ref,omitempty" db:"client_batch_ref"`

	UpdatedAt                *time.Time `json:"updated_at,omitempty"`
	BatchID                  *string    `json:"batch_id,omitempty" db:"batchid"`
	SourceRowNum             *int       `json:"source_row_num,omitempty" db:"source_row_num"`
	AggregateConfidenceScore *float64   `json:"aggregate_confidence_score,omitempty" db:"aggregate_confidence_score"` // NEW

	// 🆕 Status Fields
	RequiredFieldsStatus *bool   `json:"required_fields_status,omitempty" db:"required_fields_status"`
	TokenizationStatus   *bool   `json:"tokenization_status,omitempty" db:"tokenization_status"`
	GovernanceDecision   *string `json:"governance_decision,omitempty" db:"governance_decision"`

	// ── Scoring v2 fields ──────────────────────────────────────────────────────
	ReferenceQualityScore float64         `json:"reference_quality_score,omitempty"  db:"reference_quality_score"`
	DuplicateRiskScore    float64         `json:"duplicate_risk_score,omitempty"      db:"duplicate_risk_score"`
	ScoreVersion          string          `json:"score_version,omitempty"             db:"score_version"`
	ScoreValidityStatus   string          `json:"score_validity_status,omitempty"     db:"score_validity_status"`
	ScoreBreakdownJSON    json.RawMessage `json:"score_breakdown_json,omitempty"      db:"score_breakdown_json"`
	ScoreReasonCodesJSON  json.RawMessage `json:"score_reason_codes_json,omitempty"   db:"score_reason_codes_json"`
	ScoredAt              *time.Time      `json:"scored_at,omitempty"                 db:"scored_at"`
}
type BatchSidebarItem struct {
	BatchID             string   `json:"batchId"`
	Type                string   `json:"type"`
	TotalValue          string   `json:"totalValue"`
	Transactions        int      `json:"transactions"`
	ConfirmedCount      int      `json:"confirmedCount"`
	HighConfidenceCount *float64 `json:"highConfidenceCount,omitempty"`
	MismatchCount       int      `json:"mismatchCount"`
	UnresolvedCount     int      `json:"unresolvedCount"`
}
