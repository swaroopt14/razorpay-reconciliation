package models

import (
	// "encoding/json"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	EventID          string    `json:"event_id"`
	TraceID          uuid.UUID `json:"trace_id"`
	EnvelopeID       uuid.UUID `json:"envelope_id"`
	TenantID         uuid.UUID `json:"tenant_id"`
	ArtifactID       uuid.UUID `json:"artifact_id,omitempty"`
	ArtifactVersionID string   `json:"artifact_version_id,omitempty"`
	ObjectRef        string    `json:"object_ref"`
	ReceivedAt       time.Time `json:"created_at"`
	Source           string    `json:"source"`
	SourceSystem     string    `json:"source_system"`
	IdempotencyKey   string    `json:"idempotency_key"`
	Payload          []byte    `json:"payload"`
	PayloadHash      string    `json:"payload_hash"`
	BatchID          *string   `json:"batchid,omitempty"`
	SourceRowRef     *string   `json:"source_row_ref,omitempty"`
	FileName         *string   `json:"file_name,omitempty"`
	FileContentHash  *string   `json:"file_content_hash,omitempty"`
	RowCountEstimate *int      `json:"row_count_estimate,omitempty"`
}
