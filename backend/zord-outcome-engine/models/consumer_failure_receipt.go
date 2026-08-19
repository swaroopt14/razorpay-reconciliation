package models

import "time"

// Consumer failure receipt status values — see OUT-02 (prevent Kafka offset
// skipping past a failed intent/outcome event).
const (
	FailureStatusDeadLettered = "DEAD_LETTERED"
	FailureStatusReplaying    = "REPLAYING"
	FailureStatusReplayed     = "REPLAYED"
	FailureStatusResolved     = "RESOLVED"
	FailureStatusQuarantined  = "QUARANTINED"
)

// ConsumerFailureReceipt is a durable record of a Kafka message that
// exhausted its in-place retry attempts (kafka/consumer.go). Written before
// the source offset is marked, so a message is never lost between "handler
// gave up" and "offset advanced past it" — see kafka.ConsumeClaim.
type ConsumerFailureReceipt struct {
	FailureID      string `json:"failure_id"`
	IdempotencyKey string `json:"idempotency_key"`
	EventID        string `json:"event_id,omitempty"`

	Topic     string `json:"topic"`
	Partition int32  `json:"partition"`
	Offset    int64  `json:"offset"`

	TenantID string `json:"tenant_id,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`

	Payload     []byte `json:"-"`
	PayloadHash string `json:"payload_hash"`
	HeadersJSON []byte `json:"headers_json,omitempty"`

	ErrorCategory string `json:"error_category"`
	ErrorMessage  string `json:"error_message"`
	AttemptCount  int    `json:"attempt_count"`

	Status string `json:"status"`

	FirstAttemptAt time.Time `json:"first_attempt_at"`
	LastAttemptAt  time.Time `json:"last_attempt_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
