package model

import (
	"encoding/json"
	"time"
)

// EdgeOutboxEvent is the event shape published by zord-edge's outbox
// (see zord-edge/model.OutboxEvent for the source-of-truth row it mirrors).
// It is scoped to the zord-edge -> zord-relay -> zord-intent-engine /
// zord-evidence path only — other upstream services keep using the shared
// OutboxEvent struct above.
type EdgeOutboxEvent struct {
	EventID           string          `json:"event_id"`
	EnvelopeID        string          `json:"envelope_id"`
	TraceID           string          `json:"trace_id"`
	TenantID          string          `json:"tenant_id"`
	ArtifactID        string          `json:"artifact_id,omitempty"`
	ArtifactVersionID string          `json:"artifact_version_id,omitempty"`
	ObjectRef         string          `json:"object_ref"`
	Source            string          `json:"source"`
	SourceSystem      string          `json:"source_system,omitempty"`
	EventVersion      string          `json:"event_version,omitempty"`
	SchemaVersion     string          `json:"schema_version,omitempty"`
	Topic             string          `json:"topic"`
	EventType         string          `json:"event_type"`
	IdempotencyKey    string          `json:"idempotency_key"`
	Payload           json.RawMessage `json:"payload"`
	PayloadHash       string          `json:"payload_hash"`
	RawRowHash        *string         `json:"raw_row_hash,omitempty"`
	EnvelopeHash      string          `json:"envelope_hash,omitempty"`
	LeaseID           string          `json:"lease_id"`
	LeasedBy          string          `json:"leased_by"`
	LeaseUntil        *time.Time      `json:"lease_until,omitempty"`
	RetryCount        int             `json:"retry_count"`
	NextRetryAt       *time.Time      `json:"next_retry_at,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	Status            string          `json:"status"`
	BatchID           *string         `json:"batchid,omitempty"`
	FileContentHash   *string         `json:"file_content_hash,omitempty"`
	SourceRowRef      *string         `json:"source_row_ref,omitempty"`
}

// EdgeLeaseResponse is what zord-edge's /internal/outbox/lease endpoint returns.
type EdgeLeaseResponse struct {
	LeaseID    string            `json:"lease_id"`
	LeaseUntil *time.Time        `json:"lease_until,omitempty"`
	Events     []EdgeOutboxEvent `json:"events"`
}
