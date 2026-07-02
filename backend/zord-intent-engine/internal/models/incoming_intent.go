package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type IncomingIntent struct {
	TraceID          uuid.UUID `json:"trace_id" db:"trace_id"`
	EnvelopeID       uuid.UUID `json:"envelope_id" db:"envelope_id"`
	TenantID         uuid.UUID `json:"tenant_id" db:"tenant_id"`
	Source           string    `json:"source" db:"source"`
	SourceSystem     string    `json:"source_system" db:"source_system"`
	IdempotencyKey   string    `json:"idempotency_key" db:"idempotency_key"`
	PayloadHash      string    `json:"payload_hash" db:"payload_hash"`
	ObjectRef        string    `json:"object_ref" db:"object_ref"`
	ParseStatus      string    `json:"parse_status" db:"parse_status"`
	SignatureStatus  *string   `json:"signature_status,omitempty" db:"signature_status"`
	AmountValue      string    `json:"amount_value" db:"amount_value"`
	AmountCurrency   string    `json:"amount_currency" db:"amount_currency"`
	ReceivedAt       time.Time `json:"received_at" db:"received_at"`
	Payload          json.RawMessage
	EncryptedPayload []byte  `json:"encrypted_payload,omitempty" db:"encrypted_payload"`
	BatchID          *string `json:"batchid,omitempty" db:"batchid"`
	FileName         *string `json:"file_name,omitempty" db:"-"`
	FileContentHash  *string `json:"file_content_hash,omitempty" db:"-"`
	RowCountEstimate *int    `json:"row_count_estimate,omitempty" db:"-"`
}

type ParsedIncomingIntent struct {
	SchemaVersion           string          `json:"schema_version"`
	IntentType              string          `json:"intent_type"`
	AccountNumber           string          `json:"account_number"`
	Amount                  Amount          `json:"amount"`
	Beneficiary             Beneficiary     `json:"beneficiary"`
	Remitter                Remitter        `json:"remitter,omitempty"`
	Constraints             map[string]any  `json:"constraints,omitempty"`
	PurposeCode             string          `json:"purpose_code"`
	IdempotencyKey          string          `json:"idempotency_key"`
	ClientBatchRef          string          `json:"client_batch_ref,omitempty"`
	ClientPayoutRef         string          `json:"client_payout_ref,omitempty"`
	ProviderHint            string          `json:"provider_hint,omitempty"`
	IntendedExecutionAt     string          `json:"intended_execution_at,omitempty"`
	Source                  string          `json:"source,omitempty"`
	SourceSystem            string          `json:"source_system,omitempty"`
	GovernanceHash          string          `json:"governance_hash,omitempty"`
	IntentID                string          `json:"intent_id,omitempty"`
	PayloadHash             string          `json:"payload_hash,omitempty"`
	FieldConfidenceSummary  json.RawMessage `json:"field_confidence_summary,omitempty"`
	LowConfidenceFieldCount int             `json:"low_confidence_field_count,omitempty"`
	RequiredFieldGapCount   int             `json:"required_field_gap_count,omitempty"`
	SourceRowRef            string          `json:"source_row_ref,omitempty"`
}

// type IncomingIntent struct {
// 	SchemaVersion  string         `json:"schema_version"`
// 	IntentType     string         `json:"intent_type"`
// 	AccountNumber  string         `json:"account_number"`
// 	Amount         Amount         `json:"amount"`
// 	Beneficiary    Beneficiary    `json:"beneficiary"`
// 	Remitter       map[string]any `json:"remitter,omitempty"`
// 	Constraints    map[string]any `json:"constraints,omitempty"`
// 	PurposeCode    string         `json:"purpose_code"`
// 	IdempotencyKey string         `json:"idempotency_key"`
// }

/* ---------- Nested Types ---------- */

type Amount struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

type Beneficiary struct {
	Instrument Instrument `json:"instrument"`
	Name       string     `json:"name,omitempty"`
	Country    string     `json:"country,omitempty"`
}
type Remitter struct {
	Phone string `json:"phone,omitempty"`
	Email string `json:"email,omitempty"`
}

type Instrument struct {
	Kind string `json:"kind"`

	// BANK
	IFSC string `json:"ifsc,omitempty"`

	// UPI
	VPA string `json:"vpa,omitempty"`
}

type SaveBatchItem struct {
	Nir           *NormalizedIngestRecord
	Intent        *CanonicalIntent
	Outbox        *OutboxEvent
	RegistryEntry *BusinessIdempotencyEntry
	DlqEntry      *DLQEntry
}

