package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// SettlementIngestJob tracks the processing of each settlement artifact.
type SettlementIngestJob struct {
	JobID                  string     `json:"job_id" db:"job_id"`
	TenantID               uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	SettlementEnvelopeID   uuid.UUID  `json:"settlement_envelope_id" db:"settlement_envelope_id"`
	ArtifactFamily         string     `json:"artifact_family" db:"artifact_family"`
	SourceSystem           string     `json:"source_system" db:"source_system"`
	ConnectorID            *uuid.UUID `json:"connector_id,omitempty" db:"connector_id"`
	MappingProfileID       string     `json:"mapping_profile_id" db:"mapping_profile_id"`
	MappingProfileVersion  string     `json:"mapping_profile_version" db:"mapping_profile_version"`
	JobStatus              string     `json:"job_status" db:"job_status"`
	RowCountExpected       *int       `json:"row_count_expected,omitempty" db:"row_count_expected"`
	RowCountParsed         int        `json:"row_count_parsed" db:"row_count_parsed"`
	RowCountCanonicalized  int        `json:"row_count_canonicalized" db:"row_count_canonicalized"`
	RowCountFailed         int        `json:"row_count_failed" db:"row_count_failed"`
	ParseConfidenceOverall float64    `json:"parse_confidence_overall" db:"parse_confidence_overall"`
	StartedAt              *time.Time `json:"started_at,omitempty" db:"started_at"`
	CompletedAt            *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	FailureReasonCode      *string    `json:"failure_reason_code,omitempty" db:"failure_reason_code"`
	CreatedAt              time.Time  `json:"created_at" db:"created_at"`
}

// SettlementParsedRow represents an intermediate parse layer for transparency.
type SettlementParsedRow struct {
	ParsedRowID           uuid.UUID       `json:"parsed_row_id" db:"parsed_row_id"`
	JobID                 string          `json:"job_id" db:"job_id"`
	TenantID              uuid.UUID       `json:"tenant_id" db:"tenant_id"`
	SettlementEnvelopeID  uuid.UUID       `json:"settlement_envelope_id" db:"settlement_envelope_id"`
	SourceFileRef         string          `json:"source_file_ref" db:"source_file_ref"`
	SourceRowRef          string          `json:"source_row_ref" db:"source_row_ref"`
	RawLineHash           *string         `json:"raw_line_hash,omitempty" db:"raw_line_hash"`
	RawColumnsJSON        json.RawMessage `json:"raw_columns_json" db:"raw_columns_json"`
	ParsedCandidatesJSON  json.RawMessage `json:"parsed_candidates_json" db:"parsed_candidates_json"`
	ParseConfidence       float64         `json:"parse_confidence" db:"parse_confidence"`
	MappingProfileID      string          `json:"mapping_profile_id" db:"mapping_profile_id"`
	MappingProfileVersion string          `json:"mapping_profile_version" db:"mapping_profile_version"`
	ClientBatchID         string          `json:"client_batch_id" db:"client_batch_id"`
	CreatedAt             time.Time       `json:"created_at" db:"created_at"`
}

// CanonicalSettlementObservation is the main canonical record for normalized truth.
type CanonicalSettlementObservation struct {
	SettlementObservationID    uuid.UUID        `json:"settlement_observation_id" db:"settlement_observation_id"`
	TenantID                   uuid.UUID        `json:"tenant_id" db:"tenant_id"`
	TraceID                    *uuid.UUID       `json:"trace_id" db:"trace_id"`
	SettlementEnvelopeID       uuid.UUID        `json:"settlement_envelope_id" db:"settlement_envelope_id"`
	IngestRunID                string           `json:"ingest_run_id" db:"ingest_run_id"`
	SettlementBatchID          string           `json:"settlement_batch_id" db:"settlement_batch_id"`
	SourceFileRef              string           `json:"source_file_ref" db:"source_file_ref"`
	SourceRowRef               string           `json:"source_row_ref" db:"source_row_ref"`
	SourceSystem               string           `json:"source_system" db:"source_system"`
	ConnectorID                *uuid.UUID       `json:"connector_id,omitempty" db:"connector_id"`
	ObservationKind            string           `json:"observation_kind" db:"observation_kind"`
	SourceStrengthClass        string           `json:"source_strength_class" db:"source_strength_class"`
	ClientReferenceCandidate   *string          `json:"client_reference_candidate,omitempty" db:"client_reference_candidate"`
	ProviderReference          *string          `json:"provider_reference,omitempty" db:"provider_reference"`
	BankID                     *string          `json:"bank_id,omitempty" db:"bank_id"`
	BankReference              *string          `json:"bank_reference,omitempty" db:"bank_reference"`
	ExternalReference          *string          `json:"external_reference,omitempty" db:"external_reference"`
	BatchReference             *string          `json:"batch_reference,omitempty" db:"batch_reference"`
	MerchantIDToken            *string          `json:"merchant_id_token,omitempty" db:"merchant_id_token"`
	SellerIDToken              *string          `json:"seller_id_token,omitempty" db:"seller_id_token"`
	VendorIDToken              *string          `json:"vendor_id_token,omitempty" db:"vendor_id_token"`
	Amount                     decimal.Decimal  `json:"amount" db:"amount"`
	SettledAmount              *decimal.Decimal `json:"settled_amount,omitempty" db:"settled_amount"`
	FeeAmount                  *decimal.Decimal `json:"fee_amount,omitempty" db:"fee_amount"`
	DeductionAmount            *decimal.Decimal `json:"deduction_amount,omitempty" db:"deduction_amount"`
	CurrencyCode               string           `json:"currency_code" db:"currency_code"`
	SettlementStatus           string           `json:"settlement_status" db:"settlement_status"`
	ProviderStatusCode         *string          `json:"provider_status_code,omitempty" db:"provider_status_code"`
	FailureReasonCode          *string          `json:"failure_reason_code,omitempty" db:"failure_reason_code"`
	RetryFlag                  bool             `json:"retry_flag" db:"retry_flag"`
	ReversalFlag               bool             `json:"reversal_flag" db:"reversal_flag"`
	ReturnFlag                 bool             `json:"return_flag" db:"return_flag"`
	ObservationTimestamp       time.Time        `json:"observation_timestamp" db:"observation_timestamp"`
	ValueDate                  *time.Time       `json:"value_date,omitempty" db:"value_date"`
	ProviderRefStatus          string           `json:"provider_ref_status" db:"provider_ref_status"`
	ProviderRefFirstSeenAt     *time.Time       `json:"provider_ref_first_seen_at,omitempty" db:"provider_ref_first_seen_at"`
	ProviderRefLastSeenAt      *time.Time       `json:"provider_ref_last_seen_at,omitempty" db:"provider_ref_last_seen_at"`
	ProviderRefSourceSet       []byte           `json:"provider_ref_source_set,omitempty" db:"provider_ref_source_set"`
	ProviderRefConsistencyFlag *bool            `json:"provider_ref_consistency_flag,omitempty" db:"provider_ref_consistency_flag"`
	MappingProfileID           string           `json:"mapping_profile_id" db:"mapping_profile_id"`
	MappingProfileVersion      string           `json:"mapping_profile_version" db:"mapping_profile_version"`
	ClientBatchID              string           `json:"client_batch_id" db:"client_batch_id"`
	ParseConfidence            float64          `json:"parse_confidence" db:"parse_confidence"`
	MappingConfidence          float64          `json:"mapping_confidence" db:"mapping_confidence"`
	CarrierRichnessScore       float64          `json:"carrier_richness_score" db:"carrier_richness_score"`
	AttachmentReadinessScore   float64          `json:"attachment_readiness_score" db:"attachment_readiness_score"`
	ScoreBreakdownJSON         []byte           `json:"score_breakdown_json,omitempty" db:"score_breakdown_json"`
	ScoreReasonCodesJSON       []byte           `json:"score_reason_codes_json,omitempty" db:"score_reason_codes_json"`
	ScoreVersion               string           `json:"score_version" db:"score_version"`
	CanonicalHash              string           `json:"canonical_hash" db:"canonical_hash"`
	CanonicalSnapshotRef       *string          `json:"canonical_snapshot_ref,omitempty" db:"canonical_snapshot_ref"`
	SourceStrength             string           `json:"source_strength" db:"source_strength"`
	SourceType                 string           `json:"source_type" db:"source_type"`
	SourceSystemID             string           `json:"source_system_id" db:"source_system_id"`
	CorridorID                 string           `json:"corridor_id" db:"corridor_id"`
	BeneficiaryFingerprint     *string          `json:"beneficiary_fingerprint,omitempty" db:"beneficiary_fingerprint"`
	ZordSignatureCarrier       *string          `json:"zord_signature_carrier,omitempty" db:"zord_signature_carrier"`
	WarningsJSON               []byte           `json:"warnings_json,omitempty" db:"warnings_json"`
	CreatedAt                  time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt                  time.Time        `json:"updated_at" db:"updated_at"`
}

// CanonicalSettlementBatch provides batch-level context for settlement files.
type CanonicalSettlementBatch struct {
	SettlementBatchID          uuid.UUID       `json:"settlement_batch_id" db:"settlement_batch_id"`
	TenantID                   uuid.UUID       `json:"tenant_id" db:"tenant_id"`
	IngestRunID                string          `json:"ingest_run_id" db:"ingest_run_id"`
	SourceFileRef              string          `json:"source_file_ref" db:"source_file_ref"`
	SourceSystem               string          `json:"source_system" db:"source_system"`
	ConnectorID                *uuid.UUID      `json:"connector_id,omitempty" db:"connector_id"`
	SourceBatchRef             *string         `json:"source_batch_ref,omitempty" db:"source_batch_ref"`
	ClientBatchID              string          `json:"client_batch_id" db:"client_batch_id"`
	ArtifactFamily             string          `json:"artifact_family" db:"artifact_family"`
	RowCount                   int             `json:"row_count" db:"row_count"`
	SuccessCountEstimate       int             `json:"success_count_estimate" db:"success_count_estimate"`
	FailedCountEstimate        int             `json:"failed_count_estimate" db:"failed_count_estimate"`
	PendingCountEstimate       int             `json:"pending_count_estimate" db:"pending_count_estimate"`
	ReversalCountEstimate      int             `json:"reversal_count_estimate" db:"reversal_count_estimate"`
	TotalAmount                decimal.Decimal `json:"total_amount" db:"total_amount"`
	TotalSettledAmount         decimal.Decimal `json:"total_settled_amount" db:"total_settled_amount"`
	CurrencyCode               string          `json:"currency_code" db:"currency_code"`
	ParseConfidenceOverall     float64         `json:"parse_confidence_overall" db:"parse_confidence_overall"`
	AttachmentReadinessOverall float64         `json:"attachment_readiness_overall" db:"attachment_readiness_overall"`
	CreatedAt                  time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt                  time.Time       `json:"updated_at" db:"updated_at"`
}

// SettlementParseError tracks parsing or normalization failures.
type SettlementParseError struct {
	ErrorID               uuid.UUID `json:"error_id" db:"error_id"`
	TenantID              uuid.UUID `json:"tenant_id" db:"tenant_id"`
	JobID                 uuid.UUID `json:"job_id" db:"job_id"`
	SettlementEnvelopeID  uuid.UUID `json:"settlement_envelope_id" db:"settlement_envelope_id"`
	SourceRowRef          *string   `json:"source_row_ref,omitempty" db:"source_row_ref"`
	ErrorStage            string    `json:"error_stage" db:"error_stage"`
	ReasonCode            string    `json:"reason_code" db:"reason_code"`
	ReasonDetailRedacted  *string   `json:"reason_detail_redacted,omitempty" db:"reason_detail_redacted"`
	Severity              string    `json:"severity" db:"severity"`
	MappingProfileID      string    `json:"mapping_profile_id" db:"mapping_profile_id"`
	MappingProfileVersion string    `json:"mapping_profile_version" db:"mapping_profile_version"`
	CreatedAt             time.Time `json:"created_at" db:"created_at"`
}

// SettlementOutboxEvent for durable downstream handoff.
type SettlementOutboxEvent struct {
	OutboxEventID uuid.UUID       `json:"outbox_event_id" db:"outbox_event_id"`
	TenantID      uuid.UUID       `json:"tenant_id" db:"tenant_id"`
	TraceID       *uuid.UUID      `json:"trace_id" db:"trace_id"`
	IngestRunID   string          `json:"ingest_run_id" db:"ingest_run_id"`
	EntityFamily  string          `json:"entity_family" db:"entity_family"`
	EntityID      uuid.UUID       `json:"entity_id" db:"entity_id"`
	EventType     string          `json:"event_type" db:"event_type"`
	PayloadJSON   json.RawMessage `json:"payload_json" db:"payload_json"`
	Status        string          `json:"status" db:"status"`
	Attempts      int             `json:"attempts" db:"attempts"`
	NextRetryAt   *time.Time      `json:"next_retry_at,omitempty" db:"next_retry_at"`
	CreatedAt     time.Time       `json:"created_at" db:"created_at"`
	PublishedAt   *time.Time      `json:"published_at,omitempty" db:"published_at"`
}

// UniversalSettlementShape is the standardized output of all settlement parsers.
type UniversalSettlementShape struct {
	ArtifactFamily                string                  `json:"artifact_family"`
	SourceSystem                  string                  `json:"source_system"`
	SourceStrengthClass           string                  `json:"source_strength_class"`
	SourceFileRef                 string                  `json:"source_file_ref"`
	SourceRowRef                  string                  `json:"source_row_ref"`
	ProviderReference             *string                 `json:"provider_reference"`
	BankID                        *string                 `json:"bank_id"`//Currently not mapped,Assigned Null Value
	BankReference                 *string                 `json:"bank_reference"`
	ExternalReference             *string                 `json:"external_reference"`
	ClientReferenceCandidate      *string                 `json:"client_reference_candidate"`
	BatchReference                *string                 `json:"batch_reference"`
	PartyReferenceCandidates      map[string]interface{}  `json:"party_reference_candidates"`
	BeneficiaryIdentityCandidates map[string]interface{}  `json:"beneficiary_identity_candidates"`
	Amount                        decimal.Decimal         `json:"amount"`
	SettledAmount                 *decimal.Decimal        `json:"settled_amount"`
	FeeAmount                     *decimal.Decimal        `json:"fee_amount"`
	DeductionAmount               *decimal.Decimal        `json:"deduction_amount"`
	CurrencyCode                  string                  `json:"currency_code"`
	StatusCandidate               string                  `json:"status_candidate"`
	ObservationKind               string                  `json:"observation_kind"`
	FailureReasonCandidate        *string                 `json:"failure_reason_candidate"`
	ObservationTimestamp          time.Time               `json:"observation_timestamp"`
	ValueDate                     *time.Time              `json:"value_date"`
	RetryFlag                     bool                    `json:"retry_flag"`
	ReversalFlag                  bool                    `json:"reversal_flag"`
	ReturnFlag                    bool                    `json:"return_flag"`
	ParseConfidence               float64                 `json:"parse_confidence"`
	ScoreReasonCodes              []string                `json:"score_reason_codes"`
	PaymentMethod                 string                  `json:"payment_method"`
	CarrierCandidates             map[string]interface{}  `json:"carrier_candidates"`
	RawEnvelopeRef                uuid.UUID               `json:"raw_envelope_ref"`
	MappingInputs                 MappingConfidenceInputs `json:"mapping_inputs"`
}

// MappingConfidenceInputs captures semantic mapping signals for scoring.
type MappingConfidenceInputs struct {
	AmountMapped      bool `json:"amount_mapped"`
	CurrencyMapped    bool `json:"currency_mapped"`
	StatusMapped      bool `json:"status_mapped"`
	TimestampMapped   bool `json:"timestamp_mapped"`
	ProviderRefMapped bool `json:"provider_ref_mapped"`
	BankRefMapped     bool `json:"bank_ref_mapped"`
	ClientRefMapped   bool `json:"client_ref_mapped"`

	AmountExisted      bool `json:"amount_existed"`
	CurrencyExisted    bool `json:"currency_existed"`
	StatusExisted      bool `json:"status_existed"`
	TimestampExisted   bool `json:"timestamp_existed"`
	ProviderRefExisted bool `json:"provider_ref_existed"`
	BankRefExisted     bool `json:"bank_ref_existed"`
	ClientRefExisted   bool `json:"client_ref_existed"`

	MappingProfileFallbackUsed bool `json:"mapping_profile_fallback_used"`
	CriticalFieldUnmapped      bool `json:"critical_field_unmapped"`
}
