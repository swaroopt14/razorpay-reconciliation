package worker

// shadow_diff_worker.go
//
// Gap-fix pass (2026-07-13): implements
// docs/service_7_refactoring_clarifications.md §14 ("Concrete compare old vs
// new during cutover... Manual spot-checking is not acceptable. Build a
// shadow-diff job.") for the batch_contracts comparison target.
//
// Phase 5 (refactor) ADDITION: also compares policy_registry against its
// dual-written policy_definitions/policy_activations rows (§14's
// action_contracts/outbox targets still don't apply — those are in-place
// ALTERs with no separate "old table" to diff against, unlike policy's
// genuine old-vs-new table split; see policy_shadow_diff.go).
//
// Runs every 15 minutes, compares every known batch/policy's old row against
// its new-table counterpart, and records any mismatch into
// refactor_shadow_diffs. Purely observational — never blocks or mutates data.
// This is the evidence the eventual read-cutover will be gated on: zero
// mismatches over a sustained window, per the cutover rule in §14.

import (
	"context"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// ShadowDiffWorker periodically compares old vs new batch and policy storage.
type ShadowDiffWorker struct {
	batchRepo  *persistence.BatchContractRepo
	policyRepo *persistence.PolicyRepo // Phase 5 (refactor)
}

// NewShadowDiffWorker creates a ShadowDiffWorker.
func NewShadowDiffWorker(batchRepo *persistence.BatchContractRepo, policyRepo *persistence.PolicyRepo) *ShadowDiffWorker {
	return &ShadowDiffWorker{batchRepo: batchRepo, policyRepo: policyRepo}
}

// Start runs the shadow-diff loop until ctx is cancelled.
// Call this in a goroutine from main.go: go shadowDiffWorker.Start(ctx)
func (w *ShadowDiffWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	log.Println("shadow_diff_worker: started (interval=15m)")

	select {
	case <-time.After(1 * time.Minute):
		w.runOnce(ctx)
	case <-ctx.Done():
		return
	}

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			log.Println("shadow_diff_worker: shutting down")
			return
		}
	}
}

// runOnce compares every known batch and policy, and logs a summary.
func (w *ShadowDiffWorker) runOnce(ctx context.Context) {
	batches, err := w.batchRepo.ListAllExternalBatchIDs(ctx)
	if err != nil {
		log.Printf("shadow_diff_worker: ListAllExternalBatchIDs error: %v", err)
	} else if len(batches) > 0 {
		mismatches := 0
		for _, b := range batches {
			matched, err := w.batchRepo.CompareBatchOldVsNew(ctx, b.TenantID, b.ExternalBatchID)
			if err != nil {
				log.Printf("shadow_diff_worker: CompareBatchOldVsNew tenant=%s batch=%s: %v", b.TenantID, b.ExternalBatchID, err)
				continue
			}
			if !matched {
				mismatches++
			}
		}
		log.Printf("shadow_diff_worker: compared %d batch(es), %d mismatch(es)", len(batches), mismatches)
	}

	// Phase 5 (refactor): policy_registry vs policy_definitions/activations.
	policyIDs, err := w.policyRepo.ListAllPolicyIDs(ctx)
	if err != nil {
		log.Printf("shadow_diff_worker: ListAllPolicyIDs error: %v", err)
		return
	}
	if len(policyIDs) == 0 {
		return
	}
	policyMismatches := 0
	for _, id := range policyIDs {
		matched, err := w.policyRepo.ComparePolicyOldVsNew(ctx, id)
		if err != nil {
			log.Printf("shadow_diff_worker: ComparePolicyOldVsNew id=%s: %v", id, err)
			continue
		}
		if !matched {
			policyMismatches++
		}
	}
	log.Printf("shadow_diff_worker: compared %d policy(ies), %d mismatch(es)", len(policyIDs), policyMismatches)
}
