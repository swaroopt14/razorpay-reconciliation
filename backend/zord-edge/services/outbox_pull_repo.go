package services

import (
	"context"
	"database/sql"
	"time"

	"zord-edge/model"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type OutboxPullRepository interface {
	LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []model.OutboxEvent, error)
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

func (r *OutboxPullRepo) LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []model.OutboxEvent, error) {
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
	SELECT outbox_id
	FROM ingress_outbox
	WHERE status = 'PENDING'
	  AND attempts < $5
	  AND (lease_until IS NULL OR lease_until < NOW())
	  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
),
leased AS (
	UPDATE ingress_outbox o
	SET lease_id = $2::uuid,
	    leased_by = $3,
	    lease_until = NOW() + ($4::int * INTERVAL '1 second'),
	    updated_at = NOW()
	FROM picked p
	WHERE o.outbox_id = p.outbox_id
	RETURNING
		o.outbox_id,
		o.trace_id,
		o.envelope_id,
		o.tenant_id,
		o.artifact_id,
		o.artifact_version_id,
		o.object_ref,
		o.received_at,
		o.source,
		o.idempotency_key,
		o.encrypted_payload,
		o.payload_hash,
		o.raw_row_hash,
		o.envelope_hash,
		o.envelope_signature,
		o.content_type,
		o.kms_key_version,
		o.encryption_key_id,
		o.topic,
		o.status,
		o.attempts,
		o.next_retry_at,
		o.lease_id,
		o.leased_by,
		o.event_type,
		o.lease_until,
		o.created_at,
		o.updated_at,
		o.published_at,
		o.failure_reason_code,
		o.batchid,
		o.file_content_hash,
		o.source_row_ref,
		o.source_system
)
SELECT
	outbox_id,
	trace_id,
	envelope_id,
	tenant_id,
	artifact_id,
	artifact_version_id,
	object_ref,
	received_at,
	source,
	idempotency_key,
	encrypted_payload,
	payload_hash,
	raw_row_hash,
	envelope_hash,
	envelope_signature,
	content_type,
	kms_key_version,
	encryption_key_id,
	topic,
	status,
	attempts,
	next_retry_at,
	lease_id,
	leased_by,
	event_type,
	lease_until,
	created_at,
	updated_at,
	published_at,
	failure_reason_code,
	batchid,
	file_content_hash,
	source_row_ref,
	source_system
FROM leased
ORDER BY created_at ASC;
`

	rows, err := r.db.QueryContext(ctx, query, limit, leaseID, leasedBy, leaseTTLSeconds, maxOutboxAttempts)
	if err != nil {
		return "", nil, nil, err
	}
	defer rows.Close()

	events := make([]model.OutboxEvent, 0, limit)
	var leaseUntil *time.Time

	for rows.Next() {
		var evt model.OutboxEvent
		if err := rows.Scan(
			&evt.OutboxID,
			&evt.TraceID,
			&evt.EnvelopeID,
			&evt.TenantID,
			&evt.ArtifactID,
			&evt.ArtifactVersionID,
			&evt.ObjectRef,
			&evt.ReceivedAt,
			&evt.Source,
			&evt.IdempotencyKey,
			&evt.EncryptedPayload,
			&evt.PayloadHash,
			&evt.RawRowHash,
			&evt.EnvelopeHash,
			&evt.EnvelopeSignature,
			&evt.ContentType,
			&evt.KMSKeyVersion,
			&evt.EncryptionKeyID,
			&evt.Topic,
			&evt.Status,
			&evt.Attempts,
			&evt.NextRetryAt,
			&evt.LeaseID,
			&evt.LeasedBy,
			&evt.EventType,
			&evt.LeaseUntil,
			&evt.CreatedAt,
			&evt.UpdatedAt,
			&evt.PublishedAt,
			&evt.FailureReasonCode,
			&evt.BatchID,
			&evt.FileContentHash,
			&evt.SourceRowRef,
			&evt.SourceSystem,
		); err != nil {
			return "", nil, nil, err
		}

		if evt.LeaseUntil != nil && leaseUntil == nil {
			leaseUntil = evt.LeaseUntil
		}

		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return "", nil, nil, err
	}

	if len(events) == 0 {
		return "", nil, []model.OutboxEvent{}, nil
	}

	return leaseID, leaseUntil, events, nil
}

func (r *OutboxPullRepo) AckOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
UPDATE ingress_outbox
SET status = 'SENT',
    published_at = NOW(),
    updated_at = NOW(),
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND outbox_id = ANY($2::uuid[]);
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *OutboxPullRepo) NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
UPDATE ingress_outbox
SET attempts = attempts + 1,
    updated_at = NOW(),
	status = CASE
        WHEN attempts + 1 >= $3 OR created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN 'FAILED'
        ELSE 'PENDING'
    END,
    next_retry_at = CASE
        WHEN attempts + 1 >= $3 OR created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN NULL
        ELSE NOW() + (
			LEAST(3600, GREATEST(1, POWER(2, attempts))) * (0.8 + random() * 0.4)
		) * INTERVAL '1 second'
    END,
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
WHERE lease_id = $1::uuid
  AND outbox_id = ANY($2::uuid[])
  AND status = 'PENDING';
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs), maxOutboxAttempts, maxOutboxAgeHours)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
