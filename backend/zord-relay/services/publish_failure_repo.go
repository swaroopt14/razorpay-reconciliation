package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
)

// Replay status values for relay_publish_failures.
const (
	ReplayStatusPending  = "PENDING"
	ReplayStatusReplayed = "REPLAYED"
)

// PublishFailureRepo persists durable records of exhausted Kafka publish
// attempts on the outbox-relay path (P0 6.1.3).
//
// A publish attempt that is abandoned — because the event is poison (never
// publishable) or because retries were exhausted — must never be reduced to
// a log line. The upstream lease for the source event may only be
// acknowledged after either (a) the publish itself succeeded, or (b) a row
// has been durably committed here. A best-effort Kafka DLQ message is not
// sufficient on its own: Kafka may be the very thing that is unreachable.
type PublishFailureRepo struct {
	db *sql.DB
}

func NewPublishFailureRepo(db *sql.DB) *PublishFailureRepo {
	return &PublishFailureRepo{db: db}
}

// PublishFailureRecord is one durable row describing an exhausted publish attempt.
type PublishFailureRecord struct {
	SourceEventID    string
	SourceService    string
	Topic            string // topic carried on the source event, if any
	DestinationTopic string // Kafka topic the publish was attempted against
	Payload          []byte // raw payload bytes — hashed for the record, never stored verbatim
	AttemptCount     int
	FailureClass     string // reason code, e.g. INVALID_PAYLOAD, KAFKA_MAX_RETRIES_EXCEEDED
	LastError        string
}

// Record persists (or refreshes, on re-delivery) one durable failure row.
// Idempotent on (source_service, source_event_id, destination_topic) so a
// crash-and-redeliver of the same poison/exhausted event does not pile up
// duplicate rows — it just refreshes attempt_count/last_error.
//
// Callers MUST treat a non-nil error here as "not durably recorded" and
// must NOT acknowledge the upstream lease for the event in that case.
func (r *PublishFailureRepo) Record(ctx context.Context, rec PublishFailureRecord) error {
	sum := sha256.Sum256(rec.Payload)
	payloadHash := hex.EncodeToString(sum[:])

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO relay_publish_failures (
			source_event_id, source_service, topic, destination_topic,
			payload_hash, attempt_count, failure_class, last_error,
			replay_status, detected_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
		ON CONFLICT (source_service, source_event_id, destination_topic) DO UPDATE SET
			topic          = EXCLUDED.topic,
			payload_hash   = EXCLUDED.payload_hash,
			attempt_count  = EXCLUDED.attempt_count,
			failure_class  = EXCLUDED.failure_class,
			last_error     = EXCLUDED.last_error,
			updated_at     = now()
	`,
		rec.SourceEventID, rec.SourceService, rec.Topic, rec.DestinationTopic,
		payloadHash, rec.AttemptCount, rec.FailureClass, rec.LastError, ReplayStatusPending,
	)
	if err != nil {
		return fmt.Errorf("publish_failure_repo: record: %w", err)
	}
	return nil
}

// MarkReplayed marks a previously-recorded failure as successfully replayed
// (e.g. an operator tool republished it after a fix upstream).
func (r *PublishFailureRepo) MarkReplayed(ctx context.Context, sourceService, sourceEventID, destinationTopic string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE relay_publish_failures
		SET replay_status = $4, replayed_at = now(), updated_at = now()
		WHERE source_service = $1 AND source_event_id = $2 AND destination_topic = $3
	`, sourceService, sourceEventID, destinationTopic, ReplayStatusReplayed)
	if err != nil {
		return fmt.Errorf("publish_failure_repo: mark replayed: %w", err)
	}
	return nil
}
