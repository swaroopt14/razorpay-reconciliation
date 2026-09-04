package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
	"zord-relay/model"
)

// DispatchRepo handles all reads and writes to the dispatches table.
// All mutating methods accept *sql.Tx — callers own the transaction boundary.
type DispatchRepo struct {
	db *sql.DB
}

func NewDispatchRepo(db *sql.DB) *DispatchRepo {
	return &DispatchRepo{db: db}
}

// FindByContractAndAttempt is the idempotency check for Step 1.
// If a row exists, the existing dispatch_id is reused — never re-minted.
// Returns the dispatch including payload_json for use in retry flows.
func (r *DispatchRepo) FindByContractAndAttempt(ctx context.Context, contractID string, attemptCount int) (*model.Dispatch, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			dispatch_id, contract_id, intent_id, tenant_id, trace_id,
			connector_id, corridor_id, attempt_count, status,
			provider_idempotency_key, correlation_carriers_json, payload_json,
			dispatch_governance_decision, retry_class,
			provider_attempt_id, provider_response_status,
			created_at, updated_at, sent_at, acked_at
		FROM dispatches
		WHERE contract_id = $1 AND attempt_count = $2
		LIMIT 1
	`, contractID, attemptCount)

	var d model.Dispatch
	var corridorID sql.NullString
	var governanceDecision, retryClass sql.NullString
	var providerAttemptID, providerResponseStatus sql.NullString
	var carriersJSON, payloadJSON []byte
	var sentAt, ackedAt sql.NullTime

	err := row.Scan(
		&d.DispatchID, &d.ContractID, &d.IntentID, &d.TenantID, &d.TraceID,
		&d.ConnectorID, &corridorID, &d.AttemptCount, &d.Status,
		&d.ProviderIdempotencyKey, &carriersJSON, &payloadJSON,
		&governanceDecision, &retryClass,
		&providerAttemptID, &providerResponseStatus,
		&d.CreatedAt, &d.UpdatedAt, &sentAt, &ackedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("dispatch_repo: find by contract and attempt: %w", err)
	}

	if corridorID.Valid {
		d.CorridorID = corridorID.String
	}
	if len(carriersJSON) > 0 {
		d.CorrelationCarriersJSON = carriersJSON
	}
	if len(payloadJSON) > 0 {
		d.PayloadJSON = payloadJSON
	}
	if governanceDecision.Valid {
		d.DispatchGovernanceDecision = &governanceDecision.String
	}
	if retryClass.Valid {
		rc := retryClass.String
		d.RetryClass = &rc
	}
	if providerAttemptID.Valid {
		d.ProviderAttemptID = &providerAttemptID.String
	}
	if providerResponseStatus.Valid {
		d.ProviderResponseStatus = &providerResponseStatus.String
	}
	if sentAt.Valid {
		d.SentAt = &sentAt.Time
	}
	if ackedAt.Valid {
		d.AckedAt = &ackedAt.Time
	}
	return &d, nil
}

// InsertTx inserts a new dispatch row atomically with DispatchCreated (Step 1).
// payloadJSON is the raw OutboxPayload from the Kafka message — stored so the
// retry sweeper can re-run Steps 2–5 without the original message.
// No PII is stored here — only token IDs.
func (r *DispatchRepo) InsertTx(ctx context.Context, tx *sql.Tx, d *model.Dispatch, payloadJSON json.RawMessage) error {
	carriers := d.CorrelationCarriersJSON
	if len(carriers) == 0 {
		carriers = json.RawMessage("{}")
	}
	if len(payloadJSON) == 0 {
		payloadJSON = json.RawMessage("{}")
	}
	now := time.Now().UTC()
	_, err := tx.ExecContext(ctx, `
		INSERT INTO dispatches (
			dispatch_id, contract_id, intent_id, tenant_id, trace_id,
			connector_id, corridor_id, attempt_count, status,
			provider_idempotency_key, correlation_carriers_json, payload_json,
			created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
	`,
		d.DispatchID, d.ContractID, d.IntentID, d.TenantID, d.TraceID,
		d.ConnectorID, d.CorridorID, d.AttemptCount, string(d.Status),
		d.ProviderIdempotencyKey, carriers, payloadJSON, now,
	)
	if err != nil {
		return fmt.Errorf("dispatch_repo: insert: %w", err)
	}
	return nil
}

// MarkGovernanceDecisionTx records the governance evaluation result (Step 1.5).
// Only updates rows in PENDING status — prevents overwriting a row that has
// already advanced (e.g. a concurrent retry that reached SENT).
func (r *DispatchRepo) MarkGovernanceDecisionTx(ctx context.Context, tx *sql.Tx, dispatchID string, decision model.GovernanceDecision, reasonCodes []string) error {
	reasonJSON, err := json.Marshal(reasonCodes)
	if err != nil {
		return fmt.Errorf("dispatch_repo: marshal reason codes: %w", err)
	}
	newStatus := model.DispatchStatusPending
	switch decision {
	case model.GovernanceHold:
		newStatus = model.DispatchStatusHeld
	case model.GovernanceTerminalFail:
		newStatus = model.DispatchStatusFailedTerminal
	case model.GovernanceManualReview:
		newStatus = model.DispatchStatusRequiresManualReview
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET dispatch_governance_decision = $1,
		    dispatch_governance_reason_codes = $2,
		    status = $3,
		    updated_at = now()
		WHERE dispatch_id = $4
		  AND status = 'PENDING'
	`, string(decision), reasonJSON, string(newStatus), dispatchID)
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark governance decision: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Row was not in PENDING — likely already advanced by a concurrent path.
		// This is safe to ignore — the more recent status takes precedence.
		return nil
	}
	return nil
}

// MarkSentTx transitions dispatch to SENT atomically with AttemptSent (Step 3).
// Accepts PENDING or FAILED_RETRYABLE so that retry sweeper can also use this method.
func (r *DispatchRepo) MarkSentTx(ctx context.Context, tx *sql.Tx, dispatchID, providerIdempotencyKey, fingerprint string) error {
	res, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET status = 'SENT',
		    sent_at = now(),
		    updated_at = now(),
		    provider_idempotency_key = $2,
		    provider_request_fingerprint = $3
		WHERE dispatch_id = $1
		  AND status IN ('PENDING', 'FAILED_RETRYABLE')
	`, dispatchID, providerIdempotencyKey, fingerprint)
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark sent: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("dispatch_repo: mark sent: no row updated for dispatch_id=%s", dispatchID)
	}
	return nil
}

// MarkProviderAckedTx transitions dispatch to PROVIDER_ACKED (Step 5).
func (r *DispatchRepo) MarkProviderAckedTx(ctx context.Context, tx *sql.Tx, dispatchID, providerAttemptID, providerResponseStatus string) error {
	res, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET status = 'PROVIDER_ACKED',
		    provider_attempt_id = $2,
		    provider_response_status = $3,
		    acked_at = now(),
		    updated_at = now()
		WHERE dispatch_id = $1
		  AND status = 'SENT'
	`, dispatchID, providerAttemptID, providerResponseStatus)
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark provider acked: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("dispatch_repo: mark provider acked: no row updated for dispatch_id=%s", dispatchID)
	}
	return nil
}

// MarkAwaitingProviderSignalTx transitions dispatch when PSP call is uncertain.
// PSP timeout does NOT mean failure — money may have already moved.
// Never retry from this state without querying the PSP first.
func (r *DispatchRepo) MarkAwaitingProviderSignalTx(ctx context.Context, tx *sql.Tx, dispatchID string) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET status = 'AWAITING_PROVIDER_SIGNAL',
		    retry_class = $2,
		    updated_at = now()
		WHERE dispatch_id = $1
	`, dispatchID, string(model.RetryClassWaitForSignal))
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark awaiting signal: %w", err)
	}
	return nil
}

// MarkFailedRetryableTx transitions dispatch to FAILED_RETRYABLE with a retry schedule.
// Service 4 owns retry scheduling entirely after Step 1. Service 2 is never involved.
func (r *DispatchRepo) MarkFailedRetryableTx(ctx context.Context, tx *sql.Tx, dispatchID, retryClass string, nextAttemptAt time.Time) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET status = 'FAILED_RETRYABLE',
		    retry_class = $2,
		    next_dispatch_attempt_at = $3,
		    updated_at = now()
		WHERE dispatch_id = $1
	`, dispatchID, retryClass, nextAttemptAt)
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark failed retryable: %w", err)
	}
	return nil
}

// MarkFailedTerminalTx transitions dispatch to FAILED_TERMINAL. No further retries.
func (r *DispatchRepo) MarkFailedTerminalTx(ctx context.Context, tx *sql.Tx, dispatchID string) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE dispatches
		SET status = 'FAILED_TERMINAL',
		    retry_class = $2,
		    updated_at = now()
		WHERE dispatch_id = $1
	`, dispatchID, string(model.RetryClassNeverRetry))
	if err != nil {
		return fmt.Errorf("dispatch_repo: mark failed terminal: %w", err)
	}
	return nil
}

// FindRetryable returns dispatches eligible for retry: status = FAILED_RETRYABLE
// with next_dispatch_attempt_at <= now(). Used by the retry sweeper.
// Returns dispatches including payload_json so Steps 2–5 can be re-run.
func (r *DispatchRepo) FindRetryable(ctx context.Context, limit int) ([]model.Dispatch, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			dispatch_id, contract_id, intent_id, tenant_id, trace_id,
			connector_id, corridor_id, attempt_count, status,
			provider_idempotency_key, correlation_carriers_json, payload_json,
			dispatch_governance_decision, retry_class,
			provider_attempt_id, provider_response_status,
			created_at, updated_at, sent_at, acked_at
		FROM dispatches
		WHERE status = 'FAILED_RETRYABLE'
		  AND next_dispatch_attempt_at IS NOT NULL
		  AND next_dispatch_attempt_at <= now()
		ORDER BY next_dispatch_attempt_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("dispatch_repo: find retryable: %w", err)
	}
	defer rows.Close()

	var dispatches []model.Dispatch
	for rows.Next() {
		var d model.Dispatch
		var corridorID sql.NullString
		var governanceDecision, retryClass sql.NullString
		var providerAttemptID, providerResponseStatus sql.NullString
		var carriersJSON, payloadJSON []byte
		var sentAt, ackedAt sql.NullTime

		if err := rows.Scan(
			&d.DispatchID, &d.ContractID, &d.IntentID, &d.TenantID, &d.TraceID,
			&d.ConnectorID, &corridorID, &d.AttemptCount, &d.Status,
			&d.ProviderIdempotencyKey, &carriersJSON, &payloadJSON,
			&governanceDecision, &retryClass,
			&providerAttemptID, &providerResponseStatus,
			&d.CreatedAt, &d.UpdatedAt, &sentAt, &ackedAt,
		); err != nil {
			return nil, fmt.Errorf("dispatch_repo: scan retryable: %w", err)
		}

		if corridorID.Valid {
			d.CorridorID = corridorID.String
		}
		if len(carriersJSON) > 0 {
			d.CorrelationCarriersJSON = carriersJSON
		}
		if len(payloadJSON) > 0 {
			d.PayloadJSON = payloadJSON
		}
		if governanceDecision.Valid {
			d.DispatchGovernanceDecision = &governanceDecision.String
		}
		if retryClass.Valid {
			rc := retryClass.String
			d.RetryClass = &rc
		}
		if providerAttemptID.Valid {
			d.ProviderAttemptID = &providerAttemptID.String
		}
		if providerResponseStatus.Valid {
			d.ProviderResponseStatus = &providerResponseStatus.String
		}
		if sentAt.Valid {
			d.SentAt = &sentAt.Time
		}
		if ackedAt.Valid {
			d.AckedAt = &ackedAt.Time
		}

		dispatches = append(dispatches, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("dispatch_repo: rows error: %w", err)
	}
	return dispatches, nil
}