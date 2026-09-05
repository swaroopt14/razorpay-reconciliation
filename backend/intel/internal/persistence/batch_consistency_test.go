package persistence_test

// batch_consistency_test.go
//
// Integration test for the batch-scope intelligence pipeline added by this
// task. Drives the new BothScopes atomic repo methods and the four
// ComputeAndSaveForBatch service methods the same way projection_service.go
// does inside each event handler, across 15 mixed events spanning 3 batches.
//
// Then asserts:
//   1. VerifyBatchTenantConsistency reports no mismatch (sum(batch) == tenant
//      for every counter field maintained by the BothScopes methods).
//   2. intelligence_snapshots has a BATCH-scoped row for all four
//      intelligence types (LEAKAGE, AMBIGUITY, DEFENSIBILITY, RECOMMENDATION)
//      for each of the 3 batches.
//
// This test calls the persistence + services layers directly rather than
// wiring a full ProjectionService (which additionally requires policy, SLA,
// RCA, and Pattern services unrelated to this task) — it exercises exactly
// the new code paths this task added, using the same call sequence and
// argument shapes the real handlers use.
//
// To run: export TEST_DB_URL="postgres://postgres:postgres@localhost:5432/zord_test"

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

func TestBatchTenantConsistency(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	tenantID := "tnt_batch_consistency_test"
	batches := []string{"batch_consistency_A", "batch_consistency_B", "batch_consistency_C"}

	// Clean up any previously stored test data so the test is idempotent.
	if _, err := pool.Exec(ctx, `DELETE FROM projection_state WHERE tenant_id = $1`, tenantID); err != nil {
		t.Fatalf("cleanup projection_state failed: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM intelligence_snapshots WHERE tenant_id = $1`, tenantID); err != nil {
		t.Fatalf("cleanup intelligence_snapshots failed: %v", err)
	}

	repo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)
	batchContractRepo := persistence.NewBatchContractRepo(pool)

	// Constructed but never Start()-ed — ComputeAndSaveForBatch never invokes
	// mlClient (no Z-score / LR at batch scope), so no live Kafka broker is needed.
	mlClient := mlclient.New("localhost:9092", "ml.request.events.test", "ml.result.events.test", "zpi-batch-consistency-test")

	leakageSvc := services.NewLeakageIntelligenceService(repo, snapshotRepo, mlRepo, predRepo, mlClient)
	ambiguitySvc := services.NewAmbiguityIntelligenceService(ctx, repo, snapshotRepo, mlRepo, predRepo, mlClient)
	defensibilitySvc := services.NewDefensibilityIntelligenceService(repo, snapshotRepo, batchContractRepo)
	recommendationSvc := services.NewRecommendationIntelligenceService(snapshotRepo)

	now := time.Now().UTC()
	ws := now.Truncate(24 * time.Hour)
	we := ws.Add(24 * time.Hour)

	amt := func(minor int64) decimal.Decimal { return decimal.NewFromInt(minor) }

	// ── Batch A: IntentCreated, SettlementCreated, AttachmentDecision
	//             (MATCH_UNRESOLVED), VarianceRecord (UNDER_SETTLEMENT),
	//             EvidencePackReady ────────────────────────────────────────
	batchA := batches[0]

	mustNoErr(t, repo.AtomicIncrementLeakageIntendedTotalBothScopes(ctx, tenantID, batchA, amt(10000), ws, we))
	mustNoErr(t, repo.AtomicRecordDefensibilityIntentQualityBothScopes(ctx, tenantID, batchA, 0.85, ws, we))

	mustNoErr(t, repo.AtomicIncrementSettledVolumeBothScopes(ctx, tenantID, batchA, amt(9000), ws, we))
	mustNoErr(t, repo.AtomicRecordDefensibilityMappingConfidenceBothScopes(ctx, tenantID, batchA, 0.90, ws, we))

	mustNoErr(t, repo.AtomicRecordLeakageBothScopes(ctx, tenantID, batchA, "UNMATCHED_INTENT", amt(1000), decimal.Zero, ws, we))
	mustNoErr(t, repo.AtomicRecordAttachmentDecisionBothScopes(ctx, tenantID, batchA, "MATCH_UNRESOLVED", 0.40, amt(1000), nil, true, false, 0.05, false, ws, we))
	mustNoErr(t, repo.AtomicIncrementDefensibilityIntentBothScopes(ctx, tenantID, batchA, false, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))
	mustNoErr(t, ambiguitySvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, ambiguitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))

	mustNoErr(t, repo.AtomicRecordVarianceBothScopes(ctx, tenantID, batchA, "UNDER_SETTLEMENT", amt(1000), amt(10000), false, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))

	mustNoErr(t, repo.AtomicIncrementDefensibilityEvidencePackBothScopes(ctx, tenantID, batchA, ws, we))
	mustNoErr(t, repo.AtomicRecordEvidencePackQualityBothScopes(ctx, tenantID, batchA, 0.95, true, true, ws, we))
	mustNoErr(t, defensibilitySvc.ComputeAndSave(ctx, tenantID, "", ws, we))
	mustNoErr(t, defensibilitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchA))

	// ── Batch B: IntentCreated (duplicate risk), SettlementCreated (orphan),
	//             AttachmentDecision (MATCH_DUPLICATE), VarianceRecord
	//             (REVERSAL), GovernanceDecision ───────────────────────────
	batchB := batches[1]

	mustNoErr(t, repo.AtomicIncrementLeakageIntendedTotalBothScopes(ctx, tenantID, batchB, amt(20000), ws, we))
	mustNoErr(t, repo.AtomicIncrementLeakageDuplicateRiskBothScopes(ctx, tenantID, batchB, amt(2000), ws, we))
	mustNoErr(t, repo.AtomicRecordDefensibilityIntentQualityBothScopes(ctx, tenantID, batchB, 0.70, ws, we))

	mustNoErr(t, repo.AtomicRecordLeakageBothScopes(ctx, tenantID, batchB, "ORPHAN_SETTLEMENT", decimal.Zero, amt(5000), ws, we))
	mustNoErr(t, repo.AtomicIncrementSettledVolumeBothScopes(ctx, tenantID, batchB, amt(5000), ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))

	mustNoErr(t, repo.AtomicIncrementLeakageConfirmedDuplicateBothScopes(ctx, tenantID, batchB, amt(2000), ws, we))
	mustNoErr(t, repo.AtomicRecordAttachmentDecisionBothScopes(ctx, tenantID, batchB, "MATCH_DUPLICATE", 0.95, amt(2000), []string{"UTR", "RRN"}, false, true, 0.40, false, ws, we))
	mustNoErr(t, repo.AtomicIncrementDefensibilityIntentBothScopes(ctx, tenantID, batchB, false, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))
	mustNoErr(t, ambiguitySvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, ambiguitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))

	mustNoErr(t, repo.AtomicRecordVarianceBothScopes(ctx, tenantID, batchB, "REVERSAL", amt(3000), amt(20000), false, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))

	mustNoErr(t, repo.AtomicRecordGovernanceCoverageBothScopes(ctx, tenantID, batchB, "APPROVED", true, true, true, ws, we))
	mustNoErr(t, defensibilitySvc.ComputeAndSave(ctx, tenantID, "", ws, we))
	mustNoErr(t, defensibilitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchB))

	// ── Batch C: IntentCreated, SettlementCreated, AttachmentDecision
	//             (MATCH_AMBIGUOUS), VarianceRecord (OVER_SETTLEMENT),
	//             VarianceRecord (VALUE_DATE_MISMATCH) ─────────────────────
	batchC := batches[2]

	mustNoErr(t, repo.AtomicIncrementLeakageIntendedTotalBothScopes(ctx, tenantID, batchC, amt(15000), ws, we))
	mustNoErr(t, repo.AtomicRecordDefensibilityIntentQualityBothScopes(ctx, tenantID, batchC, 0.60, ws, we))

	mustNoErr(t, repo.AtomicIncrementSettledVolumeBothScopes(ctx, tenantID, batchC, amt(15500), ws, we))
	mustNoErr(t, repo.AtomicRecordDefensibilityMappingConfidenceBothScopes(ctx, tenantID, batchC, 0.55, ws, we))

	mustNoErr(t, repo.AtomicRecordAttachmentDecisionBothScopes(ctx, tenantID, batchC, "MATCH_AMBIGUOUS", 0.50, amt(15000), []string{"UTR"}, true, true, 0.10, false, ws, we))
	mustNoErr(t, repo.AtomicIncrementDefensibilityIntentBothScopes(ctx, tenantID, batchC, false, ws, we))
	mustNoErr(t, ambiguitySvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, ambiguitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))

	mustNoErr(t, repo.AtomicRecordOverSettlementBothScopes(ctx, tenantID, batchC, amt(500), ws, we))
	mustNoErr(t, repo.AtomicRecordVarianceBothScopes(ctx, tenantID, batchC, "OVER_SETTLEMENT", amt(500), amt(15000), false, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))

	mustNoErr(t, repo.AtomicRecordVarianceBothScopes(ctx, tenantID, batchC, "VALUE_DATE_MISMATCH", decimal.Zero, amt(15000), false, ws, we))
	mustNoErr(t, repo.AtomicIncrementValueDateMismatchBothScopes(ctx, tenantID, batchC, ws, we))
	mustNoErr(t, repo.AtomicIncrementDefensibilityWeakEvidenceBothScopes(ctx, tenantID, batchC, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, leakageSvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))
	mustNoErr(t, defensibilitySvc.ComputeAndSave(ctx, tenantID, "", ws, we))
	mustNoErr(t, defensibilitySvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))
	mustNoErr(t, recommendationSvc.ComputeAndSave(ctx, tenantID, ws, we))
	mustNoErr(t, recommendationSvc.ComputeAndSaveForBatch(ctx, tenantID, batchC))

	// ── Assertion 1: sum(batch) == tenant for every BothScopes-fed field ──
	if err := repo.VerifyBatchTenantConsistency(ctx, tenantID); err != nil {
		t.Fatalf("VerifyBatchTenantConsistency failed: %v", err)
	}

	// ── Assertion 2: BATCH-scoped snapshots exist for all four layers, per batch ──
	for _, batchID := range batches {
		for _, snapType := range []string{"LEAKAGE", "AMBIGUITY", "DEFENSIBILITY", "RECOMMENDATION"} {
			snap, err := snapshotRepo.GetLatestByType(ctx, tenantID, snapType, "BATCH", &batchID)
			if err != nil {
				t.Fatalf("GetLatestByType(%s, BATCH, %s) failed: %v", snapType, batchID, err)
			}
			if snap == nil {
				t.Fatalf("expected a BATCH-scoped %s snapshot for batch=%s, got none", snapType, batchID)
			}
		}
	}
}

func mustNoErr(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
