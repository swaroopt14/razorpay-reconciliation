package models

import (
	"time"

	"github.com/google/uuid"
)

type RawOutcomeEnvelope struct {
	RawOutcomeEnvelopeID uuid.UUID `json:"raw_outcome_envelope_id"`
	TenantID             uuid.UUID `json:"tenant_id"`
	TraceID              uuid.UUID `json:"trace_id"`
	ConnectorID          uuid.UUID `json:"connector_id"`
	SourceClass          string    `json:"source_class"`
	ReceivedAt           time.Time `json:"received_at"`
	RawBytesSHA256       []byte    `json:"raw_bytes_sha256"`
	ObjectStoreRef       string    `json:"object_store_ref"`
	CorridorID           string
	CreatedAt            time.Time `json:"created_at"`
}
