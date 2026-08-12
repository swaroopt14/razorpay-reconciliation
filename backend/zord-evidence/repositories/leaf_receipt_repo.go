package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"
	"zord-evidence/models"

	"github.com/shopspring/decimal"
)

// LeafReceiptRepository writes immutable receipts for every incoming leaf event.
// It also performs the ACCEPTED / DUPLICATE / CONFLICT classification before
// the caller decides whether to proceed with the upsert.
type LeafReceiptRepository interface {
	// WriteReceipt classifies the incoming leaf against what is already stored
	// in pending_leaf_candidates, writes one receipt row, and returns the
	// outcome so the caller can decide how to proceed.
	//
	// Classification rules (evaluated in order):
	//   1. No existing row for (tenant, intent/batch, leaf_type)
	//      → outcome = ACCEPTED
	//   2. Existing row has the same source_event_id
	//      → outcome = DUPLICATE  (Kafka at-least-once re-delivery)
	//   3. Existing row has a different source_event_id
	//      → outcome = CONFLICT   (two different upstream events own this leaf slot)
	//
	// In all three cases a receipt row is written. The caller is responsible
	// for deciding whether to call UpsertLeaf — typically:
	//   ACCEPTED  → always upsert
	//   DUPLICATE → skip upsert (idempotent)
	//   CONFLICT  → upsert (latest wins) but log a warning
	WriteReceipt(ctx context.Context, leaf *models.PendingLeafCandidate) (models.LeafReceiptOutcome, error)
}

type PostgresLeafReceiptRepo struct {
	db *sql.DB
}

func NewLeafReceiptRepository(db *sql.DB) *PostgresLeafReceiptRepo {
	return &PostgresLeafReceiptRepo{db: db}
}

// WriteReceipt implements LeafReceiptRepository.
//
// Design notes:
//
//  1. We query pending_leaf_candidates first to classify the event. This is a
//     read-then-write pattern which has an inherent race window on very high
//     concurrency for the same (tenant, intent, leaf_type). The consequences
//     of the race are benign: both concurrent writers will classify as ACCEPTED
//     and both will write receipt rows; the advisory lock in processIntentJob
//     ensures only one pack is ever generated from the resulting pending rows.
//     A serialisable transaction here would eliminate the race but would reduce
//     Kafka consumer throughput significantly for no correctness benefit.
//
//  2. The receipt INSERT uses ON CONFLICT (source_event_id, tenant_id,
//     leaf_type, intent_id, batch_id) DO NOTHING so that if this function is
//     called twice for the exact same Kafka message (e.g. consumer group
//     rebalance), only one receipt row is written. This makes WriteReceipt
//     itself fully idempotent.
func (r *PostgresLeafReceiptRepo) WriteReceipt(ctx context.Context, leaf *models.PendingLeafCandidate) (models.LeafReceiptOutcome, error) {
	// Ensure we always have a SourceEventID for deduplication.
	// If the upstream didn't provide one, use the leaf Hash as a deterministic fallback.
	if leaf.SourceEventID == "" {
		leaf.SourceEventID = "fallback_" + leaf.Hash
	}

	// --- Step 1: classify against the current pending_leaf_candidates row ---
	outcome, err := r.classify(ctx, leaf)
	if err != nil {
		return "", fmt.Errorf("leaf receipt classify: %w", err)
	}

	scopeType := "unknown"
	scopeRef := ""
	if leaf.IntentID != nil && *leaf.IntentID != "" {
		scopeType = "intent"
		scopeRef = *leaf.IntentID
	} else if leaf.ClientBatchID != nil && *leaf.ClientBatchID != "" {
		scopeType = "batch"
		scopeRef = *leaf.ClientBatchID
	} else if leaf.EnvelopeID != nil && *leaf.EnvelopeID != "" {
		scopeType = "envelope"
		scopeRef = *leaf.EnvelopeID
	}

	var discardReason *string
	if outcome == models.LeafReceiptConflict {
		reason := "Conflicting upstream event"
		discardReason = &reason
	} else if outcome == models.LeafReceiptDuplicate {
		reason := "Duplicate event delivery"
		discardReason = &reason
	}

	var currency *string
	if leaf.Currency != "" {
		currency = &leaf.Currency
	}

	var amountMinor *decimal.Decimal
	if !leaf.Amount.IsZero() {
		amountMinor = &leaf.Amount
	}

	var sourceEventID *string
	if leaf.SourceEventID != "" {
		sourceEventID = &leaf.SourceEventID
	}

	// TraceID preserves the causation/source trace from the upstream event
	// that produced this leaf delivery — nullable, since not every leaf path
	// is guaranteed to carry one (logged upstream when missing).
	var traceID *string
	if leaf.TraceID != "" {
		traceID = &leaf.TraceID
	}

	// --- Step 2: write the immutable receipt row ---
	_, insertErr := r.db.ExecContext(ctx, `
INSERT INTO evidence_leaf_receipts (
	tenant_id,
	scope_type,
	scope_ref,
	leaf_type,
	leaf_hash,
	source_topic,
	source_event_id,
	trace_id,
	schema_version,
	event_version,
	amount_minor,
	currency,
	client_reference,
	bank_reference,
	receipt_status,
	discard_reason,
	received_at
) VALUES (
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
)
ON CONFLICT (source_event_id, tenant_id, leaf_type, scope_type, scope_ref)
DO NOTHING`,
		leaf.TenantID,
		scopeType,
		scopeRef,
		leaf.LeafType,
		leaf.Hash,
		leaf.SourceTopic,
		sourceEventID,
		traceID,
		leaf.SchemaVersion,
		leaf.EventVersion,
		amountMinor,
		currency,
		leaf.ClientPayoutRef,
		leaf.BankReference,
		outcome,
		discardReason,
	)
	if insertErr != nil {
		return "", fmt.Errorf("leaf receipt insert: %w", insertErr)
	}

	return outcome, nil
}

// classify queries pending_leaf_candidates to determine whether the incoming
// leaf is new (ACCEPTED), a re-delivery (DUPLICATE), or a conflicting event
// from a different upstream source (CONFLICT).
func (r *PostgresLeafReceiptRepo) classify(ctx context.Context, leaf *models.PendingLeafCandidate) (
	outcome models.LeafReceiptOutcome,
	err error,
) {
	var storedEventID, storedHash sql.NullString
	var queryErr error

	if leaf.IntentID != nil && *leaf.IntentID != "" {
		queryErr = r.db.QueryRowContext(ctx, `
			SELECT source_event_id, hash
			FROM pending_leaf_candidates
			WHERE tenant_id = $1
			  AND intent_id = $2
			  AND leaf_type = $3
			LIMIT 1`,
			leaf.TenantID, *leaf.IntentID, leaf.LeafType,
		).Scan(&storedEventID, &storedHash)
	} else if leaf.ClientBatchID != nil && *leaf.ClientBatchID != "" {
		queryErr = r.db.QueryRowContext(ctx, `
			SELECT source_event_id, hash
			FROM pending_leaf_candidates
			WHERE tenant_id = $1
			  AND batch_id  = $2
			  AND leaf_type = $3
			  AND intent_id IS NULL
			LIMIT 1`,
			leaf.TenantID, *leaf.ClientBatchID, leaf.LeafType,
		).Scan(&storedEventID, &storedHash)
	} else if leaf.EnvelopeID != nil && *leaf.EnvelopeID != "" {
		queryErr = r.db.QueryRowContext(ctx, `
			SELECT source_event_id, hash
			FROM pending_leaf_candidates
			WHERE tenant_id  = $1
			  AND envelope_id = $2
			  AND leaf_type  = $3
			  AND intent_id  IS NULL
			  AND batch_id   IS NULL
			LIMIT 1`,
			leaf.TenantID, *leaf.EnvelopeID, leaf.LeafType,
		).Scan(&storedEventID, &storedHash)
	} else {
		// No correlation key at all — cannot classify; treat as ACCEPTED.
		return models.LeafReceiptAccepted, nil
	}

	if queryErr == sql.ErrNoRows {
		// No existing row — this leaf is genuinely new.
		return models.LeafReceiptAccepted, nil
	}
	if queryErr != nil {
		return "", fmt.Errorf("classify leaf: %w", queryErr)
	}

	// Existing row found — compare source_event_id.
	if storedEventID.Valid && storedEventID.String == leaf.SourceEventID {
		// Same event delivered twice — Kafka at-least-once re-delivery.
		return models.LeafReceiptDuplicate, nil
	}

	// Different event_id owns this leaf slot — conflict.
	return models.LeafReceiptConflict, nil
}

// GetReceiptsForIntent returns all receipt rows for a given intent, ordered
// oldest-first. Used by auditors and the dispute export path.
func (r *PostgresLeafReceiptRepo) GetReceiptsForIntent(ctx context.Context, tenantID, intentID string) ([]models.LeafReceipt, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT receipt_id, tenant_id, scope_type, scope_ref,
		       leaf_type, leaf_hash, source_topic, source_event_id,
		       trace_id, schema_version, event_version,
		       amount_minor, currency, client_reference, bank_reference,
		       receipt_status, discard_reason, received_at
		FROM evidence_leaf_receipts
		WHERE tenant_id = $1 AND scope_type = 'intent' AND scope_ref = $2
		ORDER BY received_at ASC`,
		tenantID, intentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanReceipts(rows)
}

// GetConflictsForIntent returns only CONFLICT-outcome receipts for a given intent.
// Used by monitoring and the verify path to surface data quality issues.
func (r *PostgresLeafReceiptRepo) GetConflictsForIntent(ctx context.Context, tenantID, intentID string) ([]models.LeafReceipt, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT receipt_id, tenant_id, scope_type, scope_ref,
		       leaf_type, leaf_hash, source_topic, source_event_id,
		       trace_id, schema_version, event_version,
		       amount_minor, currency, client_reference, bank_reference,
		       receipt_status, discard_reason, received_at
		FROM evidence_leaf_receipts
		WHERE tenant_id = $1 AND scope_type = 'intent' AND scope_ref = $2 AND receipt_status = 'CONFLICT'
		ORDER BY received_at ASC`,
		tenantID, intentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanReceipts(rows)
}

func scanReceipts(rows *sql.Rows) ([]models.LeafReceipt, error) {
	var receipts []models.LeafReceipt
	for rows.Next() {
		var r models.LeafReceipt
		var receivedAt time.Time
		if err := rows.Scan(
			&r.ReceiptID, &r.TenantID, &r.ScopeType, &r.ScopeRef,
			&r.LeafType, &r.LeafHash, &r.SourceTopic, &r.SourceEventID,
			&r.TraceID, &r.SchemaVersion, &r.EventVersion,
			&r.AmountMinor, &r.Currency, &r.ClientReference, &r.BankReference,
			&r.ReceiptStatus, &r.DiscardReason, &receivedAt,
		); err != nil {
			return nil, err
		}
		r.ReceivedAt = receivedAt
		receipts = append(receipts, r)
	}
	return receipts, rows.Err()
}
