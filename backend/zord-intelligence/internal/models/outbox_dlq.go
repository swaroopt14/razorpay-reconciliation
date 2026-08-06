package models

import "time"

// OutboxDLQRecord — corrective-action-report P1-07.
//
// Published to TopicOutboxDLQ (zord-intelligence.outbox-dlq.v1) whenever an
// actuation_outbox entry exhausts its delivery attempts (5, per
// OutboxRepo.MarkFailed's exponential backoff schedule). Mirrors
// IntelligenceDLQRecord's discipline (P0-02): the entry's dead_lettered_at
// column is only set AFTER this record is confirmed published, so a
// terminally-failed action can never be silently forgotten.
//
// Replay tooling (re-inserting a DLQ record back into actuation_outbox with
// reset attempts) is explicitly out of scope for now — this type only
// guarantees durable capture, not automated recovery, the same maturity
// level as the inbound DLQ.
type OutboxDLQRecord struct {
	TenantID       string    `json:"tenant_id"`
	ActionID       string    `json:"action_id"`
	EventID        string    `json:"event_id"`
	EventType      string    `json:"event_type"` // mirrors the Decision value — see models.ActuationOutbox
	Payload        string    `json:"payload"`    // raw outbox payload JSON string
	PayloadHash    string    `json:"payload_hash,omitempty"`
	Attempts       int       `json:"attempts"`
	ErrorClass     string    `json:"error_class"`
	ErrorMessage   string    `json:"error_message"`
	DeadLetteredAt time.Time `json:"dead_lettered_at"`
}

// Outbox DLQ error classes.
const (
	OutboxDLQErrorClassPublish          = "PUBLISH_ERROR"      // Kafka publish to the destination topic failed
	OutboxDLQErrorClassUnknownEventType = "UNKNOWN_EVENT_TYPE" // topicForEventType had no route for this entry
	OutboxDLQErrorClassExhausted        = "DELIVERY_EXHAUSTED" // retrying the DLQ hand-off itself after an earlier terminal transition
)
