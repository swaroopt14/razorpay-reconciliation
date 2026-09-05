package worker

// Some policies should fire on a schedule, not on individual Kafka events.
// Example: "Every 5 minutes, check if any corridor has p95 latency > 6h"
// We can't do this on individual events alone because:
//   - The event happens once (finality cert arrives)
//   - But the SLA breach might build up gradually over many events
//   - We want a periodic scan that looks at the CURRENT state
//
// This worker ticks every 5 minutes and calls EvaluateForCron for every
// active tenant+corridor combination it finds in the projection_state table.
//
// HOW IT RELATES TO OTHER WORKERS:
//   outbox_worker  → delivers ActionContracts to Kafka (output)
//   sla_worker     → checks individual SLA deadlines per intent
//   policy_cron_worker → evaluates cron-based policy rules (this file)
//
// HOW IT'S STARTED:
//   main.go calls: go cronWorker.Start(ctx)
//   It runs until the context is cancelled (service shutdown).

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// PolicyCronWorker evaluates cron-triggered policies on a fixed schedule.
type PolicyCronWorker struct {
	projRepo      *persistence.ProjectionRepo // used to find active tenants+corridors
	policyService *services.PolicyService     // does the actual rule evaluation
}

// NewPolicyCronWorker creates a PolicyCronWorker.
// Both dependencies are passed in (dependency injection) — same pattern as
// NewSLAWorker and NewOutboxWorker.
func NewPolicyCronWorker(
	projRepo *persistence.ProjectionRepo,
	policyService *services.PolicyService,
) *PolicyCronWorker {
	return &PolicyCronWorker{
		projRepo:      projRepo,
		policyService: policyService,
	}
}

// Start runs the cron evaluation loop until ctx is cancelled.
// Call this in a goroutine from main.go:
//
//	go cronWorker.Start(ctx)
func (w *PolicyCronWorker) Start(ctx context.Context) {
	// time.NewTicker creates a ticker that fires every 5 minutes.
	// ticker.C is a channel — it receives the current time every 5 minutes.
	// 5 * time.Minute is a constant = 300,000,000,000 nanoseconds.
	ticker := time.NewTicker(5 * time.Minute)

	// defer runs when Start() exits (i.e. when the service shuts down).
	// ticker.Stop() frees the ticker's internal goroutine — without this
	// there's a small goroutine leak on every shutdown.
	defer ticker.Stop()

	log.Println("policy_cron_worker: started (interval=5m)")

	// Run once immediately on startup.
	// Why If the service restarts, we want to evaluate policies right away
	// instead of waiting up to 5 minutes for the first tick.
	w.runOnce(ctx)

	// Main loop: wait for either a tick or a shutdown signal.
	for {
		// select is like a switch for channels.
		// It blocks here until ONE of the cases has data ready.
		select {
		case <-ticker.C:
			// 5 minutes elapsed — time to evaluate policies
			w.runOnce(ctx)

		case <-ctx.Done():
			// Context was cancelled — service is shutting down.
			// ctx.Done() returns a channel that closes when cancel() is called.
			log.Println("policy_cron_worker: shutting down")
			return
		}
	}
}

// runOnce finds all active tenant+corridor pairs and evaluates cron policies.
//
// HOW WE FIND ACTIVE PAIRS:
// We ask the projection_state table: "which (tenant_id, corridor_id) combinations
// have had activity today?" The projection_repo gives us this via GetActivePairs().
//
// WHY NOT KEEP A LIST IN MEMORY?
// If the service restarts, an in-memory list would be empty until new events arrive.
// The DB always has the true picture — so we read from it every tick.
func (w *PolicyCronWorker) runOnce(ctx context.Context) {
	// Fetch all active tenant+corridor combinations from projection_state.
	// "Active" means: has at least one projection row created today.
	pairs, err := w.projRepo.GetActiveTenantCorridorPairs(ctx)
	if err != nil {
		log.Printf("policy_cron_worker: GetActiveTenantCorridorPairs error: %v", err)
		return
	}

	if len(pairs) == 0 {
		return // nothing to evaluate yet — normal for a fresh deployment
	}

	testTenant := strings.TrimSpace(os.Getenv("ZPI_TEST_TENANT"))
	log.Printf("policy_cron_worker: evaluating %d tenant+corridor pair(s)", len(pairs))

	for _, pair := range pairs {
		if testTenant != "" && pair.TenantID != testTenant {
			continue
		}
		// EvaluateForCron checks all enabled cron policies against current
		// projection values for this specific tenant+corridor.
		if err := w.policyService.EvaluateForCron(ctx, pair.TenantID, pair.CorridorID); err != nil {
			// Log and continue — one failure must not block the other pairs.
			log.Printf("policy_cron_worker: EvaluateForCron failed tenant=%s corridor=%s: %v",
				pair.TenantID, pair.CorridorID, err)
		}
	}
}
