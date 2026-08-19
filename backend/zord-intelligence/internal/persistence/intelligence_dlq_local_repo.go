package persistence

// intelligence_dlq_local_repo.go
//
// Reads and writes intelligence_dlq_local_receipts — INTEL-07's local
// durable fallback for the inbound Kafka DLQ hand-off. See
// models.LocalDLQReceipt for why this table exists.
//
// WHO WRITES TO THIS FILE?
//   kafka/consumer.go → Insert() in place of the old blocking retry-publish
//   to TopicIntelligenceDLQ, right before the source offset is committed.
//
// WHO READS AND UPDATES THIS FILE?
//   intelligence_dlq_replay_worker.go → FetchPending() to get rows to replay
//   intelligence_dlq_replay_worker.go → MarkReplayed()     after successful publish
//   intelligence_dlq_replay_worker.go → MarkReplayFailed() after failed publish

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/kafka"
)

// IntelligenceDLQLocalRepo reads and writes intelligence_dlq_local_receipts.
type IntelligenceDLQLocalRepo struct {
	pool *pgxpool.Pool
}

// Compile-time check: IntelligenceDLQLocalRepo must keep satisfying
// kafka.LocalDLQWriter — main.go passes *IntelligenceDLQLocalRepo directly
// into kafka.StartConsumers as that interface. A signature drift here would
// otherwise only surface as an error at that call site.
var _ kafka.LocalDLQWriter = (*IntelligenceDLQLocalRepo)(nil)

// NewIntelligenceDLQLocalRepo creates an IntelligenceDLQLocalRepo.
func NewIntelligenceDLQLocalRepo(pool *pgxpool.Pool) *IntelligenceDLQLocalRepo {
	return &IntelligenceDLQLocalRepo{pool: pool}
}

// Insert saves one failed-message record locally. Called from the consumer
// goroutine itself, not inside a wider DB transaction — this write stands on
// its own, immediately followed by a Kafka offset commit.
func (r *IntelligenceDLQLocalRepo) Insert(ctx context.Context, rec models.IntelligenceDLQRecord) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO intelligence_dlq_local_receipts
			(tenant_id, partition_key, source_topic, partition, "offset",
			 event_id, event_type, event_version, payload_hash, payload,
			 error_class, error_message, occurred_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		nilIfEmpty(rec.TenantID), nilIfEmpty(rec.PartitionKey), rec.SourceTopic,
		rec.Partition, rec.Offset, nilIfEmpty(rec.EventID), rec.EventType,
		nilIfEmpty(rec.EventVersion), nilIfEmpty(rec.PayloadHash), rec.Payload,
		rec.ErrorClass, nilIfEmpty(rec.ErrorMessage), rec.OccurredAt,
	)
	if err != nil {
		return fmt.Errorf("intelligence_dlq_local_repo.Insert source_topic=%s offset=%d: %w", rec.SourceTopic, rec.Offset, err)
	}
	return nil
}

// FetchPending returns up to `limit` receipts not yet replayed to Kafka,
// oldest first.
//
// FOR UPDATE SKIP LOCKED: multiple ZPI instances don't double-replay the
// same receipt — same discipline as OutboxRepo.FetchPending.
func (r *IntelligenceDLQLocalRepo) FetchPending(ctx context.Context, limit int) ([]models.LocalDLQReceipt, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, COALESCE(tenant_id, ''), COALESCE(partition_key, ''),
		       source_topic, partition, "offset",
		       COALESCE(event_id, ''), event_type, COALESCE(event_version, ''),
		       COALESCE(payload_hash, ''), payload,
		       error_class, COALESCE(error_message, ''), occurred_at,
		       created_at, attempts, COALESCE(last_replay_error, '')
		FROM   intelligence_dlq_local_receipts
		WHERE  replayed_at IS NULL
		ORDER  BY created_at ASC
		LIMIT  $1
		FOR UPDATE SKIP LOCKED
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("intelligence_dlq_local_repo.FetchPending: %w", err)
	}
	defer rows.Close()

	var result []models.LocalDLQReceipt
	for rows.Next() {
		var recv models.LocalDLQReceipt
		if err := rows.Scan(
			&recv.ID, &recv.Record.TenantID, &recv.Record.PartitionKey,
			&recv.Record.SourceTopic, &recv.Record.Partition, &recv.Record.Offset,
			&recv.Record.EventID, &recv.Record.EventType, &recv.Record.EventVersion,
			&recv.Record.PayloadHash, &recv.Record.Payload,
			&recv.Record.ErrorClass, &recv.Record.ErrorMessage, &recv.Record.OccurredAt,
			&recv.CreatedAt, &recv.Attempts, &recv.LastReplayError,
		); err != nil {
			return nil, fmt.Errorf("intelligence_dlq_local_repo.FetchPending scan: %w", err)
		}
		result = append(result, recv)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("intelligence_dlq_local_repo.FetchPending rows.Err: %w", err)
	}
	return result, nil
}

// OldestPendingAge returns how long the oldest unreplayed receipt has been
// waiting, and how many receipts are currently pending. Used by the replay
// worker to raise a stall alert when Kafka has been unreachable long enough
// that a real backlog is building up. ok=false means there are no pending
// receipts at all (nothing to alert on).
func (r *IntelligenceDLQLocalRepo) OldestPendingAge(ctx context.Context) (age time.Duration, count int, ok bool, err error) {
	// oldest is *time.Time (not time.Time): MIN(created_at) is SQL NULL when
	// zero rows match, and scanning NULL into a non-pointer time.Time fails.
	var oldest *time.Time
	scanErr := r.pool.QueryRow(ctx, `
		SELECT MIN(created_at), COUNT(*)
		FROM   intelligence_dlq_local_receipts
		WHERE  replayed_at IS NULL
	`).Scan(&oldest, &count)
	if scanErr != nil {
		return 0, 0, false, fmt.Errorf("intelligence_dlq_local_repo.OldestPendingAge: %w", scanErr)
	}
	if count == 0 || oldest == nil {
		return 0, 0, false, nil
	}
	return time.Since(*oldest), count, true, nil
}

// MarkReplayed sets replayed_at once the receipt is confirmed published to
// TopicIntelligenceDLQ. FetchPending excludes rows with replayed_at set, so
// this is the "stop retrying" signal.
func (r *IntelligenceDLQLocalRepo) MarkReplayed(ctx context.Context, id int64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE intelligence_dlq_local_receipts
		SET    replayed_at = now()
		WHERE  id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("intelligence_dlq_local_repo.MarkReplayed id=%d: %w", id, err)
	}
	return nil
}

// MarkReplayFailed records a failed replay attempt. Unlike OutboxRepo's
// MarkFailed, there is no terminal/exhausted state here — a receipt is
// retried every worker tick until it succeeds, since the record must
// eventually reach the DLQ topic.
func (r *IntelligenceDLQLocalRepo) MarkReplayFailed(ctx context.Context, id int64, errMsg string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE intelligence_dlq_local_receipts
		SET    attempts          = attempts + 1,
		       last_replay_error = $2
		WHERE  id = $1
	`, id, nilIfEmpty(errMsg))
	if err != nil {
		return fmt.Errorf("intelligence_dlq_local_repo.MarkReplayFailed id=%d: %w", id, err)
	}
	return nil
}
