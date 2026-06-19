package persistence

import (
	"context"
	"database/sql"
	"time"

	"zord-intent-engine/internal/models"

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
	FROM outbox
	WHERE status = 'PENDING'
	  AND retry_count < $5
	  AND (lease_until IS NULL OR lease_until < NOW())
	  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
),
leased AS (
	UPDATE outbox o
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
		o.amount,
		o.currency,
		NULL as corridor_id,
		o.retry_count,
		o.next_attempt_at,
		o.payload,
		o.status,
		o.created_at,
		COALESCE(o.lease_id::text, '') as lease_id,
		COALESCE(o.leased_by, '') as leased_by,
		o.lease_until,
		o.batchid,
		o.source_row_num,
		o.canonical_hash,
		o.governance_state,
		o.governance_hash,
		o.mapping_profile_id,
		o.required_fields_status,
		o.tokenization_status,
		o.governance_decision,
		o.payment_instruction_received,
		o.canonical_intent_created,
		COALESCE(o.client_payout_ref, '') as client_payout_ref
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
	amount,
	currency,
	corridor_id,
	retry_count,
	next_attempt_at,
	payload,
	status,
	created_at,
	lease_id,
	leased_by,
	lease_until,
	batchid,
	source_row_num,
	canonical_hash,
	governance_state,
	governance_hash,
	mapping_profile_id,
	required_fields_status,
	tokenization_status,
	governance_decision,
	payment_instruction_received,
	canonical_intent_created,
	client_payout_ref
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
		var corridorId sql.NullString
		var canonicalHash sql.NullString
		var governanceState sql.NullString
		var governanceHash sql.NullString

		if err := rows.Scan(
			&evt.EventID,
			&evt.EnvelopeID,
			&evt.TraceID,
			&evt.TenantID,
			&evt.ContractID,
			&evt.AggregateType,
			&evt.AggregateID,
			&evt.EventType,
			&evt.Amount,
			&evt.Currency,
			&corridorId,
			&evt.RetryCount,
			&nextRetry,
			&evt.Payload,
			&evt.Status,
			&evt.CreatedAt,
			&evt.LeaseID,
			&evt.LeasedBy,
			&lu,
			&evt.BatchID,
			&evt.SourceRowNum,
			&canonicalHash,
			&governanceState,
			&governanceHash,
			&evt.MappingProfileID,
			&evt.RequiredFieldsStatus,
			&evt.TokenizationStatus,
			&evt.GovernanceDecision,
			&evt.PaymentInstructionReceived,
			&evt.CanonicalIntentCreated,
			&evt.ClientPayoutRef,
		); err != nil {
			return "", nil, nil, err
		}

		evt.IntentID = evt.AggregateID.String()
		if corridorId.Valid {
			evt.CorridorID = &corridorId.String
		} else {
			evt.CorridorID = nil
		}
		if canonicalHash.Valid {
			evt.CanonicalHash = canonicalHash.String
		}
		if governanceState.Valid {
			evt.GovernanceState = governanceState.String
		}
		if governanceHash.Valid {
			evt.GovernanceHash = governanceHash.String
		}

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
WITH locked AS (
	SELECT event_id
	FROM outbox
	WHERE lease_id = $1::uuid
	  AND event_id = ANY($2::uuid[])
	ORDER BY event_id
	FOR UPDATE
)
UPDATE outbox o
SET status = 'SENT',
    sent_at = NOW(),
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
FROM locked l
WHERE o.event_id = l.event_id;
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *OutboxPullRepo) NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
WITH locked AS (
	SELECT event_id
	FROM outbox
	WHERE lease_id = $1::uuid
	  AND event_id = ANY($2::uuid[])
	  AND status = 'PENDING'
	ORDER BY event_id
	FOR UPDATE
)
UPDATE outbox o
SET retry_count = o.retry_count + 1,
	status = CASE
        WHEN o.retry_count + 1 >= $3 OR o.created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN 'FAILED'
        ELSE 'PENDING'
    END,
    next_attempt_at = CASE
        WHEN o.retry_count + 1 >= $3 OR o.created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN NULL
        ELSE NOW() + (
			LEAST(3600, GREATEST(1, POWER(2, o.retry_count))) * (0.8 + random() * 0.4)
		) * INTERVAL '1 second'
    END,
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
FROM locked l
WHERE o.event_id = l.event_id;
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs), maxOutboxAttempts, maxOutboxAgeHours)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
