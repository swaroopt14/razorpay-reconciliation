package model

import (
	"time"

	"github.com/google/uuid"
)

type OutboxEvent struct {
	OutboxID          uuid.UUID  `json:"event_id" db:"outbox_id"`
	TraceID           uuid.UUID  `json:"trace_id" db:"trace_id"`
	EnvelopeID        uuid.UUID  `json:"envelope_id" db:"envelope_id"`
	TenantID          uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	ArtifactID        uuid.UUID  `json:"artifact_id" db:"artifact_id"`
	ArtifactVersionID string     `json:"artifact_version_id" db:"artifact_version_id"`
	ObjectRef         string     `json:"object_ref" db:"object_ref"`
	ReceivedAt        time.Time  `json:"received_at" db:"received_at"`
	Source            string     `json:"source" db:"source"`
	IdempotencyKey    string     `json:"idempotency_key" db:"idempotency_key"`
	EncryptedPayload  []byte     `json:"payload" db:"encrypted_payload"`
	PayloadHash       string     `json:"payload_hash" db:"payload_hash"`
	RawRowHash        *string    `json:"raw_row_hash,omitempty" db:"raw_row_hash"`
	EnvelopeHash      string     `json:"envelope_hash" db:"envelope_hash"`
	EnvelopeSignature string     `json:"envelope_signature" db:"envelope_signature"`
	Topic             string     `json:"topic" db:"topic"`
	Status            string     `json:"status" db:"status"`
	Attempts          int        `json:"retry_count" db:"attempts"`
	NextRetryAt       *time.Time `json:"next_retry_at" db:"next_retry_at"`
	LeaseID           *uuid.UUID `json:"lease_id" db:"lease_id"`
	LeasedBy          *string    `json:"leased_by" db:"leased_by"`
	EventType         string     `json:"event_type" db:"event_type"`
	// EventVersion / SchemaVersion are stamped in the Lease handler — they
	// are constant per producer, not per-row data, so they have no backing
	// DB column (mirrors zord-intent-engine/zord-outcome-engine).
	EventVersion      string     `json:"event_version,omitempty"`
	SchemaVersion     string     `json:"schema_version,omitempty"`
	LeaseUntil        *time.Time `json:"lease_until" db:"lease_until"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         *time.Time `json:"updated_at" db:"updated_at"`
	PublishedAt       *time.Time `json:"published_at" db:"published_at"`
	FailureReasonCode *string    `json:"failure_reason_code" db:"failure_reason_code"`
	BatchID           *string    `json:"batchid,omitempty" db:"batchid"`
	FileContentHash   *string    `json:"file_content_hash,omitempty" db:"file_content_hash"`
	SourceRowRef      *string    `json:"source_row_ref,omitempty" db:"source_row_ref"`
	SourceSystem      string     `json:"source_system" db:"source_system"`
}
