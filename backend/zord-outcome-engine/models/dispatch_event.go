package models

import (
	"encoding/json"
	"time"
)

type DispatchEvent struct {
	EventID       string          `json:"event_id"`
	EventType     string          `json:"event_type"`
	TenantID      string          `json:"tenant_id"`
	IntentID      string          `json:"intent_id"`
	ContractID    string          `json:"contract_id"`
	TraceID       string          `json:"trace_id"`
	SchemaVersion string          `json:"schema_version"`
	CreatedAt     time.Time       `json:"created_at"`
	Payload       json.RawMessage `json:"payload"`
}

type DispatchCreatedPayload struct {
	DispatchID   string `json:"dispatch_id"`
	ConnectorID  string `json:"connector_id"`
	CorridorID   string `json:"corridor_id"`
	AttemptCount int    `json:"attempt_count"`

	CorrelationCarriers struct {
		ReferenceID string `json:"reference_id"`
		Narration   string `json:"narration"`
	} `json:"correlation_carriers"`
}

type ProviderAckedPayload struct {
	DispatchID        string `json:"dispatch_id"`
	ProviderAttemptID string `json:"provider_attempt_id"`
	Status            string `json:"status"`
}

type AttemptSentPayload struct {
	DispatchID   string `json:"dispatch_id"`
	ConnectorID  string `json:"connector_id"`
	CorridorID   string `json:"corridor_id"`
	AttemptCount int    `json:"attempt_count"`

	CorrelationCarriers struct {
		ReferenceID string `json:"reference_id"`
		Narration   string `json:"narration"`
	} `json:"correlation_carriers"`
}
