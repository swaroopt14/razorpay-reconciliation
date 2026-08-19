package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type intentEventOutcome string

const (
	intentEventAccepted   intentEventOutcome = "accepted"
	intentEventDeduped    intentEventOutcome = "deduped"
	intentEventConflicted intentEventOutcome = "conflicted"
)

// acceptIntentEvent is the OUT-04 Kafka consume gate.
// Same event_id + same payload_hash: dedupe, original intent unchanged.
// Same event_id + different hash, or an already-accepted intent with
// different content: CONFLICTED, original intent unchanged.
// Transient DB errors are returned so Kafka retries (OUT-02).
func acceptIntentEvent(
	ctx context.Context,
	event models.IntentOutboxEvent,
	intent models.CanonicalIntent,
	payloadHash string,
) (intentEventOutcome, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("event_receipts begin: %w", err)
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		INSERT INTO event_receipts (
			event_id, tenant_id, event_type, schema_version,
			payload_hash, intent_id, trace_id, processing_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (event_id) DO NOTHING`,
		event.EventID, event.TenantID, event.EventType, event.SchemaVersion,
		payloadHash, intent.IntentID.String(), nullableTrace(event.TraceID),
		models.EventReceiptProcessed,
	)
	if err != nil {
		return "", fmt.Errorf("event_receipts insert: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("event_receipts rows: %w", err)
	}

	if n == 0 {
		outcome, err := handleExistingReceipt(ctx, tx, event.EventID, payloadHash)
		if err != nil {
			return "", err
		}
		if err := tx.Commit(); err != nil {
			return "", fmt.Errorf("event_receipts commit: %w", err)
		}
		return outcome, nil
	}

	ins, err := insertCanonicalIntent(ctx, tx, intent)
	if err != nil {
		return "", fmt.Errorf("canonical_intents insert: %w", err)
	}
	inserted, err := ins.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("canonical_intents rows: %w", err)
	}
	if inserted == 0 {
		same, err := existingIntentMatches(ctx, tx, intent)
		if err != nil {
			return "", err
		}
		if !same {
			if err := markReceiptConflicted(ctx, tx, event.EventID, payloadHash, models.EventConflictIntentMutation); err != nil {
				return "", err
			}
			if err := tx.Commit(); err != nil {
				return "", fmt.Errorf("event_receipts commit: %w", err)
			}
			return intentEventConflicted, nil
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("event_receipts commit: %w", err)
	}
	if inserted == 0 {
		return intentEventDeduped, nil
	}
	return intentEventAccepted, nil
}

func handleExistingReceipt(ctx context.Context, tx *sql.Tx, eventID, payloadHash string) (intentEventOutcome, error) {
	var storedHash, status string
	err := tx.QueryRowContext(ctx, `
		SELECT payload_hash, processing_status
		FROM event_receipts
		WHERE event_id = $1
		FOR UPDATE`,
		eventID,
	).Scan(&storedHash, &status)
	if err != nil {
		return "", fmt.Errorf("event_receipts lookup: %w", err)
	}
	if storedHash == payloadHash {
		return intentEventDeduped, nil
	}
	if err := markReceiptConflicted(ctx, tx, eventID, payloadHash, models.EventConflictPayloadHashMismatch); err != nil {
		return "", err
	}
	return intentEventConflicted, nil
}

func markReceiptConflicted(ctx context.Context, tx *sql.Tx, eventID, incomingHash, reason string) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE event_receipts
		SET processing_status = $1,
		    incoming_payload_hash = $2,
		    conflict_reason = $3,
		    updated_at = now()
		WHERE event_id = $4`,
		models.EventReceiptConflicted, incomingHash, reason, eventID,
	)
	if err != nil {
		return fmt.Errorf("event_receipts conflict update: %w", err)
	}
	log.Printf("event_receipts.conflicted event_id=%s reason=%s incoming_hash=%s", eventID, reason, incomingHash)
	return nil
}

func existingIntentMatches(ctx context.Context, tx *sql.Tx, incoming models.CanonicalIntent) (bool, error) {
	var (
		tenantID       uuid.UUID
		traceID        uuid.NullUUID
		contractID     uuid.NullUUID
		payoutRef      sql.NullString
		batchRef       sql.NullString
		bizKey         sql.NullString
		amount         decimal.Decimal
		currency       string
		execAt         sql.NullTime
		payoutType     sql.NullString
		provider       sql.NullString
		corridor       sql.NullString
		proof          float64
		matchability   float64
		canonHash      string
		gov            string
		rowNum         sql.NullInt64
	)
	err := tx.QueryRowContext(ctx, `
		SELECT tenant_id, trace_id, contract_id,
		       client_payout_ref, client_batch_ref, business_idempotency_key,
		       amount, currency_code, intended_execution_at,
		       payout_type, provider_hint, corridor,
		       proof_readiness_score, matchability_score,
		       canonical_hash, governance_state, source_row_num
		FROM canonical_intents
		WHERE intent_id = $1
		FOR UPDATE`,
		incoming.IntentID,
	).Scan(
		&tenantID, &traceID, &contractID,
		&payoutRef, &batchRef, &bizKey,
		&amount, &currency, &execAt,
		&payoutType, &provider, &corridor,
		&proof, &matchability,
		&canonHash, &gov, &rowNum,
	)
	if err == sql.ErrNoRows {
		return false, fmt.Errorf("canonical_intents missing after conflict-do-nothing intent_id=%s", incoming.IntentID)
	}
	if err != nil {
		return false, fmt.Errorf("canonical_intents lookup: %w", err)
	}

	if tenantID != incoming.TenantID {
		return false, nil
	}
	if !uuidEq(contractID, incoming.ContractID) {
		return false, nil
	}
	if !amount.Equal(incoming.Amount) || currency != incoming.CurrencyCode {
		return false, nil
	}
	if canonHash != incoming.CanonicalHash || gov != incoming.GovernanceState {
		return false, nil
	}
	if !scoreEq(proof, incoming.ProofReadinessScore) || !scoreEq(matchability, incoming.MatchabilityScore) {
		return false, nil
	}
	if !uuidPtrEq(traceID, incoming.TraceID) {
		return false, nil
	}
	if !nullStringEq(payoutRef, incoming.ClientPayoutRef) ||
		!nullStringEq(batchRef, incoming.ClientBatchRef) ||
		!nullStringEq(bizKey, incoming.BusinessIdempotencyKey) ||
		!nullStringEq(payoutType, incoming.PayoutType) ||
		!nullStringEq(provider, incoming.ProviderHint) ||
		!nullStringEq(corridor, incoming.Corridor) {
		return false, nil
	}
	if !nullTimeEq(execAt, incoming.IntendedExecutionAt) {
		return false, nil
	}
	if !nullIntEq(rowNum, incoming.SourceRowNum) {
		return false, nil
	}
	return true, nil
}

func scoreEq(a, b float64) bool {
	return fmt.Sprintf("%.4f", a) == fmt.Sprintf("%.4f", b)
}

func uuidPtrEq(stored uuid.NullUUID, incoming *uuid.UUID) bool {
	if incoming == nil {
		return !stored.Valid || stored.UUID == uuid.Nil
	}
	return uuidEq(stored, *incoming)
}

func uuidEq(stored uuid.NullUUID, incoming uuid.UUID) bool {
	if !stored.Valid || stored.UUID == uuid.Nil {
		return incoming == uuid.Nil
	}
	return stored.UUID == incoming
}

func nullStringEq(stored sql.NullString, incoming *string) bool {
	if !stored.Valid || stored.String == "" {
		return incoming == nil || *incoming == ""
	}
	return incoming != nil && stored.String == *incoming
}

func nullTimeEq(stored sql.NullTime, incoming *time.Time) bool {
	if !stored.Valid {
		return incoming == nil
	}
	if incoming == nil {
		return false
	}
	return stored.Time.UTC().Equal(incoming.UTC())
}

func nullIntEq(stored sql.NullInt64, incoming *int) bool {
	if !stored.Valid {
		return incoming == nil
	}
	return incoming != nil && stored.Int64 == int64(*incoming)
}

func nullableTrace(traceID string) interface{} {
	if strings.TrimSpace(traceID) == "" {
		return nil
	}
	return traceID
}
