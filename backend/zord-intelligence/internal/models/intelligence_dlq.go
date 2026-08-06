package models

import "time"

// IntelligenceDLQRecord — corrective-action-report P0-02.
//
// Published to TopicIntelligenceDLQ (zord-intelligence.dlq.v1) whenever an
// inbound event permanently fails processing (after the consumer-level
// retry pass in kafka/consumer.go). This is the durable, replayable failure
// record the report requires — the source topic's offset is only committed
// AFTER this record is confirmed written, so a failure can never be silently
// dropped by advancing past it.
//
// Replay tooling (re-consuming this topic and re-entering
// event_receipts.RunOnce) is explicitly out of scope for now — this type
// only guarantees durable capture, not automated recovery.
type IntelligenceDLQRecord struct {
	TenantID     string    `json:"tenant_id"`
	SourceTopic  string    `json:"source_topic"`
	Partition    int       `json:"partition"`
	Offset       int64     `json:"offset"`
	EventID      string    `json:"event_id,omitempty"` // best-effort; empty if unrecoverable from the raw payload
	EventType    string    `json:"event_type"`         // domain event type (P1-01); falls back to SourceTopic if the envelope carries none
	EventVersion string    `json:"event_version"`
	PayloadHash  string    `json:"payload_hash"`
	Payload      string    `json:"payload"` // raw message value as a JSON string
	ErrorClass   string    `json:"error_class"`
	ErrorMessage string    `json:"error_message"`
	OccurredAt   time.Time `json:"occurred_at"`
}

// DLQ error classes.
const (
	DLQErrorClassUnmarshal          = "UNMARSHAL_ERROR"
	DLQErrorClassHandler            = "HANDLER_ERROR"
	DLQErrorClassUnsupportedVersion = "UNSUPPORTED_SCHEMA_VERSION" // corrective-action-report P1-01
)
