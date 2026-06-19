package persistence

import (
	"context"
	"database/sql"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type DLQPullRepository interface {
	LeaseDLQBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.DLQEntry, error)
	AckDLQBatch(ctx context.Context, leaseID string, dlqIDs []string) (int64, error)
	NackDLQBatch(ctx context.Context, leaseID string, dlqIDs []string) (int64, error)
}

type DLQPullRepo struct {
	db *sql.DB
}

const (
	maxDLQAttempts = 5
	maxDLQAgeHours = 24
)

func NewDLQPullRepo(db *sql.DB) *DLQPullRepo {
	return &DLQPullRepo{db: db}
}

func (r *DLQPullRepo) LeaseDLQBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.DLQEntry, error) {
	const maxLeaseLimit = 1000

	if limit <= 0 {
		limit = 500
	}
	if limit > maxLeaseLimit {
		limit = maxLeaseLimit
	}

	leaseUUID := uuid.New()
	leaseID := leaseUUID.String()

	query := `
WITH picked AS (
	SELECT dlq_id
	FROM dlq_items
	WHERE dispatched_at IS NULL
	  AND retry_count < $5
	  AND (lease_until IS NULL OR lease_until < NOW())
	  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
),
leased AS (
	UPDATE dlq_items d
	SET lease_id = $2::uuid,
	    leased_by = $3,
	    lease_until = NOW() + ($4::int * INTERVAL '1 second')
	FROM picked p
	WHERE d.dlq_id = p.dlq_id
	RETURNING
		d.dlq_id::text as dlq_id,
		COALESCE(d.tenant_id::text, '') as tenant_id,
		COALESCE(d.envelope_id::text, '') as envelope_id,
		d.stage,
		d.reason_code,
		COALESCE(d.error_detail, '') as error_detail,
		d.replayable,
		COALESCE(d.client_batch_ref, '') as client_batch_ref,
		d.created_at,
		COALESCE(d.batch_id, '') as batch_id,
		d.source_row_num,
		d.dlq_status,
		d.intent_context,
		COALESCE(d.trace_id, '') as trace_id,
		COALESCE(d.lease_id::text, '') as lease_id,
		COALESCE(d.leased_by, '') as leased_by,
		d.lease_until,
		d.retry_count,
		d.next_attempt_at,
		d.dispatched_at
)
SELECT
	dlq_id,
	tenant_id,
	envelope_id,
	stage,
	reason_code,
	error_detail,
	replayable,
	client_batch_ref,
	created_at,
	batch_id,
	source_row_num,
	dlq_status,
	intent_context,
	trace_id,
	lease_id,
	leased_by,
	lease_until,
	retry_count,
	next_attempt_at,
	dispatched_at
FROM leased
ORDER BY created_at ASC;
`

	rows, err := r.db.QueryContext(ctx, query, limit, leaseID, leasedBy, leaseTTLSeconds, maxDLQAttempts)
	if err != nil {
		return "", nil, nil, err
	}
	defer rows.Close()

	entries := make([]models.DLQEntry, 0, limit)
	var leaseUntil *time.Time

	for rows.Next() {
		var e models.DLQEntry
		var nextRetry sql.NullTime
		var lu sql.NullTime
		var dispAt sql.NullTime

		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.BatchID,
			&e.SourceRowNum,
			&e.DLQStatus,
			&e.IntentContext,
			&e.TraceID,
			&e.LeaseID,
			&e.LeasedBy,
			&lu,
			&e.RetryCount,
			&nextRetry,
			&dispAt,
		); err != nil {
			return "", nil, nil, err
		}

		if nextRetry.Valid {
			t := nextRetry.Time
			e.NextAttemptAt = &t
		}
		if dispAt.Valid {
			t := dispAt.Time
			e.DispatchedAt = &t
		}
		if lu.Valid {
			t := lu.Time
			e.LeaseUntil = &t
			if leaseUntil == nil {
				leaseUntil = &t
			}
		}

		entries = append(entries, e)
	}

	if err := rows.Err(); err != nil {
		return "", nil, nil, err
	}

	if len(entries) == 0 {
		return "", nil, []models.DLQEntry{}, nil
	}

	return leaseID, leaseUntil, entries, nil
}

func (r *DLQPullRepo) AckDLQBatch(ctx context.Context, leaseID string, dlqIDs []string) (int64, error) {
	query := `
UPDATE dlq_items
SET dispatched_at = NOW(),
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND dlq_id = ANY($2::uuid[]);
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(dlqIDs))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *DLQPullRepo) NackDLQBatch(ctx context.Context, leaseID string, dlqIDs []string) (int64, error) {
	query := `
UPDATE dlq_items
SET retry_count = retry_count + 1,
    next_attempt_at = CASE
        WHEN retry_count + 1 >= $3 OR created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN NULL
        ELSE NOW() + (
			LEAST(3600, GREATEST(1, POWER(2, retry_count))) * (0.8 + random() * 0.4)
		) * INTERVAL '1 second'
    END,
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND dlq_id = ANY($2::uuid[])
  AND dispatched_at IS NULL;
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(dlqIDs), maxDLQAttempts, maxDLQAgeHours)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
