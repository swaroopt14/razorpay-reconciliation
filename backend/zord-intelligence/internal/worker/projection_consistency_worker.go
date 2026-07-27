package worker

// projection_consistency_worker.go
//
// Gap-fix pass (2026-07-13): promotes ProjectionRepo.VerifyBatchTenantConsistency
// from test-only to a scheduled production job, per
// docs/service_7_refactoring_clarifications.md §11 ("Promote
// VerifyBatchTenantConsistency from test-only to scheduled production job.
// job name: projection_consistency_check, frequency: hourly initially").
//
// For every tenant with projection activity, checks that
// tenant-scope LEAKAGE/AMBIGUITY/DEFENSIBILITY metrics equal the sum of their
// batch-scope counterparts (the "tenant+batch dual-bookkeeping invariant",
// §11). Any mismatch is recorded in projection_consistency_violations for ops
// to review — this worker never blocks or mutates projections, purely observes.

import (
	"context"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// ProjectionConsistencyWorker runs the tenant/batch consistency check hourly.
type ProjectionConsistencyWorker struct {
	projRepo *persistence.ProjectionRepo
}

// NewProjectionConsistencyWorker creates a ProjectionConsistencyWorker.
func NewProjectionConsistencyWorker(projRepo *persistence.ProjectionRepo) *ProjectionConsistencyWorker {
	return &ProjectionConsistencyWorker{projRepo: projRepo}
}

// Start runs the hourly consistency-check loop until ctx is cancelled.
// Call this in a goroutine from main.go: go consistencyWorker.Start(ctx)
func (w *ProjectionConsistencyWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	log.Println("projection_consistency_worker: started (interval=1h)")

	// Run once shortly after startup rather than waiting a full hour —
	// small delay so it doesn't compete with boot-time work.
	select {
	case <-time.After(2 * time.Minute):
		w.runOnce(ctx)
	case <-ctx.Done():
		return
	}

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			log.Println("projection_consistency_worker: shutting down")
			return
		}
	}
}

// runOnce checks every tenant with projection activity and records any
// tenant-vs-batch mismatches found.
func (w *ProjectionConsistencyWorker) runOnce(ctx context.Context) {
	tenants, err := w.projRepo.ListDistinctTenants(ctx)
	if err != nil {
		log.Printf("projection_consistency_worker: ListDistinctTenants error: %v", err)
		return
	}

	totalViolations := 0
	for _, tenantID := range tenants {
		violations, err := w.projRepo.FindConsistencyViolations(ctx, tenantID)
		if err != nil {
			// One tenant's failure must not block the others.
			log.Printf("projection_consistency_worker: FindConsistencyViolations tenant=%s: %v", tenantID, err)
			continue
		}
		if len(violations) == 0 {
			continue
		}
		if err := w.projRepo.RecordConsistencyViolations(ctx, tenantID, violations); err != nil {
			log.Printf("projection_consistency_worker: RecordConsistencyViolations tenant=%s: %v", tenantID, err)
			continue
		}
		totalViolations += len(violations)
		log.Printf("projection_consistency_worker: tenant=%s found %d violation(s)", tenantID, len(violations))
	}
	log.Printf("projection_consistency_worker: checked %d tenant(s), %d violation(s) recorded", len(tenants), totalViolations)
}
