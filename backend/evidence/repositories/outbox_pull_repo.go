package repositories

import (
	"context"
	"database/sql"
	"time"

	"zord-evidence/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type OutboxPullRepository interface {
	LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.OutboxEvent, error)
	AckOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error)
	NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error)
}

type OutboxPullRepo struct {
	db *sql.DB
}

const (
	maxOutboxAttempts = 7
	maxOutboxAgeHours = 8
)

func NewOutboxPullRepo(db *sql.DB) *OutboxPullRepo {
	return &OutboxPullRepo{db: db}
}

func (r *OutboxPullRepo) LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.OutboxEvent, error) {
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
	SELECT event_id
	FROM evidence_outbox_events
	WHERE status = 'PENDING'
	  AND retry_count < $5
	  AND (lease_until IS NULL OR lease_until < NOW())
	  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
),
leased AS (
	UPDATE evidence_outbox_events o
	SET lease_id = $2::uuid,
	    leased_by = $3,
	    lease_until = NOW() + ($4::int * INTERVAL '1 second')
	FROM picked p
	WHERE o.event_id = p.event_id
	RETURNING
		o.event_id::text as event_id,
		COALESCE(o.envelope_id::text, '') as envelope_id,
		COALESCE(o.trace_id::text, '') as trace_id,
		COALESCE(o.tenant_id::text, '') as tenant_id,
		COALESCE(o.contract_id::text, '') as contract_id,
		o.aggregate_type,
		o.aggregate_id,
		o.event_type,
		o.retry_count,
		o.next_attempt_at,
		o.payload,
		o.status,
		o.created_at,
		COALESCE(o.lease_id::text, '') as lease_id,
		COALESCE(o.leased_by, '') as leased_by,
		o.lease_until
)
SELECT
	event_id,
	envelope_id,
	trace_id,
	tenant_id,
	contract_id,
	aggregate_type,
	aggregate_id,
	event_type,
	retry_count,
	next_attempt_at,
	payload,
	status,
	created_at,
	lease_id,
	leased_by,
	lease_until
FROM leased
ORDER BY created_at ASC;
`

	rows, err := r.db.QueryContext(ctx, query, limit, leaseID, leasedBy, leaseTTLSeconds, maxOutboxAttempts)
	if err != nil {
		return "", nil, nil, err
	}
	defer rows.Close()

	events := make([]models.OutboxEvent, 0, limit)
	var leaseUntil *time.Time

	for rows.Next() {
		var evt models.OutboxEvent
		var nextRetry sql.NullTime
		var lu sql.NullTime

		if err := rows.Scan(
			&evt.EventID,
			&evt.EnvelopeID,
			&evt.TraceID,
			&evt.TenantID,
			&evt.ContractID,
			&evt.AggregateType,
			&evt.AggregateID,
			&evt.EventType,
			&evt.RetryCount,
			&nextRetry,
			&evt.Payload,
			&evt.Status,
			&evt.CreatedAt,
			&evt.LeaseID,
			&evt.LeasedBy,
			&lu,
		); err != nil {
			return "", nil, nil, err
		}

		evt.IntentID = evt.AggregateID

		if nextRetry.Valid {
			t := nextRetry.Time
			evt.NextRetryAt = &t
		}
		// All rows in this batch share the same lease_until value because it is
		// computed once in the SQL statement (NOW() + interval).
		// We capture it from the first row only to avoid redundant assignments.
		if lu.Valid {
			t := lu.Time
			evt.LeaseUntil = &t
			if leaseUntil == nil {
				leaseUntil = &t
			}
		}

		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return "", nil, nil, err
	}

	// No rows leased -> return empty lease info
	if len(events) == 0 {
		return "", nil, []models.OutboxEvent{}, nil
	}

	return leaseID, leaseUntil, events, nil
}

func (r *OutboxPullRepo) AckOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
UPDATE evidence_outbox_events
SET status = 'SENT',
    sent_at = NOW(),
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND event_id = ANY($2::uuid[]);
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *OutboxPullRepo) NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
UPDATE evidence_outbox_events
SET retry_count = retry_count + 1,
	status = CASE
        WHEN retry_count + 1>= $3 OR created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN 'FAILED'
        ELSE 'PENDING'
    END,
    next_attempt_at = CASE
        WHEN retry_count + 1>= $3 OR created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN NULL
        ELSE NOW() + (
			LEAST(3600, GREATEST(1, POWER(2, retry_count))) * (0.8 + random() * 0.4)
		) * INTERVAL '1 second'
    END,
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND event_id = ANY($2::uuid[])
  AND status = 'PENDING';
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs), maxOutboxAttempts, maxOutboxAgeHours)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
