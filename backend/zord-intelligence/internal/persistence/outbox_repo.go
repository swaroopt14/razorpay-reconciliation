package persistence

// outbox_repo.go
//
// Reads and writes the actuation_outbox table.
//
// PHASE 5: FetchPending now joins action_contracts to enforce the approval gate.
// Outbox entries for PENDING_APPROVAL contracts are silently skipped.
// Only entries whose linked contract has contract_status IN ('ACTIVE', 'APPROVED')
// are returned. This is the database-level enforcement of the approval workflow.
//
// WHY AT THE DB LEVEL?
// Enforcing in Go code (checking contract_status after fetching) creates a
// TOCTOU race: the status could change between the fetch and the check.
// The SQL JOIN + WHERE filter is atomic — no race possible.
//
// WHO WRITES TO THIS FILE?
//   action_service.go → InsertTx() — adds entry when ActionContract is created (ACTIVE)
//   action_service.go → InsertTx() — adds entry when action is APPROVED (PHASE 5)
//
// WHO READS AND UPDATES THIS FILE?
//   outbox_worker.go  → FetchPending() to get entries to deliver
//   outbox_worker.go  → MarkSent()    after successful Kafka publish
//   outbox_worker.go  → MarkFailed()  after failed Kafka publish

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

// OutboxRepo reads and writes actuation_outbox.
type OutboxRepo struct {
	pool *pgxpool.Pool
}

// NewOutboxRepo creates an OutboxRepo.
func NewOutboxRepo(pool *pgxpool.Pool) *OutboxRepo {
	return &OutboxRepo{pool: pool}
}

// Insert saves a new outbox entry.
// ALWAYS call this in the same DB transaction as action_contract_repo.InsertIfNew.
func (r *OutboxRepo) Insert(ctx context.Context, e models.ActuationOutbox) error {
	_, err := r.pool.Exec(ctx, insertOutboxSQL,
		e.EventID, e.ActionID, e.EventType, e.Payload,
		string(e.Status), e.Attempts, e.NextRetryAt, e.CreatedAt,
		nilIfEmpty(e.TenantID), nilIfEmpty(e.ScopeType), nilIfEmpty(e.ScopeRef),
		nilIfEmpty(e.PayloadHash), nilIfEmpty(e.PayloadSchemaVersion),
	)
	if err != nil {
		return fmt.Errorf("outbox_repo.Insert event=%s: %w", e.EventID, err)
	}
	return nil
}

// InsertTx is identical to Insert but runs inside a pgx.Tx transaction.
// Use this from action_service.go to keep ActionContract + outbox atomic.
func (r *OutboxRepo) InsertTx(
	ctx context.Context,
	tx pgx.Tx,
	e models.ActuationOutbox,
) error {
	_, err := tx.Exec(ctx, insertOutboxSQL,
		e.EventID, e.ActionID, e.EventType, e.Payload,
		string(e.Status), e.Attempts, e.NextRetryAt, e.CreatedAt,
		nilIfEmpty(e.TenantID), nilIfEmpty(e.ScopeType), nilIfEmpty(e.ScopeRef),
		nilIfEmpty(e.PayloadHash), nilIfEmpty(e.PayloadSchemaVersion),
	)
	if err != nil {
		return fmt.Errorf("outbox_repo.InsertTx event=%s: %w", e.EventID, err)
	}
	return nil
}

// insertOutboxSQL is the shared INSERT used by both Insert and InsertTx.
// PHASE 5 (refactor): tenant_id/scope_type/scope_ref/payload_hash/
// payload_schema_version added — see models.ActuationOutbox.
const insertOutboxSQL = `
	INSERT INTO actuation_outbox
		(event_id, action_id, event_type, payload,
		 status, attempts, next_retry_at, created_at,
		 tenant_id, scope_type, scope_ref, payload_hash, payload_schema_version)
	VALUES
		($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	ON CONFLICT (event_id) DO NOTHING
`

// FetchPending returns up to `limit` outbox entries that are ready for delivery.
//
// PHASE 5: JOIN on action_contracts enforces the approval gate.
//
// "Ready" means:
//   - Outbox status is PENDING or FAILED
//   - next_retry_at is in the past
//   - The linked ActionContract has contract_status IN ('ACTIVE', 'APPROVED')
//
// Entries for PENDING_APPROVAL, DISMISSED, or EXPIRED contracts are
// silently excluded. This is atomic — no TOCTOU race possible.
//
// FOR UPDATE SKIP LOCKED: multiple ZPI instances don't double-deliver.
// Each worker locks the rows it fetches; other workers skip locked rows.
func (r *OutboxRepo) FetchPending(ctx context.Context, limit int) ([]models.ActuationOutbox, error) {
	// PHASE 5: JOIN on action_contracts for contract_status gate.
	// The join adds a small cost but the idx_ac_status_created index
	// and the partial outbox index make this fast in practice.
	sql := `
		SELECT o.event_id, o.action_id, o.event_type, o.payload::text,
		       o.status, o.attempts, o.next_retry_at, o.sent_at, o.created_at,
		       COALESCE(o.tenant_id, ''), COALESCE(o.scope_type, ''), COALESCE(o.scope_ref, ''),
		       COALESCE(o.payload_hash, '')
		FROM   actuation_outbox o
		JOIN   action_contracts  ac ON ac.action_id = o.action_id
		WHERE  o.status          IN ('PENDING', 'FAILED')
		  AND  o.next_retry_at   <= now()
		  AND  ac.contract_status IN ('ACTIVE', 'APPROVED')
		ORDER  BY o.next_retry_at ASC
		LIMIT  $1
		FOR UPDATE OF o SKIP LOCKED
	`
	rows, err := r.pool.Query(ctx, sql, limit)
	if err != nil {
		return nil, fmt.Errorf("outbox_repo.FetchPending: %w", err)
	}
	defer rows.Close()

	var result []models.ActuationOutbox
	for rows.Next() {
		var e models.ActuationOutbox
		var status string
		if err := rows.Scan(
			&e.EventID, &e.ActionID, &e.EventType, &e.Payload,
			&status, &e.Attempts, &e.NextRetryAt, &e.SentAt, &e.CreatedAt,
			&e.TenantID, &e.ScopeType, &e.ScopeRef, &e.PayloadHash, // PHASE 5 (refactor)
		); err != nil {
			return nil, fmt.Errorf("outbox_repo.FetchPending scan: %w", err)
		}
		e.Status = models.OutboxStatus(status)
		result = append(result, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("outbox_repo.FetchPending rows.Err: %w", err)
	}
	return result, nil
}

// MarkSent updates an entry to SENT status after successful Kafka delivery.
func (r *OutboxRepo) MarkSent(ctx context.Context, eventID string) error {
	now := time.Now().UTC()
	_, err := r.pool.Exec(ctx, `
		UPDATE actuation_outbox
		SET    status  = 'SENT',
		       sent_at = $1
		WHERE  event_id = $2
	`, now, eventID)
	if err != nil {
		return fmt.Errorf("outbox_repo.MarkSent event=%s: %w", eventID, err)
	}
	return nil
}

// MarkFailed increments the attempt counter and schedules the next retry
// using exponential backoff.
//
// BACKOFF SCHEDULE:
//
//	attempt 1 → retry in 30 seconds
//	attempt 2 → retry in 2 minutes
//	attempt 3 → retry in 8 minutes
//	attempt 4 → retry in 32 minutes
//	attempt 5 → status = FAILED permanently (manual fix needed)
//
// PHASE 5 (refactor): lastErr is persisted into last_error — the Kafka
// publish error was already available at the call site (outbox_worker.go's
// deliver()) but previously only logged, never stored.
func (r *OutboxRepo) MarkFailed(ctx context.Context, eventID string, lastErr string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE actuation_outbox
		SET
			attempts      = attempts + 1,
			status        = CASE
				WHEN attempts + 1 >= 5 THEN 'FAILED'
				ELSE status
			END,
			next_retry_at = CASE
				WHEN attempts + 1 < 5 THEN
					now() + (LEAST(30 * POWER(4, attempts), 3600) || ' seconds')::interval
				ELSE next_retry_at
			END,
			last_error = $2
		WHERE event_id = $1
	`, eventID, nilIfEmpty(lastErr))
	if err != nil {
		return fmt.Errorf("outbox_repo.MarkFailed event=%s: %w", eventID, err)
	}
	return nil
}
