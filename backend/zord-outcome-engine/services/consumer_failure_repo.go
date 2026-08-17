package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"strconv"

	"zord-outcome-engine/models"
)

// ConsumerFailureRepository persists OUT-02's durable Kafka failure ledger.
type ConsumerFailureRepository interface {
	// Record durably writes rec, keyed by rec.IdempotencyKey. Redelivery of
	// the same Kafka message (same idempotency key) updates attempt_count/
	// last_attempt_at on the existing row rather than creating a second one
	// — this is what makes the write safe to retry after a crash between a
	// successful Record and the not-yet-flushed offset commit.
	Record(ctx context.Context, rec models.ConsumerFailureReceipt) error
}

type ConsumerFailurePostgresRepo struct {
	db *sql.DB
}

func NewConsumerFailureRepo(db *sql.DB) ConsumerFailureRepository {
	return &ConsumerFailurePostgresRepo{db: db}
}

var _ ConsumerFailureRepository = (*ConsumerFailurePostgresRepo)(nil)

func (r *ConsumerFailurePostgresRepo) Record(ctx context.Context, rec models.ConsumerFailureReceipt) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO consumer_failure_receipts (
			idempotency_key, event_id, topic, partition, "offset",
			tenant_id, trace_id,
			payload, payload_hash, headers_json,
			error_category, error_message, attempt_count,
			status, first_attempt_at, last_attempt_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7,
			$8, $9, $10,
			$11, $12, $13,
			$14, $15, $15
		)
		ON CONFLICT (idempotency_key) DO UPDATE SET
			attempt_count   = EXCLUDED.attempt_count,
			error_category  = EXCLUDED.error_category,
			error_message   = EXCLUDED.error_message,
			last_attempt_at = EXCLUDED.last_attempt_at,
			updated_at      = now()
	`,
		rec.IdempotencyKey, nullableString(rec.EventID), rec.Topic, rec.Partition, rec.Offset,
		nullableString(rec.TenantID), nullableString(rec.TraceID),
		rec.Payload, rec.PayloadHash, rec.HeadersJSON,
		rec.ErrorCategory, rec.ErrorMessage, rec.AttemptCount,
		models.FailureStatusDeadLettered, rec.LastAttemptAt,
	)
	return err
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// HashPayload computes the payload_hash stored alongside a failure receipt.
func HashPayload(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// FailureIdempotencyKey returns event_id when non-empty, otherwise falls
// back to "topic:partition:offset" so an unparseable poison message still
// has a stable key across redelivery.
func FailureIdempotencyKey(eventID, topic string, partition int32, offset int64) string {
	if eventID != "" {
		return eventID
	}
	return topic + ":" + strconv.FormatInt(int64(partition), 10) + ":" + strconv.FormatInt(offset, 10)
}
