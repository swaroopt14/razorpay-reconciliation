package worker

// ============================================================
// sla_worker.go
// ============================================================
//
// Monitors SLA deadlines for active payout intents.
// Runs every 5 minutes, finds timers past their deadline, and creates
// ESCALATE ActionContracts so ops teams are alerted via the outbox.
//
// CHANGES FROM ORIGINAL VERSION:
// ──────────────────────────────────
// 1. SeedSLATimer and ResolveSLATimer removed from this file.
//    They now live in persistence.SLATimerRepo.
//    This broke the import cycle: services→worker→services.
//
// 2. SLAWorker uses SLATimerRepo instead of writing raw SQL directly.
//    Workers should not write SQL — that belongs in repos.
//
// 3. SLATimerRow type lives in persistence now (shared between repo and worker).

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// SLAWorker checks SLA timers and fires ESCALATE actions for breaches.
type SLAWorker struct {
	slaRepo           *persistence.SLATimerRepo
	actionService     *services.ActionService
	projectionService *services.ProjectionService // needed to update sla_breach_rate projection
	receiptRepo       *persistence.EventReceiptRepo // P1-03: stale PROCESSING lease sweep
}

// NewSLAWorker creates an SLAWorker. receiptRepo's SweepStaleLeases runs on
// this worker's 5-minute tick (P1-03) — chosen over the 5s outbox tick
// (too frequent for a lease on this timescale) and the 1h consistency tick
// (too slow), matching the default lease duration's cadence.
func NewSLAWorker(
	slaRepo *persistence.SLATimerRepo,
	actionService *services.ActionService,
	projectionService *services.ProjectionService,
	receiptRepo *persistence.EventReceiptRepo,
) *SLAWorker {
	return &SLAWorker{
		slaRepo:           slaRepo,
		actionService:     actionService,
		projectionService: projectionService,
		receiptRepo:       receiptRepo,
	}
}

// Start runs the SLA check loop until ctx is cancelled.
// Called as: go slaWorker.Start(ctx)
func (w *SLAWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	log.Println("sla_worker: started (interval=5m)")

	// Run once immediately on startup — catches pre-existing breaches after a restart
	w.runOnce(ctx)

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			log.Println("sla_worker: shutting down")
			return
		}
	}
}

// runOnce fetches all breached timers and handles each one.
func (w *SLAWorker) runOnce(ctx context.Context) {
	// P1-03: reclaim any event_receipts row stuck in PROCESSING past its
	// lease. A sweep failure never blocks SLA breach handling.
	if reclaimed, err := w.receiptRepo.SweepStaleLeases(ctx); err != nil {
		log.Printf("sla_worker: lease sweep error: %v", err)
	} else if reclaimed > 0 {
		log.Printf("sla_worker: reclaimed %d stale PROCESSING lease(s)", reclaimed)
	}

	breached, err := w.slaRepo.FetchBreachedTimers(ctx)
	if err != nil {
		log.Printf("sla_worker: FetchBreachedTimers error: %v", err)
		return
	}
	if len(breached) == 0 {
		return
	}

	log.Printf("sla_worker: found %d SLA breach(es) to handle", len(breached))

	for _, timer := range breached {
		if err := w.handleBreach(ctx, timer); err != nil {
			// Log and continue — one failure should not block the rest
			log.Printf("sla_worker: handleBreach failed intent=%s: %v", timer.IntentID, err)
		}
	}
}

// handleBreach creates an ESCALATE ActionContract and marks the timer BREACHED.
//
// WHY TWO STEPS?
// Step 1 (CreateAction) writes to action_contracts + actuation_outbox.
// Step 2 (MarkBreached) flips the timer status.
// If step 1 fails, we return an error and leave the timer ACTIVE → it will
// be retried on the next 5-minute tick.
// If step 1 succeeds but step 2 fails, the timer stays ACTIVE but the action
// already has an idempotency key — next tick's CreateAction is a no-op.
// This gives us at-least-once semantics with no duplicate alerts.
func (w *SLAWorker) handleBreach(ctx context.Context, timer persistence.SLATimerRow) error {
	overdueBy := time.Since(timer.SLADeadline).Round(time.Minute)
	breachSeconds := time.Since(timer.SLADeadline).Seconds()

	payload, _ := json.Marshal(map[string]any{
		"intent_id":    timer.IntentID,
		"corridor_id":  timer.CorridorID,
		"sla_deadline": timer.SLADeadline.Format(time.RFC3339),
		"overdue_by":   overdueBy.String(),
		"severity":     "HIGH",
		"message": fmt.Sprintf("SLA breach: intent %s on corridor %s is %s overdue",
			timer.IntentID, timer.CorridorID, overdueBy),
	})

	// TriggerEventID = "sla_breach_" + intentID makes the idempotency key unique
	// per breach per intent. Safe to call multiple times — DB unique constraint
	// on idempotency_key silently ignores duplicates.
	if err := w.actionService.CreateAction(ctx, services.CreateActionRequest{
		TenantID:      timer.TenantID,
		PolicyID:      "P_SLA_BREACH",
		PolicyVersion: 1,
		ScopeRefs: models.ScopeRefs{
			TenantID:   timer.TenantID,
			IntentID:   timer.IntentID,
			CorridorID: timer.CorridorID,
		},
		InputRefsJSON: fmt.Sprintf(
			`{"sla_deadline":"%s","overdue_seconds":%d}`,
			timer.SLADeadline.Format(time.RFC3339),
			int(time.Since(timer.SLADeadline).Seconds()),
		),
		Decision:       models.DecisionEscalate,
		Confidence:     1.0, // a SLA breach is a hard fact, confidence is always 1.0
		PayloadJSON:    string(payload),
		TriggerEventID: "sla_breach_" + timer.IntentID,
	}); err != nil {
		return fmt.Errorf("sla_worker.handleBreach CreateAction intent=%s: %w",
			timer.IntentID, err)
	}

	// ── Update the sla_breach_rate projection ─────────────────────────────
	// This is what feeds GET /v1/intelligence/sla-breach.
	// Without this call, the breach counter in projection_state stays at zero
	// even when real breaches happen — ops would never see accurate breach rates.
	// We log failures here rather than returning an error, because the
	// ActionContract (the authoritative record) already succeeded above.
	if err := w.projectionService.HandleSLATimerBreached(ctx, timer.TenantID, breachSeconds); err != nil {
		log.Printf("sla_worker.handleBreach: HandleSLATimerBreached failed intent=%s tenant=%s: %v",
			timer.IntentID, timer.TenantID, err)
	}

	if err := w.slaRepo.MarkBreached(ctx, timer.ID); err != nil {
		return fmt.Errorf("sla_worker.handleBreach MarkBreached id=%d: %w",
			timer.ID, err)
	}

	log.Printf("sla_worker: breach handled intent=%s corridor=%s overdue=%s",
		timer.IntentID, timer.CorridorID, overdueBy)
	return nil
}
