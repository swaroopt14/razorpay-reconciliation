package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
	"zord-relay/model"

	"github.com/lib/pq"
)

// RelayOutboxRepo handles all reads and writes to the relay_outbox table.
// The relay_outbox is Service 4's durability guarantee: events are written
// here atomically with dispatch state changes, then published to Kafka
// by the relay loop independently. Kafka downtime never blocks dispatching.
type RelayOutboxRepo struct {
	db *sql.DB
}

func NewRelayOutboxRepo(db *sql.DB) *RelayOutboxRepo {
	return &RelayOutboxRepo{db: db}
}

// EnqueueTx writes a new relay outbox event inside an existing transaction.
// This is the only way to write to relay_outbox — always inside a tx
// that also mutates the dispatches table, guaranteeing atomicity.
// payload must contain no PII.
func (r *RelayOutboxRepo) EnqueueTx(
	ctx context.Context,
	tx *sql.Tx,
	eventID, eventType, dispatchID, contractID, intentID, tenantID, traceID string,
	payload interface{},
) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("relay_outbox_repo: marshal payload for %s: %w", eventType, err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO relay_outbox (
			event_id, event_type, dispatch_id, contract_id,
			intent_id, tenant_id, trace_id, payload, status, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', now())
	`, eventID, eventType, dispatchID, contractID, intentID, tenantID, traceID, b)
	if err != nil {
		return fmt.Errorf("relay_outbox_repo: enqueue %s: %w", eventType, err)
	}
	return nil
}

// ListPendingForPublish fetches up to `batch` PENDING rows for Kafka publishing.
// Uses FOR UPDATE SKIP LOCKED so multiple relay workers can run concurrently
// without picking the same rows.
func (r *RelayOutboxRepo) ListPendingForPublish(ctx context.Context, batch int) ([]model.RelayOutboxRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT event_id, event_type, dispatch_id, contract_id,
		       intent_id, tenant_id, trace_id, payload, status, created_at
		FROM relay_outbox
		WHERE status = 'PENDING'
		ORDER BY created_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`, batch)
	if err != nil {
		return nil, fmt.Errorf("relay_outbox_repo: list pending: %w", err)
	}
	defer rows.Close()

	var events []model.RelayOutboxRow
	for rows.Next() {
		var e model.RelayOutboxRow
		if err := rows.Scan(
			&e.EventID, &e.EventType, &e.DispatchID, &e.ContractID,
			&e.IntentID, &e.TenantID, &e.TraceID, &e.Payload, &e.Status, &e.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("relay_outbox_repo: scan: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("relay_outbox_repo: rows error: %w", err)
	}
	return events, nil
}

// MarkPublished updates a batch of relay outbox rows to PUBLISHED.
// Called after successful Kafka publish.
func (r *RelayOutboxRepo) MarkPublished(ctx context.Context, eventIDs []string) error {
	if len(eventIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `
		UPDATE relay_outbox
		SET status = 'PUBLISHED', published_at = $1
		WHERE event_id = ANY($2)
		  AND status = 'PENDING'
	`, now, pq.Array(eventIDs))
	if err != nil {
		return fmt.Errorf("relay_outbox_repo: mark published: %w", err)
	}
	return nil
}

// IncrementRetry increments the retry_count for a specific outbox event.
func (r *RelayOutboxRepo) IncrementRetry(ctx context.Context, eventID string) (int, error) {
	var newCount int
	err := r.db.QueryRowContext(ctx, `
		UPDATE relay_outbox
		SET retry_count = retry_count + 1
		WHERE event_id = $1
		RETURNING retry_count
	`, eventID).Scan(&newCount)
	if err != nil {
		return 0, fmt.Errorf("relay_outbox_repo: increment retry: %w", err)
	}
	return newCount, nil
}

// MarkFailed marks an event as terminal FAILED.
func (r *RelayOutboxRepo) MarkFailed(ctx context.Context, eventID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE relay_outbox
		SET status = 'FAILED'
		WHERE event_id = $1
	`, eventID)
	if err != nil {
		return fmt.Errorf("relay_outbox_repo: mark failed: %w", err)
	}
	return nil
}