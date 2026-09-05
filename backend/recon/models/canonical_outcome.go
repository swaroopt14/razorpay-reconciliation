package models

import (
	"time"

	"github.com/google/uuid"
)

type CanonicalOutcomeEvent struct {
	EventID               uuid.UUID  `json:"event_id"`
	RawOutcomeEnvelopeID  uuid.UUID  `json:"raw_outcome_envelope_id"`
	TenantID              uuid.UUID  `json:"tenant_id"`
	ContractID            *uuid.UUID `json:"contract_id"`
	IntentID              *uuid.UUID `json:"intent_id"`
	DispatchID            *uuid.UUID `json:"dispatch_id"`
	TraceID               *uuid.UUID `json:"trace_id"`
	ConnectorID           uuid.UUID  `json:"connector_id"`
	CorridorID            *string    `json:"corridor_id"`
	SourceClass           string     `json:"source_class"`
	StatusCandidate       string     `json:"status_candidate"`
	ProviderRefHash       *string    `json:"provider_ref_hash"`
	ProviderEventID       *string    `json:"provider_event_id"`
	UTR                   *string    `json:"utr"`
	Amount                *string    `json:"amount"`
	Currency              *string    `json:"currency"`
	ObservedAt            *time.Time `json:"observed_at"`
	ReceivedAt            time.Time  `json:"received_at"`
	CorrelationConfidence int        `json:"correlation_confidence"`
	DedupeKey             string     `json:"dedupe_key"`
	CreatedAt             time.Time  `json:"created_at"`
}
