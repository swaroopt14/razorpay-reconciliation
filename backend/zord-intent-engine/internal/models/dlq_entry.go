package models

import (
	"encoding/json"
	"time"
)

// DLQ status values
const (
	DLQStatusManualReview = "NEEDS_MANUAL_REVIEW"
	DLQStatusTerminal     = "DLQ_TERMINAL"
)

type DLQEntry struct {
	DLQID      string `json:"dlq_id"`
	TenantID   string `json:"tenant_id"`
	EnvelopeID string `json:"envelope_id"`

	Stage          string `json:"stage"`
	ReasonCode     string `json:"reason_code"`
	ErrorDetail    string `json:"error_detail"`
	DLQStatus      string `json:"dlq_status"`
	Replayable     bool   `json:"replayable"`
	ClientBatchRef string `json:"client_batch_ref"`
	BatchID        string `json:"batch_id,omitempty"`
	SourceRowNum   *int   `json:"source_row_num,omitempty"`

	// EventType / EventVersion / SchemaVersion / SourceService are the
	// standard cross-service event envelope fields. Like OutboxEvent's
	// equivalents, they are constant per producer/lane and are stamped in
	// the DLQ lease handler (internal/handlers/dlq_outbox_handler.go)
	// rather than persisted as DB columns.
	EventType     string `json:"event_type,omitempty"`
	EventVersion  string `json:"event_version,omitempty"`
	SchemaVersion string `json:"schema_version,omitempty"`
	SourceService string `json:"source_service,omitempty"`

	// NEW — populated only when DLQStatus = NEEDS_MANUAL_REVIEW
	IntentContext json.RawMessage `json:"intent_context,omitempty"` // beneficiary_name, amount, idempotency_key
	TraceID       string          `json:"trace_id,omitempty"`

	// Leasing fields for outbox/relay pull API
	LeaseID       string     `json:"lease_id,omitempty"`
	LeasedBy      string     `json:"leased_by,omitempty"`
	LeaseUntil    *time.Time `json:"lease_until,omitempty"`
	RetryCount    int        `json:"retry_count"`
	NextAttemptAt *time.Time `json:"next_attempt_at,omitempty"`
	DispatchedAt  *time.Time `json:"dispatched_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
