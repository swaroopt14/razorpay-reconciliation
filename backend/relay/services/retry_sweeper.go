package services

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"go.uber.org/zap"

	"zord-relay/logger"
	"zord-relay/model"
)

// RetrySweeper periodically scans the dispatches table for FAILED_RETRYABLE rows
// whose next_dispatch_attempt_at has elapsed and re-runs Steps 2–5 for each.
//
// Service 2 (zord-intent-engine) is completely uninvolved — ownership was already
// taken at Step 1. The entire retry is internal to Service 4 (zord-relay).
//
// Safety guarantees:
//   - FOR UPDATE SKIP LOCKED prevents two sweeper instances from retrying the same row.
//   - payload_json stored at Step 1 INSERT provides all data needed for retry.
//   - Step 3 (AttemptSent) is written atomically before the PSP call, so crash
//     recovery after a retry is also safe.
type RetrySweeper struct {
	dispatchRepo *DispatchRepo
	loop         *DispatchLoop
	interval     time.Duration
	batchSize    int
}

func NewRetrySweeper(
	dispatchRepo *DispatchRepo,
	loop *DispatchLoop,
	interval time.Duration,
	batchSize int,
) *RetrySweeper {
	return &RetrySweeper{
		dispatchRepo: dispatchRepo,
		loop:         loop,
		interval:     interval,
		batchSize:    batchSize,
	}
}

// Start launches the sweeper goroutine.
func (s *RetrySweeper) Start(ctx context.Context, wg *sync.WaitGroup) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.run(ctx)
	}()
}

func (s *RetrySweeper) run(ctx context.Context) {
	log := logger.Logger.With(zap.String("component", "retry_sweeper"))
	log.Info("retry_sweeper: started", zap.Duration("interval", s.interval))

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info("retry_sweeper: stopped")
			return
		case <-ticker.C:
			s.sweep(ctx, log)
		}
	}
}

func (s *RetrySweeper) sweep(ctx context.Context, log *zap.Logger) {
	rows, err := s.dispatchRepo.FindRetryable(ctx, s.batchSize)
	if err != nil {
		log.Error("retry_sweeper: find retryable failed", zap.Error(err))
		return
	}
	if len(rows) == 0 {
		return
	}

	log.Info("retry_sweeper: processing retryable dispatches", zap.Int("count", len(rows)))

	for i := range rows {
		d := &rows[i]

		rowLog := log.With(
			zap.String("dispatch_id", d.DispatchID),
			zap.String("intent_id", d.IntentID),
			zap.String("contract_id", d.ContractID),
			zap.String("tenant_id", d.TenantID),
		)

		if len(d.PayloadJSON) == 0 {
			rowLog.Error("retry_sweeper: dispatch has no payload_json — cannot retry, marking terminal")
			// No payload means we cannot detokenize. Terminal failure.
			s.loop.markFailedTerminal(ctx,
				d.DispatchID, d.ContractID, d.IntentID, d.TenantID, d.TraceID,
				"RETRY_SWEEPER_MISSING_PAYLOAD", rowLog,
			)
			continue
		}

		var payload model.OutboxPayload
		if err := json.Unmarshal(d.PayloadJSON, &payload); err != nil {
			rowLog.Error("retry_sweeper: failed to unmarshal payload_json — marking terminal",
				zap.Error(err),
			)
			s.loop.markFailedTerminal(ctx,
				d.DispatchID, d.ContractID, d.IntentID, d.TenantID, d.TraceID,
				"RETRY_SWEEPER_CORRUPT_PAYLOAD", rowLog,
			)
			continue
		}

		rowLog.Info("retry_sweeper: re-running steps 2-5 for FAILED_RETRYABLE dispatch")
		s.loop.runSteps2to5(ctx, -1, d, payload)
	}
}
