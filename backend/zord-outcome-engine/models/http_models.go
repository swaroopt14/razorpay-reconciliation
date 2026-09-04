package models

import "time"

// IngestRequest is a small, handler-friendly request model.
type IngestRequest struct {
	ConnectorID string
	SourceClass string
	Payload     []byte
	// Optional correlation hints
	ReferenceID *string
}

type IngestResponse struct {
	RawOutcomeEnvelopeID string    `json:"raw_outcome_envelope_id"`
	CanonicalEventID     string    `json:"canonical_event_id"`
	ContractID           *string   `json:"contract_id,omitempty"`
	FusedState           *string   `json:"fused_state,omitempty"`
	ReceivedAt           time.Time `json:"received_at"`
}
