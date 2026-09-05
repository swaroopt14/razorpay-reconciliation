package model

import (
	"encoding/json"
	"time"
)

// RelayOutboxStatus represents the publish state of a relay outbox event.
type RelayOutboxStatus string

const (
	RelayOutboxStatusPending   RelayOutboxStatus = "PENDING"
	RelayOutboxStatusPublished RelayOutboxStatus = "PUBLISHED"
	RelayOutboxStatusFailed    RelayOutboxStatus = "FAILED"
)

// RelayOutboxRow is a row in Service 4's own relay_outbox table.
// Events are written here atomically with dispatch state changes,
// then published to Kafka by the relay loop independently.
// No PII is ever stored here.
type RelayOutboxRow struct {
	EventID     string            `db:"event_id"`
	EventType   string            `db:"event_type"`
	DispatchID  string            `db:"dispatch_id"`
	ContractID  string            `db:"contract_id"`
	IntentID    string            `db:"intent_id"`
	TenantID    string            `db:"tenant_id"`
	TraceID     string            `db:"trace_id"`
	Payload     json.RawMessage   `db:"payload"`
	Status      RelayOutboxStatus `db:"status"`
	CreatedAt   time.Time         `db:"created_at"`
	PublishedAt *time.Time        `db:"published_at"`
	RetryCount  int               `db:"retry_count"`
}
