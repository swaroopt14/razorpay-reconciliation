package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// OutboxRow is the in-memory representation of a row to be inserted into
// outcome_outbox inside the persistence transaction.
//
// FIX #1: the outbox service now builds these structs in memory and returns
// them to the engine, which inserts them inside persistAttachmentOutputs
// so that event emission is atomic with decision/variance persistence.
// Previously EmitForJob and EmitLeafBundlesForJob wrote directly to the DB
// after the transaction committed, creating a crash window where decisions
// existed but events were never emitted.
type OutboxRow struct {
	EventID    uuid.UUID
	TenantID   uuid.UUID
	TraceID    uuid.UUID
	EnvelopeID *uuid.UUID
	ContractID string
	BatchID    string

	AggregateType string
	AggregateID   uuid.UUID
	EventType     string
	Payload       json.RawMessage

	CreatedAt time.Time

	// Metadata columns populated from payload fields for fast querying
	// without JSON extraction.
	SettlementRecordReceived   *time.Time
	CanonicalSettlementCreated *time.Time
	BankReference              *string
	ClientReference            *string
	AttachmentDecision         *string
	MatchConfidence            *float64
	ValueDateCheck             *bool
	AmountMatch                *bool
}
