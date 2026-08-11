package persistence

// event_receipt_repo.go — the event_receipts idempotency gate (refactor Phase 1).
//
// PROCESSING PATTERN (clarification doc §2):
//
//	BEGIN
//	 1. claim receipt row (INSERT .. ON CONFLICT DO UPDATE attempt_count+1, row locked)
//	 2. if already PROCESSED → commit (records the redelivery attempt), skip event
//	 3. run all projection counter writes on the SAME transaction (ambient tx ctx)
//	 4. mark receipt PROCESSED
//	COMMIT
//
//	handler failure → ROLLBACK, then record FAILED + error on a separate
//	connection so the failure survives the rollback. Kafka offset is still
//	committed by the consumer (no poison loop) — FAILED receipts are the
//	V1 quarantine/retry queue (team decision: no DLQ topic).
//
// A payload_hash mismatch on a duplicate event_id is persisted to
// event_receipt_conflicts (corrective-action-report P0-03) and the receipt
// is marked CONFLICTED — a terminal state until an operator resolves it.
// Neither the first-seen nor the conflicting payload's handler runs again
// once a conflict is recorded (same event id must always carry the same
// payload).

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrEventAlreadyProcessed is the internal sentinel returned by RunOnce's fn
// path when the event was already handled (receipt PROCESSED or legacy
// processed_events hit). RunOnce commits the attempt bump and reports the
// skip to the caller via (skipped=true, err=nil).
var ErrEventAlreadyProcessed = errors.New("event already processed")

// maxTxAttempts bounds retries of a whole claim+fn+commit attempt when it
// fails on a transient Postgres error (deadlock/serialization). Deadlocks are
// an expected, normal outcome of concurrent writers touching shared
// tenant/batch aggregate rows — Postgres always aborts exactly one side of
// the cycle, and the standard remedy is to retry that transaction from
// scratch (the earlier rollback already undid its writes). Non-transient
// errors are not retried and fall straight through to markFailed.
const maxTxAttempts = 4

// isRetryableTxError reports whether err is a Postgres deadlock
// (40P01) or serialization failure (40001) — both safe/expected to retry.
func isRetryableTxError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "40P01", "40001":
			return true
		}
	}
	return false
}

// EventMeta identifies one Kafka event for the receipts ledger.
type EventMeta struct {
	TenantID     string
	EventSource  string // origin service; defaults applied by callers
	SourceTopic  string // Kafka topic name — transport identity (P1-01)
	EventType    string // domain event type from the envelope payload; falls back to SourceTopic when absent
	EventVersion string // from envelope; "legacy" when upstream doesn't send it yet
	EventID      string
	PayloadHash  string // sha256 hex over raw message bytes, computed by ZPI
	ScopeType    string // optional: BATCH/INTENT/... when cheaply known
	ScopeRef     string
	TraceID      string // required event-contract field (clarification doc §13); "" when upstream omits it
}

// EventReceiptRepo manages event_receipts rows and the per-event transaction.
type EventReceiptRepo struct {
	pool                 *pgxpool.Pool
	leaseOwner           string // this process's identity, stamped on every claim (P1-03)
	leaseDurationSeconds int
}

// NewEventReceiptRepo creates an EventReceiptRepo. leaseOwner identifies this
// process instance (e.g. hostname-pid-uuid) for stuck-receipt diagnostics;
// leaseDuration bounds how long a claim is considered live before
// SweepStaleLeases treats it as stale (P1-03).
func NewEventReceiptRepo(pool *pgxpool.Pool, leaseOwner string, leaseDuration time.Duration) *EventReceiptRepo {
	return &EventReceiptRepo{pool: pool, leaseOwner: leaseOwner, leaseDurationSeconds: int(leaseDuration.Seconds())}
}

// RunOnce executes fn exactly once per event inside a single transaction.
//
//	skipped=true  → event was a duplicate; fn did not run (or returned the
//	                ErrEventAlreadyProcessed sentinel from a legacy-dedup hit).
//	err != nil    → fn failed; everything rolled back; receipt marked FAILED.
//
// fn receives a context carrying the transaction — every ProjectionRepo /
// BatchContractRepo call made with it joins the transaction automatically.
// Post-commit work (snapshots, ML, policy) must use the ORIGINAL context.
func (r *EventReceiptRepo) RunOnce(
	ctx context.Context,
	m EventMeta,
	fn func(txCtx context.Context) error,
) (skipped bool, err error) {
	// Events without identity cannot be deduplicated — preserve legacy
	// behavior (handlers validate and log these; counters are not written).
	if m.TenantID == "" || m.EventID == "" {
		return false, fn(ctx)
	}
	if m.EventSource == "" {
		m.EventSource = "unknown"
	}
	if m.EventVersion == "" {
		m.EventVersion = "legacy"
	}
	if m.SourceTopic == "" {
		m.SourceTopic = "unknown"
	}
	// INTEL-04 defense-in-depth: the primary enforcement point is the
	// ingestion-time gate in kafka/consumer.go (which rejects a missing
	// trace_id on any non-exempt topic before RunOnce is ever called), so in
	// the normal Kafka path m.TraceID is never empty here. This default only
	// protects a hypothetical future non-Kafka caller that constructs
	// EventMeta directly and forgets to set TraceID — it stores an explicit
	// sentinel rather than letting the column go to NULL.
	if m.TraceID == "" {
		m.TraceID = "unknown"
	}

	var lastErr error
	for attempt := 1; attempt <= maxTxAttempts; attempt++ {
		skipped, retryable, runErr := r.runOnceAttempt(ctx, m, fn)
		if runErr == nil {
			return skipped, nil
		}
		lastErr = runErr
		if !retryable || attempt == maxTxAttempts {
			break
		}
		log.Printf("event_receipts: transient tx error, retrying tenant=%s event_id=%s attempt=%d/%d: %v",
			m.TenantID, m.EventID, attempt, maxTxAttempts, runErr)
		time.Sleep(time.Duration(attempt*attempt) * 10 * time.Millisecond) // 10ms, 40ms, 90ms
	}
	r.markFailed(ctx, m, lastErr)
	return false, lastErr
}

// runOnceAttempt is a single claim+fn+commit attempt. retryable reports
// whether the failure is a transient Postgres deadlock/serialization error
// worth retrying from scratch; RunOnce owns markFailed so it's only written
// once, after retries are exhausted.
func (r *EventReceiptRepo) runOnceAttempt(
	ctx context.Context,
	m EventMeta,
	fn func(txCtx context.Context) error,
) (skipped bool, retryable bool, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, false, fmt.Errorf("event_receipt_repo.RunOnce begin: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	// ── Step 1: claim the receipt row (locks it for this tx) ─────────────────
	// ON CONFLICT bumps attempt_count and leaves processing_status unchanged,
	// so RETURNING tells us the pre-existing status. Concurrent deliveries of
	// the same event serialize on this row lock.
	var status string
	var storedHash *string
	var receivedAt time.Time
	var storedEventType, storedEventVersion string
	var attemptCount int
	var leaseOwner *string
	var processingStartedAt *time.Time
	// P1-03: stamp lease fields on every claim. The ON CONFLICT branch keeps
	// the prior lease fields untouched for an already-terminal row (a
	// duplicate delivery of a PROCESSED/CONFLICTED event should not look
	// like a live in-flight claim to SweepStaleLeases or the alert below).
	claimSQL := `
		INSERT INTO event_receipts
			(tenant_id, event_source, source_topic, event_type, event_version, event_id,
			 payload_hash, scope_type, scope_ref, trace_id, processing_status, attempt_count,
			 processing_started_at, lease_owner, lease_expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), NULLIF($12,''),
		        'PROCESSING', 1, now(), $10, now() + ($11 * INTERVAL '1 second'))
		ON CONFLICT (tenant_id, event_source, event_id) DO UPDATE
			SET attempt_count = event_receipts.attempt_count + 1,
			    processing_started_at = CASE WHEN event_receipts.processing_status IN ('PROCESSED','CONFLICTED')
			                                  THEN event_receipts.processing_started_at ELSE now() END,
			    lease_owner            = CASE WHEN event_receipts.processing_status IN ('PROCESSED','CONFLICTED')
			                                  THEN event_receipts.lease_owner ELSE $10 END,
			    lease_expires_at       = CASE WHEN event_receipts.processing_status IN ('PROCESSED','CONFLICTED')
			                                  THEN event_receipts.lease_expires_at ELSE now() + ($11 * INTERVAL '1 second') END
		RETURNING processing_status, payload_hash, received_at, event_type, event_version,
		          attempt_count, lease_owner, processing_started_at
	`
	if err := tx.QueryRow(ctx, claimSQL,
		m.TenantID, m.EventSource, m.SourceTopic, m.EventType, m.EventVersion, m.EventID,
		m.PayloadHash, m.ScopeType, m.ScopeRef, r.leaseOwner, r.leaseDurationSeconds, m.TraceID,
	).Scan(&status, &storedHash, &receivedAt, &storedEventType, &storedEventVersion,
		&attemptCount, &leaseOwner, &processingStartedAt); err != nil {
		return false, isRetryableTxError(err), fmt.Errorf("event_receipt_repo.RunOnce claim event_id=%s: %w", m.EventID, err)
	}

	// P1-03: operational alert at the point of detection. Under this
	// codebase's single-transaction claim→work→mark design (see file header)
	// a committed PROCESSING row is not reachable via any current production
	// path — this branch exists so that if one is ever observed (a future
	// bug, a manual DB edit, or the synthetic scenario in
	// event_receipt_lease_p1_03_test.go), it is surfaced immediately rather
	// than only on the next periodic sweep.
	if status == "PROCESSING" && attemptCount > 1 {
		stuckFor := "unknown"
		if processingStartedAt != nil {
			stuckFor = time.Since(*processingStartedAt).String()
		}
		ownerStr := "unknown"
		if leaseOwner != nil {
			ownerStr = *leaseOwner
		}
		log.Printf("event_receipts: WARNING in-flight/stale PROCESSING claim observed tenant=%s source=%s event_id=%s lease_owner=%s stuck_for=%s attempt=%d",
			m.TenantID, m.EventSource, m.EventID, ownerStr, stuckFor, attemptCount)
	}

	// Conflict: same event identity, different payload bytes. Persist it as
	// a queryable, blocking incident (corrective-action-report P0-03) rather
	// than only logging — the first-seen payload's effects (if any) are left
	// untouched, but this event id is never processed again until an
	// operator resolves event_receipt_conflicts.
	if storedHash != nil && *storedHash != "" && m.PayloadHash != "" && *storedHash != m.PayloadHash {
		if err := r.recordConflict(ctx, tx, m, *storedHash, storedEventType, storedEventVersion, receivedAt); err != nil {
			return false, isRetryableTxError(err), err
		}
		if err := tx.Commit(ctx); err != nil {
			return true, isRetryableTxError(err), fmt.Errorf("event_receipt_repo.RunOnce commit conflict event_id=%s: %w", m.EventID, err)
		}
		committed = true
		log.Printf("event_receipts: ALERT payload hash conflict tenant=%s source=%s event_id=%s stored=%s incoming=%s — event_receipt_conflicts row recorded, event NOT processed",
			m.TenantID, m.EventSource, m.EventID, *storedHash, m.PayloadHash)
		return true, false, nil
	}

	if status == "PROCESSED" || status == "CONFLICTED" {
		// Duplicate delivery of an already-completed or already-conflicted
		// event — commit so the attempt bump is recorded, never rerun fn.
		if err := tx.Commit(ctx); err != nil {
			return true, isRetryableTxError(err), fmt.Errorf("event_receipt_repo.RunOnce commit duplicate event_id=%s: %w", m.EventID, err)
		}
		committed = true
		return true, false, nil
	}

	// ── Steps 2–3: run the handler's transactional section ───────────────────
	txCtx := ContextWithTx(ctx, tx)
	if fnErr := fn(txCtx); fnErr != nil {
		if errors.Is(fnErr, ErrEventAlreadyProcessed) {
			// Legacy dedup hit (processed_events row from before the receipts
			// cutover). Mark the receipt PROCESSED so future lookups stay in
			// the new table, and commit.
			if err := r.markProcessed(ctx, tx, m, "LEGACY_DEDUP"); err != nil {
				return true, isRetryableTxError(err), err
			}
			if err := tx.Commit(ctx); err != nil {
				return true, isRetryableTxError(err), fmt.Errorf("event_receipt_repo.RunOnce commit legacy-dedup event_id=%s: %w", m.EventID, err)
			}
			committed = true
			return true, false, nil
		}
		// Failure: roll back everything. A deadlock/serialization error is
		// reported retryable — RunOnce reruns this whole attempt from scratch
		// on a fresh transaction; the rollback already undid any partial
		// writes so that's safe. Non-retryable errors propagate to RunOnce's
		// markFailed unchanged.
		_ = tx.Rollback(ctx)
		committed = true // rollback done; disable deferred rollback
		return false, isRetryableTxError(fnErr), fnErr
	}

	// ── Step 4: mark PROCESSED inside the same transaction ───────────────────
	if err := r.markProcessed(ctx, tx, m, ""); err != nil {
		return false, isRetryableTxError(err), err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, isRetryableTxError(err), fmt.Errorf("event_receipt_repo.RunOnce commit event_id=%s: %w", m.EventID, err)
	}
	committed = true
	return false, false, nil
}

// recordConflict persists a payload-hash mismatch into event_receipt_conflicts
// and flips the receipt to CONFLICTED, both inside the caller's transaction.
// A redelivery of the same conflicting event id bumps occurrence_count/
// last_detected_at rather than creating a second incident row.
func (r *EventReceiptRepo) recordConflict(ctx context.Context, tx DBTX, m EventMeta, storedHash, storedEventType, storedEventVersion string, firstSeenAt time.Time) error {
	const conflictSQL = `
		INSERT INTO event_receipt_conflicts
			(tenant_id, event_source, event_id,
			 stored_payload_hash, incoming_payload_hash,
			 stored_event_type, incoming_event_type,
			 stored_event_version, incoming_event_version,
			 first_seen_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (tenant_id, event_source, event_id) DO UPDATE
			SET incoming_payload_hash  = EXCLUDED.incoming_payload_hash,
			    incoming_event_type    = EXCLUDED.incoming_event_type,
			    incoming_event_version = EXCLUDED.incoming_event_version,
			    last_detected_at       = now(),
			    occurrence_count       = event_receipt_conflicts.occurrence_count + 1
	`
	if _, err := tx.Exec(ctx, conflictSQL,
		m.TenantID, m.EventSource, m.EventID,
		storedHash, m.PayloadHash,
		storedEventType, m.EventType,
		storedEventVersion, m.EventVersion,
		firstSeenAt,
	); err != nil {
		return fmt.Errorf("event_receipt_repo.recordConflict event_id=%s: %w", m.EventID, err)
	}

	const markConflictedSQL = `
		UPDATE event_receipts
		SET processing_status = 'CONFLICTED',
		    lease_owner       = NULL,
		    lease_expires_at  = NULL
		WHERE tenant_id = $1 AND event_source = $2 AND event_id = $3
		  AND processing_status <> 'CONFLICTED'
	`
	if _, err := tx.Exec(ctx, markConflictedSQL, m.TenantID, m.EventSource, m.EventID); err != nil {
		return fmt.Errorf("event_receipt_repo.recordConflict mark event_id=%s: %w", m.EventID, err)
	}
	return nil
}

// markProcessed flips the claimed receipt to PROCESSED inside the event tx.
//
// DUAL-WRITE (clarification doc §4): for the migration window, every event
// marked PROCESSED here is ALSO written to the legacy processed_events table
// in the same transaction. This keeps the old table populated for the daily
// processed_events-vs-event_receipts comparison job and gives us a clean
// rollback path if event_receipts needs to be abandoned. Safe to remove once
// event_receipts is confirmed the sole idempotency gate (cutover step 5).
func (r *EventReceiptRepo) markProcessed(ctx context.Context, tx DBTX, m EventMeta, note string) error {
	sql := `
		UPDATE event_receipts
		SET processing_status = 'PROCESSED',
		    processed_at      = now(),
		    error_code        = NULLIF($4, ''),
		    error_detail      = NULL,
		    lease_owner       = NULL,
		    lease_expires_at  = NULL
		WHERE tenant_id = $1 AND event_source = $2 AND event_id = $3
	`
	if _, err := tx.Exec(ctx, sql, m.TenantID, m.EventSource, m.EventID, note); err != nil {
		return fmt.Errorf("event_receipt_repo.markProcessed event_id=%s: %w", m.EventID, err)
	}

	const legacyDualWriteSQL = `
		INSERT INTO processed_events (tenant_id, event_id)
		VALUES ($1, $2)
		ON CONFLICT (tenant_id, event_id) DO NOTHING
	`
	if _, err := tx.Exec(ctx, legacyDualWriteSQL, m.TenantID, m.EventID); err != nil {
		return fmt.Errorf("event_receipt_repo.markProcessed legacy dual-write event_id=%s: %w", m.EventID, err)
	}
	return nil
}

// markFailed records a handler failure on a separate connection (the event tx
// has already been rolled back, which also rolled back the claim row for
// first-time events — hence the upsert).
func (r *EventReceiptRepo) markFailed(ctx context.Context, m EventMeta, cause error) {
	detail := cause.Error()
	if len(detail) > 2000 {
		detail = detail[:2000]
	}
	sql := `
		INSERT INTO event_receipts
			(tenant_id, event_source, source_topic, event_type, event_version, event_id,
			 payload_hash, scope_type, scope_ref, trace_id,
			 processing_status, attempt_count, error_code, error_detail)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), NULLIF($11,''),
		        'FAILED', 1, 'HANDLER_ERROR', $10)
		ON CONFLICT (tenant_id, event_source, event_id) DO UPDATE
			SET processing_status = 'FAILED',
			    attempt_count     = event_receipts.attempt_count + 1,
			    error_code        = 'HANDLER_ERROR',
			    error_detail      = EXCLUDED.error_detail,
			    lease_owner       = NULL,
			    lease_expires_at  = NULL
	`
	// Best-effort with a short independent timeout: never let failure
	// bookkeeping block or crash the consumer loop.
	bgCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if _, err := r.pool.Exec(bgCtx, sql,
		m.TenantID, m.EventSource, m.SourceTopic, m.EventType, m.EventVersion, m.EventID,
		m.PayloadHash, m.ScopeType, m.ScopeRef, detail, m.TraceID,
	); err != nil {
		log.Printf("event_receipts: markFailed write failed tenant=%s event_id=%s: %v", m.TenantID, m.EventID, err)
	}
}

// SweepStaleLeases reclaims event_receipts rows stuck in PROCESSING whose
// lease has expired (corrective-action-report P1-03). As documented at the
// top of this file, no current production code path commits a row in
// PROCESSING — every commit goes straight to PROCESSED/CONFLICTED, and a
// failed attempt's rollback undoes the claim entirely. A row this query
// finds is therefore always anomalous (a future bug, a manual DB edit, or a
// genuinely different architecture down the line) and is logged as an ALERT.
//
// Reclaiming clears the lease fields and bumps attempt_count so the next
// redelivery of that event is visibly a retry, not treated as the first
// attempt. FOR UPDATE SKIP LOCKED means a row a live (slow) worker is still
// actually holding the transaction/lock for is left alone this cycle rather
// than raced.
func (r *EventReceiptRepo) SweepStaleLeases(ctx context.Context) (reclaimed int, err error) {
	const sweepSQL = `
		WITH stale AS (
			SELECT tenant_id, event_source, event_id, lease_owner, processing_started_at
			FROM event_receipts
			WHERE processing_status = 'PROCESSING' AND lease_expires_at < now()
			FOR UPDATE SKIP LOCKED
		)
		UPDATE event_receipts er
		SET lease_owner = NULL, lease_expires_at = NULL, attempt_count = attempt_count + 1
		FROM stale s
		WHERE er.tenant_id = s.tenant_id AND er.event_source = s.event_source AND er.event_id = s.event_id
		RETURNING er.tenant_id, er.event_source, er.event_id, s.lease_owner, s.processing_started_at
	`
	rows, err := r.pool.Query(ctx, sweepSQL)
	if err != nil {
		return 0, fmt.Errorf("event_receipt_repo.SweepStaleLeases: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var tenantID, source, eventID string
		var priorLeaseOwner *string
		var processingStartedAt *time.Time
		if scanErr := rows.Scan(&tenantID, &source, &eventID, &priorLeaseOwner, &processingStartedAt); scanErr != nil {
			return reclaimed, fmt.Errorf("event_receipt_repo.SweepStaleLeases scan: %w", scanErr)
		}
		ownerStr := "unknown"
		if priorLeaseOwner != nil {
			ownerStr = *priorLeaseOwner
		}
		stuckFor := "unknown"
		if processingStartedAt != nil {
			stuckFor = time.Since(*processingStartedAt).String()
		}
		log.Printf("event_receipts: ALERT stale PROCESSING lease reclaimed tenant=%s source=%s event_id=%s prior_lease_owner=%s stuck_for=%s",
			tenantID, source, eventID, ownerStr, stuckFor)
		reclaimed++
	}
	return reclaimed, rows.Err()
}

// EventReceiptTraceRow is one event_receipts row as returned by
// ListByTraceID — the read-side shape backing GET /v1/intelligence/trace/{trace_id}
// (INTEL-04 acceptance criterion: "dashboard metric can navigate to source
// event/trace").
type EventReceiptTraceRow struct {
	EventID          string
	EventType        string
	EventSource      string
	SourceTopic      string
	EventVersion     string
	ScopeType        *string
	ScopeRef         *string
	PayloadHash      *string
	ProcessingStatus string
	ReceivedAt       time.Time
	ProcessedAt      *time.Time
	ErrorCode        *string
	ErrorDetail      *string
}

// ListByTraceID returns every event_receipts row for (tenantID, traceID),
// ordered received_at ASC — earliest event first, so a caller can walk a
// trace in chronological order from the first event that carried this
// trace_id through to the last. tenantID is required and always part of the
// WHERE clause: every tenant-scoped query in this codebase is scoped this
// way (see e.g. PolicyRepo's P0-05 tenant-safe lookups) — this does not
// introduce the first unscoped-by-tenant read path.
func (r *EventReceiptRepo) ListByTraceID(ctx context.Context, tenantID, traceID string) ([]EventReceiptTraceRow, error) {
	const sql = `
		SELECT event_id, event_type, event_source, source_topic, event_version,
		       scope_type, scope_ref, payload_hash, processing_status,
		       received_at, processed_at, error_code, error_detail
		FROM event_receipts
		WHERE tenant_id = $1 AND trace_id = $2
		ORDER BY received_at ASC
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, traceID)
	if err != nil {
		return nil, fmt.Errorf("event_receipt_repo.ListByTraceID tenant=%s trace_id=%s: %w", tenantID, traceID, err)
	}
	defer rows.Close()

	var out []EventReceiptTraceRow
	for rows.Next() {
		var row EventReceiptTraceRow
		if err := rows.Scan(
			&row.EventID, &row.EventType, &row.EventSource, &row.SourceTopic, &row.EventVersion,
			&row.ScopeType, &row.ScopeRef, &row.PayloadHash, &row.ProcessingStatus,
			&row.ReceivedAt, &row.ProcessedAt, &row.ErrorCode, &row.ErrorDetail,
		); err != nil {
			return nil, fmt.Errorf("event_receipt_repo.ListByTraceID scan tenant=%s trace_id=%s: %w", tenantID, traceID, err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
