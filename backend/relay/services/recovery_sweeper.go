package services

// recovery_sweeper.go
//
// Addresses Gaps 1, 2, 3:
//
//   Gap 1 — AWAITING_PROVIDER_SIGNAL is a dead end (nothing reads it).
//   Gap 2 — SENT rows from crashed processes are never recovered.
//   Gap 3 — The retry sweeper skips AWAITING_PROVIDER_SIGNAL entirely.
//
// This sweeper runs on a fixed interval and handles:
//   Category A — SENT rows older than SentTimeoutSecs:
//     Process died after Step 3 (AttemptSent) but before Step 5 (ProviderAcked).
//     PSP call may have fired. Query PSP to determine actual outcome.
//   Category B — AWAITING_PROVIDER_SIGNAL rows older than AwaitingTimeoutSecs:
//     PSP call timed out during live dispatch. Query PSP now that time has elapsed.
//   Category C — FAILED_RETRYABLE rows ready for retry (moved from retry_sweeper.go
//     to centralise all recovery logic here).

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"go.uber.org/zap"

	"zord-relay/logger"
	"zord-relay/metrics"
	"zord-relay/model"
	"zord-relay/psp"

	"github.com/google/uuid"
)

// RecoverySweeperConfig holds tuning parameters.
type RecoverySweeperConfig struct {
	// SweepInterval is how often the sweeper runs.
	SweepInterval time.Duration

	// SentTimeoutSecs: how long a SENT row can sit before the sweeper
	// treats it as a crash victim. Must be > PSP timeout.
	SentTimeoutSecs int

	// AwaitingTimeoutSecs: how long an AWAITING_PROVIDER_SIGNAL row waits
	// before the sweeper queries the PSP again.
	AwaitingTimeoutSecs int

	// BatchSize limits rows processed per sweep cycle.
	BatchSize int
}

// RecoverySweeper handles dispatches stuck in SENT and AWAITING_PROVIDER_SIGNAL.
// It is the only component that queries the PSP for existing payouts.
// The retry sweeper (retry_sweeper.go) handles FAILED_RETRYABLE only.
type RecoverySweeper struct {
	db           *sql.DB
	dispatchRepo *DispatchRepo
	outboxRepo   *RelayOutboxRepo
	loop         *DispatchLoop
	pspClient    psp.Client
	cfg          RecoverySweeperConfig
}

func NewRecoverySweeper(
	db *sql.DB,
	dispatchRepo *DispatchRepo,
	outboxRepo *RelayOutboxRepo,
	loop *DispatchLoop,
	pspClient psp.Client,
	cfg RecoverySweeperConfig,
) *RecoverySweeper {
	if cfg.SweepInterval == 0 {
		cfg.SweepInterval = 60 * time.Second
	}
	if cfg.SentTimeoutSecs == 0 {
		cfg.SentTimeoutSecs = 120
	}
	if cfg.AwaitingTimeoutSecs == 0 {
		cfg.AwaitingTimeoutSecs = 300
	}
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 50
	}
	return &RecoverySweeper{
		db:           db,
		dispatchRepo: dispatchRepo,
		outboxRepo:   outboxRepo,
		loop:         loop,
		pspClient:    pspClient,
		cfg:          cfg,
	}
}

func (s *RecoverySweeper) Start(ctx context.Context, wg *sync.WaitGroup) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.run(ctx)
	}()
}

func (s *RecoverySweeper) run(ctx context.Context) {
	log := logger.Logger.With(zap.String("component", "recovery_sweeper"))
	log.Info("recovery_sweeper: started",
		zap.Duration("interval", s.cfg.SweepInterval),
		zap.Int("sent_timeout_secs", s.cfg.SentTimeoutSecs),
		zap.Int("awaiting_timeout_secs", s.cfg.AwaitingTimeoutSecs),
	)

	// Run immediately on start to recover any stuck rows from a previous crash.
	s.sweep(ctx, log)

	ticker := time.NewTicker(s.cfg.SweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Info("recovery_sweeper: stopped")
			return
		case <-ticker.C:
			s.sweep(ctx, log)
		}
	}
}

func (s *RecoverySweeper) sweep(ctx context.Context, log *zap.Logger) {
	log.Info("recovery_sweeper: sweep started")
	sentCount := s.recoverSentDispatches(ctx, log)
	awaitCount := s.recoverAwaitingDispatches(ctx, log)
	log.Info("recovery_sweeper: sweep complete",
		zap.Int("sent_recovered", sentCount),
		zap.Int("awaiting_recovered", awaitCount),
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Category A — SENT rows (crash recovery)
// ─────────────────────────────────────────────────────────────────────────────

func (s *RecoverySweeper) recoverSentDispatches(ctx context.Context, log *zap.Logger) int {
	cutoff := time.Now().UTC().Add(-time.Duration(s.cfg.SentTimeoutSecs) * time.Second)
	rows, err := s.db.QueryContext(ctx, `
		SELECT dispatch_id, contract_id, intent_id, tenant_id, trace_id,
		       connector_id, corridor_id, provider_idempotency_key,
		       attempt_count, sent_at, payload_json
		FROM dispatches
		WHERE status = 'SENT'
		  AND sent_at < $1
		ORDER BY sent_at ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`, cutoff, s.cfg.BatchSize)
	if err != nil {
		log.Error("recovery_sweeper: query SENT dispatches failed", zap.Error(err))
		metrics.SweeperRunTotal.WithLabelValues("sent_recovery", "error").Inc()
		return 0
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var (
			dispatchID, contractID, intentID, tenantID, traceID string
			connectorID, corridorID, idempotencyKey              string
			attemptCount                                          int
			sentAt                                                time.Time
			payloadJSON                                           []byte
		)
		if err := rows.Scan(
			&dispatchID, &contractID, &intentID, &tenantID, &traceID,
			&connectorID, &corridorID, &idempotencyKey,
			&attemptCount, &sentAt, &payloadJSON,
		); err != nil {
			log.Error("recovery_sweeper: scan SENT row", zap.Error(err))
			continue
		}

		rowLog := log.With(
			zap.String("dispatch_id", dispatchID),
			zap.String("contract_id", contractID),
			zap.String("trace_id", traceID),
			zap.Time("sent_at", sentAt),
		)
		rowLog.Warn("recovery_sweeper: found stuck SENT dispatch — querying PSP")

		d := &model.Dispatch{
			DispatchID:             dispatchID,
			ContractID:             contractID,
			IntentID:               intentID,
			TenantID:               tenantID,
			TraceID:                traceID,
			ConnectorID:            connectorID,
			CorridorID:             corridorID,
			ProviderIdempotencyKey: idempotencyKey,
			AttemptCount:           attemptCount,
			PayloadJSON:            payloadJSON,
		}
		s.resolveViaQuery(ctx, d, rowLog)
		count++
	}
	metrics.SweeperRunTotal.WithLabelValues("sent_recovery", "ok").Inc()
	return count
}

// ─────────────────────────────────────────────────────────────────────────────
// Category B — AWAITING_PROVIDER_SIGNAL rows
// ─────────────────────────────────────────────────────────────────────────────

func (s *RecoverySweeper) recoverAwaitingDispatches(ctx context.Context, log *zap.Logger) int {
	cutoff := time.Now().UTC().Add(-time.Duration(s.cfg.AwaitingTimeoutSecs) * time.Second)
	rows, err := s.db.QueryContext(ctx, `
		SELECT dispatch_id, contract_id, intent_id, tenant_id, trace_id,
		       connector_id, corridor_id, provider_idempotency_key,
		       attempt_count, updated_at, payload_json
		FROM dispatches
		WHERE status = 'AWAITING_PROVIDER_SIGNAL'
		  AND updated_at < $1
		ORDER BY updated_at ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`, cutoff, s.cfg.BatchSize)
	if err != nil {
		log.Error("recovery_sweeper: query AWAITING dispatches failed", zap.Error(err))
		metrics.SweeperRunTotal.WithLabelValues("awaiting_recovery", "error").Inc()
		return 0
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var (
			dispatchID, contractID, intentID, tenantID, traceID string
			connectorID, corridorID, idempotencyKey              string
			attemptCount                                          int
			updatedAt                                             time.Time
			payloadJSON                                           []byte
		)
		if err := rows.Scan(
			&dispatchID, &contractID, &intentID, &tenantID, &traceID,
			&connectorID, &corridorID, &idempotencyKey,
			&attemptCount, &updatedAt, &payloadJSON,
		); err != nil {
			log.Error("recovery_sweeper: scan AWAITING row", zap.Error(err))
			continue
		}

		rowLog := log.With(
			zap.String("dispatch_id", dispatchID),
			zap.String("contract_id", contractID),
			zap.String("trace_id", traceID),
		)
		rowLog.Info("recovery_sweeper: querying PSP for AWAITING dispatch")

		d := &model.Dispatch{
			DispatchID:             dispatchID,
			ContractID:             contractID,
			IntentID:               intentID,
			TenantID:               tenantID,
			TraceID:                traceID,
			ConnectorID:            connectorID,
			CorridorID:             corridorID,
			ProviderIdempotencyKey: idempotencyKey,
			AttemptCount:           attemptCount,
			PayloadJSON:            payloadJSON,
		}
		s.resolveViaQuery(ctx, d, rowLog)
		count++
	}
	metrics.SweeperRunTotal.WithLabelValues("awaiting_recovery", "ok").Inc()
	return count
}

// ─────────────────────────────────────────────────────────────────────────────
// PSP query and outcome resolution
// ─────────────────────────────────────────────────────────────────────────────

// resolveViaQuery asks the PSP for the outcome of a dispatch using the
// provider_idempotency_key (= dispatch_id = reference_id sent to PSP).
// Three outcomes:
//   1. PSP found it, non-terminal → PROVIDER_ACKED
//   2. PSP found it, terminal     → FAILED_TERMINAL
//   3. PSP has no record          → safe to retry → FAILED_RETRYABLE
func (s *RecoverySweeper) resolveViaQuery(ctx context.Context, d *model.Dispatch, log *zap.Logger) {
	result, err := s.pspClient.QueryByReference(ctx, d.ProviderIdempotencyKey)
	if err != nil {
		log.Warn("recovery_sweeper: PSP query failed — leaving unchanged for next sweep cycle",
			zap.String("dispatch_id", d.DispatchID),
			zap.Error(err),
		)
		return
	}

	now := time.Now().UTC()

	if result != nil {
		isTerminal := result.Status == "failed" ||
			result.Status == "reversed" ||
			result.Status == "cancelled"

		if !isTerminal {
			// PSP has it and it's in a live state — treat as PROVIDER_ACKED.
			paEvent := model.ProviderAckedEvent{
				EventID:       uuid.New().String(),
				EventType:     "ProviderAcked",
				TenantID:      d.TenantID,
				IntentID:      d.IntentID,
				ContractID:    d.ContractID,
				DispatchID:    d.DispatchID,
				TraceID:       d.TraceID,
				SchemaVersion: model.SchemaVersionV1,
				CreatedAt:     now,
				Payload: model.ProviderAckedPayload{
					DispatchID:        d.DispatchID,
					ProviderAttemptID: result.PayoutID,
					ProviderReference: nil,
					Status:            result.Status,
					AckedAt:           now.Format("2006-01-02T15:04:05Z07:00"),
				},
			}
			if err := s.atomicStep(ctx, func(tx *sql.Tx) error {
				if err := s.outboxRepo.EnqueueTx(ctx, tx,
					paEvent.EventID, "ProviderAcked",
					d.DispatchID, d.ContractID, d.IntentID, d.TenantID, d.TraceID, paEvent,
				); err != nil {
					return err
				}
				return s.dispatchRepo.MarkProviderAckedTx(ctx, tx, d.DispatchID, result.PayoutID, result.Status)
			}); err != nil {
				log.Error("recovery_sweeper: write ProviderAcked failed",
					zap.String("dispatch_id", d.DispatchID), zap.Error(err))
				return
			}
			metrics.DispatchTotal.WithLabelValues("provider_acked_via_recovery").Inc()
			log.Info("recovery_sweeper: dispatch recovered → PROVIDER_ACKED",
				zap.String("dispatch_id", d.DispatchID),
				zap.String("provider_attempt_id", result.PayoutID),
			)
			return
		}

		// PSP has it but it failed/reversed — terminal.
		s.loop.markFailedTerminal(ctx, d.DispatchID, d.ContractID, d.IntentID,
			d.TenantID, d.TraceID, "PSP_TERMINAL:"+result.Status, log)
		return
	}

	// PSP has no record — call never reached the PSP. Safe to retry.
	nextAttempt := now.Add(retryBackoff(d.AttemptCount))
	retryEvent := model.DispatchRetryScheduledEvent{
		EventID:       uuid.New().String(),
		EventType:     "DispatchRetryScheduled",
		TenantID:      d.TenantID,
		IntentID:      d.IntentID,
		ContractID:    d.ContractID,
		DispatchID:    d.DispatchID,
		TraceID:       d.TraceID,
		SchemaVersion: model.SchemaVersionV1,
		CreatedAt:     now,
		Payload: model.DispatchRetryScheduledPayload{
			DispatchID:    d.DispatchID,
			RetryClass:    string(model.RetryClassRetryableAfterBackoff),
			NextAttemptAt: nextAttempt,
			AttemptCount:  d.AttemptCount,
			FailureReason: "CRASH_RECOVERY_NO_PSP_RECORD",
		},
	}
	if err := s.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := s.outboxRepo.EnqueueTx(ctx, tx,
			retryEvent.EventID, "DispatchRetryScheduled",
			d.DispatchID, d.ContractID, d.IntentID, d.TenantID, d.TraceID, retryEvent,
		); err != nil {
			return err
		}
		return s.dispatchRepo.MarkFailedRetryableTx(ctx, tx,
			d.DispatchID,
			string(model.RetryClassRetryableAfterBackoff),
			nextAttempt,
		)
	}); err != nil {
		log.Error("recovery_sweeper: write DispatchRetryScheduled failed",
			zap.String("dispatch_id", d.DispatchID), zap.Error(err))
		return
	}
	log.Info("recovery_sweeper: dispatch scheduled for retry — PSP has no record",
		zap.String("dispatch_id", d.DispatchID),
		zap.Time("next_attempt_at", nextAttempt),
	)
}

func (s *RecoverySweeper) atomicStep(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
