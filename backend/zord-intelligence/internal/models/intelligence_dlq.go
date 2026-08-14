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
	// TenantID is parsed from the validated event envelope (INTEL-03), never
	// from the raw Kafka partition key — most producers in this system key
	// by event_id/dlq_id/batch_id/dispatch_id, not tenant_id, so casting the
	// key to TenantID mislabeled the large majority of DLQ records. See
	// PartitionKey below for the raw key, and buildDLQRecord in
	// kafka/consumer.go for the extraction.
	TenantID string `json:"tenant_id"`
	// PartitionKey is the raw Kafka message key, kept for debugging/
	// correlation only — it is transport routing metadata, not tenant
	// identity (INTEL-03).
	PartitionKey string    `json:"partition_key,omitempty"`
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
	DLQErrorClassMissingField       = "MISSING_REQUIRED_FIELD"     // INTEL-04: schema_version or trace_id absent on a supported-event topic
	// DLQErrorClassUnapprovedLegacySchema (INTEL-06): schema_version was
	// empty or the literal "legacy" on a live (non-exempt) topic, but
	// source_service is not on the configured backfill allow-list. Kept
	// distinct from DLQErrorClassMissingField — the remediation differs
	// (add the source to the allow-list vs. fix the producer to send a
	// real schema_version).
	DLQErrorClassUnapprovedLegacySchema = "UNAPPROVED_LEGACY_SCHEMA"
)
