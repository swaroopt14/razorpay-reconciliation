package models

import "time"

// ActuationOutbox represents one row in the actuation_outbox table.
//
// When ZPI creates an ActionContract that needs to trigger another service,
// it also writes an outbox entry in the SAME database transaction.
// The outbox_worker.go picks these up and sends them to Kafka.
//
// WHY THIS EXISTS:
// We cannot write to DB and send to Kafka atomically.
// So we write BOTH to DB in one transaction,
// then a worker delivers the Kafka message separately.
// If the worker crashes, it retries. Nothing is lost.

type ActuationOutbox struct {
	EventID string `json:"event_id" db:"event_id"`
	// Format: "evt_" + UUID

	ActionID string `json:"action_id" db:"action_id"`
	// Links to the ActionContract that created this entry

	EventType string `json:"event_type" db:"event_type"`
	// Mirrors the Decision value: "ESCALATE", "RETRY", "GENERATE_EVIDENCE" etc.
	// The outbox_worker uses this to decide WHERE to send (which Kafka topic)

	Payload string `json:"payload" db:"payload"`
	// JSON string to publish to Kafka.
	// Built from the ActionContract's PayloadJSON.

	Status OutboxStatus `json:"status" db:"status"`

	Attempts int `json:"attempts" db:"attempts"`
	// How many delivery attempts. After 5 → status becomes FAILED permanently.

	NextRetryAt time.Time `json:"next_retry_at" db:"next_retry_at"`
	// When the worker should try next.
	// Exponential backoff:
	//   attempt 1 → now + 30 seconds
	//   attempt 2 → now + 2 minutes
	//   attempt 3 → now + 8 minutes
	//   attempt 4 → now + 32 minutes
	//   attempt 5 → FAILED permanently

	SentAt *time.Time `json:"sent_at,omitempty" db:"sent_at"`
	// When it was successfully delivered.
	// *time.Time means POINTER to time — it can be nil (NULL in DB).
	// nil = not yet sent. Non-nil = sent at this time.

	CreatedAt time.Time `json:"created_at" db:"created_at"`

	// ── PHASE 5 (refactor) ADDITIONS ─────────────────────────────────────
	// "PHASE 5 (refactor)" = this refactor's phase 5 (policy/action/outbox
	// hardening) — unrelated to any other "Phase 5" naming in this codebase.
	TenantID             string `json:"tenant_id,omitempty" db:"tenant_id"`
	ScopeType            string `json:"scope_type,omitempty" db:"scope_type"`
	ScopeRef             string `json:"scope_ref,omitempty" db:"scope_ref"`
	PayloadHash          string `json:"payload_hash,omitempty" db:"payload_hash"`
	PayloadSchemaVersion string `json:"payload_schema_version,omitempty" db:"payload_schema_version"`
	LastError            string `json:"last_error,omitempty" db:"last_error"`
	// TenantID/ScopeType/ScopeRef mirror the parent ActionContract (denormalized
	// for fast tenant/scope-filtered outbox queries without a join).
	// LastError is populated by MarkFailed with the actual Kafka publish
	// error — previously only logged, now also visible from the DB.
}

// OutboxStatus is the delivery lifecycle of an outbox entry.
// Using a named type (instead of plain string) makes the code self-documenting.
//
// Example:
//   entry.Status = OutboxStatusPending   ← clear and readable
//   entry.Status = "PENDING"             ← works but easy to typo
type OutboxStatus string

const (
	OutboxStatusPending OutboxStatus = "PENDING" // waiting to be delivered
	OutboxStatusSent    OutboxStatus = "SENT"    // successfully delivered to Kafka
	OutboxStatusFailed  OutboxStatus = "FAILED"  // max retries exceeded, needs manual fix
)
