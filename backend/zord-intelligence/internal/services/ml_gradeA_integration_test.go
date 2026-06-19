package services

// ml_gradeA_integration_test.go
//
// Functional / smoke tests for the five ML intelligence layers under Grade A mode.
//
// WHAT WE TEST:
//   1. Ambiguity service  → Logistic Regression produces a risk score + level
//   2. Leakage service    → Z-score runs (INSUFFICIENT_DATA on cold start, then
//                           detects anomaly once history is pre-seeded)
//   3. Defensibility svc  → Deterministic 7-component score maps to correct tier
//   4. Pattern service    → Isolation Forest anomaly detection on batch data
//   5. Recommendation svc → Cards produced with PriorityScore > 0, sorted by tier
//
// REQUIRES: TEST_DB_URL env var pointing to a Postgres instance with the full
// schema from db/init.sql applied (same pattern as projection_repo_test.go).
//
// Run with:
//   TEST_DB_URL="postgres://postgres:postgres@localhost:5432/zord_test" \
//     go test ./internal/services/ -run TestGradeA -v

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ── DB setup ──────────────────────────────────────────────────────────────────

func setupIntegrationDB(t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		t.Skip("skipping integration test: TEST_DB_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect to test DB: %v", err)
	}
	return pool, func() { pool.Close() }
}

// uniqueTenant generates a test-scoped tenant ID to avoid cross-test contamination.
func uniqueTenant(label string) string {
	return fmt.Sprintf("tnt_test_%s_%d", label, time.Now().UnixNano())
}

// seedProjection inserts one projection_state row directly.
func seedProjection(t *testing.T, pool *pgxpool.Pool, tenantID, key string, value any) {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("seed projection marshal: %v", err)
	}
	now := time.Now().UTC()
	_, err = pool.Exec(context.Background(), `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5, $6, 1)
	`, tenantID, key, now.Add(-24*time.Hour), now, string(raw), now)
	if err != nil {
		t.Fatalf("seed projection (key=%s): %v", key, err)
	}
}

// seedMLFeatureRow inserts one ml_feature_store row for history data.
func seedMLFeatureRow(t *testing.T, pool *pgxpool.Pool, tenantID, family string, features map[string]any, daysAgo int) {
	t.Helper()
	raw, err := json.Marshal(features)
	if err != nil {
		t.Fatalf("seed ml feature marshal: %v", err)
	}
	now := time.Now().UTC()
	created := now.Add(-time.Duration(daysAgo) * 24 * time.Hour)
	rowID := fmt.Sprintf("feat_test_%s_%d", family, created.UnixNano())
	_, err = pool.Exec(context.Background(), `
		INSERT INTO ml_feature_store
			(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
			 window_start, window_end, features_json, label_json, model_version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, $9)
	`, rowID, tenantID, "TENANT", tenantID, family,
		created.Add(-24*time.Hour), created, raw, created)
	if err != nil {
		t.Fatalf("seed ml feature row (family=%s day=%d): %v", family, daysAgo, err)
	}
}

// readLatestSnapshot reads the most recent snapshot JSON for the given type and unmarshals it.
func readLatestSnapshot(t *testing.T, pool *pgxpool.Pool, tenantID, snapType string, dest any) {
	t.Helper()
	var raw []byte
	err := pool.QueryRow(context.Background(), `
		SELECT snapshot_json FROM intelligence_snapshots
		WHERE tenant_id = $1 AND snapshot_type = $2
		ORDER BY created_at DESC LIMIT 1
	`, tenantID, snapType).Scan(&raw)
	if err != nil {
		t.Fatalf("readLatestSnapshot type=%s: %v", snapType, err)
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		t.Fatalf("readLatestSnapshot unmarshal type=%s: %v", snapType, err)
	}
}

// ── Grade A: Ambiguity + Logistic Regression ──────────────────────────────────

func TestGradeA_AmbiguityService_LogisticRegression(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("amb")
	now := time.Now().UTC()

	// Seed: high-ambiguity scenario — 15% ambiguity rate, 20% missing refs
	seedProjection(t, pool, tenantID, "ambiguity.summary", map[string]any{
		"total_decisions":             1000,
		"ambiguous_intent_count":      150,
		"ambiguous_amount_minor":      1_500_000,
		"unresolved_settlement_count": 30,
		"value_at_risk_minor":         1_800_000,
		"avg_attachment_confidence":   0.72,
		"confidence_sum":              720.0,
		"confidence_count":            1000,
		"provider_ref_missing_count":  200,
		"provider_ref_missing_rate":   0.20,
		"ambiguity_rate":              0.15,
		"updated_at":                  now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)

	svc := NewAmbiguityIntelligenceService(ctx, projRepo, snapshotRepo, mlRepo, predRepo, nil)
	err := svc.ComputeAndSave(ctx, tenantID, now.Add(-24*time.Hour), now)
	if err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap AmbiguitySnapshot
	readLatestSnapshot(t, pool, tenantID, "AMBIGUITY", &snap)

	// Verify deterministic fields
	if snap.TotalDecisions != 1000 {
		t.Errorf("TotalDecisions = %d, want 1000", snap.TotalDecisions)
	}
	if snap.RiskTier != "CRITICAL" {
		t.Errorf("RiskTier = %q, want CRITICAL (ambiguity_rate=0.15 > 0.10)", snap.RiskTier)
	}

	// Verify ML fields: logistic regression must have run
	if snap.RiskPredictionScore <= 0 || snap.RiskPredictionScore > 1 {
		t.Errorf("RiskPredictionScore = %.4f, want in (0,1]", snap.RiskPredictionScore)
	}
	if snap.RiskPredictionLevel == "" {
		t.Error("RiskPredictionLevel is empty — logistic regression did not run")
	}
	// With 15% ambiguity + 20% missing refs, model should flag HIGH or CRITICAL
	switch snap.RiskPredictionLevel {
	case "HIGH", "CRITICAL":
		// expected
	default:
		t.Errorf("RiskPredictionLevel = %q; with high ambiguity inputs expected HIGH or CRITICAL", snap.RiskPredictionLevel)
	}

	// Verify ML prediction record was persisted
	pred, err := predRepo.GetLatestPrediction(ctx, tenantID, "TENANT", tenantID, "AMBIGUITY")
	if err != nil {
		t.Fatalf("GetLatestPrediction: %v", err)
	}
	if pred == nil {
		t.Fatal("no ML prediction record persisted for AMBIGUITY")
	}
	if pred.ModelID != "logistic_regression_v1_ambiguity" {
		t.Errorf("ModelID = %q, want logistic_regression_v1_ambiguity", pred.ModelID)
	}

	t.Logf("Ambiguity Grade A: risk_tier=%s LR_score=%.4f LR_level=%s",
		snap.RiskTier, snap.RiskPredictionScore, snap.RiskPredictionLevel)
}

// ── Grade A: Leakage + Z-score ────────────────────────────────────────────────

func TestGradeA_LeakageService_ZScore_ColdStart(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("leak_cold")
	now := time.Now().UTC()

	// Seed leakage projection (no historical ML feature rows → cold start)
	seedProjection(t, pool, tenantID, "leakage.total", map[string]any{
		"total_amount_minor":            500_000,
		"unmatched_amount_minor":        200_000,
		"under_settlement_amount_minor": 150_000,
		"orphan_amount_minor":           100_000,
		"reversal_exposure_minor":       50_000,
		"unmatched_intent_count":        15,
		"under_settlement_count":        8,
		"orphan_settlement_count":       3,
		"reversal_count":                2,
		"total_intended_amount_minor":   10_000_000,
		"leakage_percentage":            0.05,
		"breakdown_by_type":             map[string]int64{},
		"updated_at":                    now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)

	svc := NewLeakageIntelligenceService(projRepo, snapshotRepo, mlRepo, predRepo, nil, nil)
	if err := svc.ComputeAndSave(ctx, tenantID, now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap LeakageSnapshot
	readLatestSnapshot(t, pool, tenantID, "LEAKAGE", &snap)

	// Cold start: < MinSamples history → INSUFFICIENT_DATA
	if snap.AnomalyLevel != "INSUFFICIENT_DATA" {
		t.Errorf("AnomalyLevel = %q, want INSUFFICIENT_DATA on cold start", snap.AnomalyLevel)
	}
	if snap.AnomalyScore != 0 {
		t.Errorf("AnomalyScore = %.4f, want 0 on cold start", snap.AnomalyScore)
	}

	t.Logf("Leakage cold start: anomaly_level=%s (correct — no history yet)", snap.AnomalyLevel)
}

func TestGradeA_LeakageService_ZScore_WithHistory(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("leak_hist")
	now := time.Now().UTC()

	// Seed 10 days of normal history (~1% leakage)
	for i := 10; i >= 1; i-- {
		seedMLFeatureRow(t, pool, tenantID, "LEAKAGE", map[string]any{
			"leakage_percentage": 0.01 + float64(i)*0.001,
		}, i)
	}

	// Spike today: 8% leakage (>> 3 stddevs above 1% baseline)
	seedProjection(t, pool, tenantID, "leakage.total", map[string]any{
		"total_amount_minor":          8_000_000,
		"unmatched_amount_minor":      8_000_000,
		"total_intended_amount_minor": 100_000_000,
		"leakage_percentage":          0.08,
		"breakdown_by_type":           map[string]int64{},
		"updated_at":                  now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)

	svc := NewLeakageIntelligenceService(projRepo, snapshotRepo, mlRepo, predRepo, nil, nil)
	if err := svc.ComputeAndSave(ctx, tenantID, now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap LeakageSnapshot
	readLatestSnapshot(t, pool, tenantID, "LEAKAGE", &snap)

	// With 8% vs 1% baseline, z >> 3 → should be HIGH or CRITICAL
	switch snap.AnomalyLevel {
	case "HIGH", "CRITICAL":
		// expected
	case "INSUFFICIENT_DATA":
		t.Error("got INSUFFICIENT_DATA but 10 history rows were seeded")
	default:
		t.Errorf("AnomalyLevel = %q; expected HIGH or CRITICAL for spike 8x above baseline", snap.AnomalyLevel)
	}
	if snap.AnomalyScore <= 0 {
		t.Errorf("AnomalyScore = %.4f, want > 0", snap.AnomalyScore)
	}

	t.Logf("Leakage with history: anomaly_level=%s z=%.2f score=%.4f",
		snap.AnomalyLevel, snap.AnomalyZScore, snap.AnomalyScore)
}

// ── Grade A: Defensibility + Deterministic Scoring ───────────────────────────

func TestGradeA_DefensibilityService_DeterministicScore(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("def")
	now := time.Now().UTC()

	// Seed: strong defensibility scenario
	//   pack: 900/1000 = 90%
	//   governance: 850/1000 = 85%
	//   approved: 800, rejected: 10, KYC: 900, AML: 880, replay: 820
	seedProjection(t, pool, tenantID, "defensibility.summary", map[string]any{
		"total_intents":              1000,
		"with_evidence_pack":         900,
		"with_governance_decision":   850,
		"with_replay_equivalence":    820,
		"with_kyc_checked":           900,
		"with_aml_checked":           880,
		"governance_approved_count":  800,
		"governance_rejected_count":  10,
		"governance_escalated_count": 40,
		"evidence_pack_rate":         0.90,
		"governance_coverage_pct":    0.85,
		"replayability_pct":          0.82,
		"audit_ready_pct":            0.875,
		"dispute_ready_pct":          0.82,
		"weakest_proof_ref":          "",
		"updated_at":                 now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)

	svc := NewDefensibilityIntelligenceService(projRepo, snapshotRepo, batchRepo)
	if err := svc.ComputeAndSave(ctx, tenantID, "", now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap DefensibilitySnapshot
	readLatestSnapshot(t, pool, tenantID, "DEFENSIBILITY", &snap)

	// Score bounds
	if snap.DefensibilityScore < 0 || snap.DefensibilityScore > 65 {
		t.Errorf("DefensibilityScore = %.2f, want in [0,65]", snap.DefensibilityScore)
	}
	// With 90% pack, 85% governance, 80% approved, this should be GOOD or STRONG
	switch snap.DefensibilityTier {
	case "GOOD", "STRONG":
		// expected
	default:
		t.Errorf("DefensibilityTier = %q; expected GOOD or STRONG for high-coverage scenario", snap.DefensibilityTier)
	}

	// Verify compliance alert fires because rejected > 0
	if snap.ComplianceAlert == "" {
		t.Error("ComplianceAlert should be set when governance_rejected_count > 0")
	}

	t.Logf("Defensibility: score=%.1f tier=%s", snap.DefensibilityScore, snap.DefensibilityTier)
}

func TestGradeA_DefensibilityService_FragileTier(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("def_fragile")
	now := time.Now().UTC()

	// Seed: terrible defensibility — almost nothing covered
	seedProjection(t, pool, tenantID, "defensibility.summary", map[string]any{
		"total_intents":              500,
		"with_evidence_pack":         50,
		"with_governance_decision":   30,
		"with_replay_equivalence":    10,
		"with_kyc_checked":           40,
		"with_aml_checked":           20,
		"governance_approved_count":  20,
		"governance_rejected_count":  5,
		"governance_escalated_count": 5,
		"evidence_pack_rate":         0.10,
		"governance_coverage_pct":    0.06,
		"replayability_pct":          0.02,
		"audit_ready_pct":            0.08,
		"dispute_ready_pct":          0.02,
		"updated_at":                 now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)

	svc := NewDefensibilityIntelligenceService(projRepo, snapshotRepo, batchRepo)
	if err := svc.ComputeAndSave(ctx, tenantID, "", now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap DefensibilitySnapshot
	readLatestSnapshot(t, pool, tenantID, "DEFENSIBILITY", &snap)

	if snap.DefensibilityTier != "FRAGILE" {
		t.Errorf("DefensibilityTier = %q, want FRAGILE (score=%.1f)", snap.DefensibilityTier, snap.DefensibilityScore)
	}
	t.Logf("Defensibility fragile: score=%.1f tier=%s", snap.DefensibilityScore, snap.DefensibilityTier)
}

// ── Grade A: Pattern + Isolation Forest ──────────────────────────────────────

func TestGradeA_PatternService_IsolationForest_ColdStart(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("pat_cold")
	batchID := "batch_test_cold_001"
	now := time.Now().UTC()

	seedProjection(t, pool, tenantID, "batch.health."+batchID, map[string]any{
		"total_count":                  500,
		"success_count":                430,
		"failed_count":                 20,
		"pending_count":                40,
		"reversed_count":               10,
		"partial_recon_count":          0,
		"total_intended_amount_minor":  50_000_000,
		"total_confirmed_amount_minor": 43_000_000,
		"total_variance_minor":         7_000_000,
		"ambiguity_score":              0.08,
		"finality_status":              "PARTIALLY_SETTLED",
		"updated_at":                   now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)

	svc := NewPatternIntelligenceService(projRepo, snapshotRepo, batchRepo, mlRepo, predRepo, nil, nil)
	if err := svc.ComputeAndSave(ctx, tenantID, batchID, now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap PatternSnapshot
	readLatestSnapshot(t, pool, tenantID, "PATTERN", &snap)

	// On cold start (< 10 training batches), anomaly score should be 0 or level INSUFFICIENT_DATA
	t.Logf("Pattern cold start: anomaly_score=%.4f level=%s type=%s",
		snap.BatchAnomalyScore, snap.AnomalyLevel, snap.AnomalyType)

	// Score is always in [0,1] even when model hasn't trained
	if snap.BatchAnomalyScore < 0 || snap.BatchAnomalyScore > 1 {
		t.Errorf("BatchAnomalyScore = %.4f, want in [0,1]", snap.BatchAnomalyScore)
	}
}

func TestGradeA_PatternService_IsolationForest_WithHistory(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("pat_hist")
	batchID := "batch_test_anomaly_001"
	now := time.Now().UTC()

	// Seed 20 normal batches as training history
	for i := 20; i >= 1; i-- {
		seedMLFeatureRow(t, pool, tenantID, "PATTERN", map[string]any{
			"ambiguity_score":             0.02 + float64(i%5)*0.002,
			"total_variance_minor":        float64(i) * 50_000,
			"total_intended_amount_minor": 10_000_000.0,
			"pending_count":               float64(i%10) + 5,
			"failed_count":                float64(i%5) + 2,
			"reversed_count":              1.0,
			"total_count":                 200.0,
		}, i)
	}

	// Seed an anomalous batch: very high failure rate (60%)
	seedProjection(t, pool, tenantID, "batch.health."+batchID, map[string]any{
		"total_count":                  200,
		"success_count":                60,
		"failed_count":                 120, // 60% failure — anomalous
		"pending_count":                15,
		"reversed_count":               5,
		"partial_recon_count":          0,
		"total_intended_amount_minor":  10_000_000,
		"total_confirmed_amount_minor": 6_000_000,
		"total_variance_minor":         4_000_000,
		"ambiguity_score":              0.60,
		"finality_status":              "PARTIALLY_SETTLED",
		"updated_at":                   now,
	})

	projRepo := persistence.NewProjectionRepo(pool)
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)

	svc := NewPatternIntelligenceService(projRepo, snapshotRepo, batchRepo, mlRepo, predRepo, nil, nil)
	if err := svc.ComputeAndSave(ctx, tenantID, batchID, now.Add(-24*time.Hour), now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap PatternSnapshot
	readLatestSnapshot(t, pool, tenantID, "PATTERN", &snap)

	// Score should be in range
	if snap.BatchAnomalyScore < 0 || snap.BatchAnomalyScore > 1 {
		t.Errorf("BatchAnomalyScore = %.4f, want in [0,1]", snap.BatchAnomalyScore)
	}
	// Level must be set
	if snap.AnomalyLevel == "" {
		t.Error("AnomalyLevel is empty — isolation forest did not run")
	}

	t.Logf("Pattern with history: anomaly_score=%.4f level=%s type=%s",
		snap.BatchAnomalyScore, snap.AnomalyLevel, snap.AnomalyType)
}

// ── Grade A: Recommendation + Rule-Based Priority Score ──────────────────────

func TestGradeA_RecommendationService_PriorityScoreAndSort(t *testing.T) {
	pool, teardown := setupIntegrationDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("rec")
	now := time.Now().UTC()
	windowStart := now.Add(-24 * time.Hour)

	snapRepo := persistence.NewIntelligenceSnapshotRepo(pool)

	// Pre-create LEAKAGE snapshot (5% leakage → CRITICAL card)
	leakageSnap, _ := json.Marshal(LeakageSnapshot{
		LeakagePercentage:     0.06,
		TotalAmountMinor:      decimal.NewFromInt(6_000_000),
		UnmatchedIntentCount:  20,
		UnmatchedAmountMinor:  decimal.NewFromInt(2_000_000),
		ReversalCount:         5,
		ReversalExposureMinor: decimal.NewFromInt(500_000),
		AnomalyLevel:          "HIGH",
		ComputedAt:            now,
	})
	snapRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID: "snap_test_leakage_rec", TenantID: tenantID,
		SnapshotType: "LEAKAGE", ScopeType: "TENANT",
		WindowStart: windowStart, WindowEnd: now,
		ProjectionRefsJSON: []byte(`["leakage.total"]`),
		SnapshotJSON:       leakageSnap, CreatedAt: now,
	})

	// Pre-create AMBIGUITY snapshot (12% → CRITICAL card)
	ambSnap, _ := json.Marshal(AmbiguitySnapshot{
		AmbiguityRate:          0.12,
		ValueAtRiskMinor:       decimal.NewFromInt(1_200_000),
		ProviderRefMissingRate: 0.18,
		RiskTier:               "CRITICAL",
		RiskPredictionLevel:    "HIGH",
		RiskPredictionScore:    0.72,
		ComputedAt:             now,
	})
	snapRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID: "snap_test_ambiguity_rec", TenantID: tenantID,
		SnapshotType: "AMBIGUITY", ScopeType: "TENANT",
		WindowStart: windowStart, WindowEnd: now,
		ProjectionRefsJSON: []byte(`["ambiguity.summary"]`),
		SnapshotJSON:       ambSnap, CreatedAt: now,
	})

	// Pre-create DEFENSIBILITY snapshot (low audit ready → HIGH card)
	defSnap, _ := json.Marshal(DefensibilitySnapshot{
		AuditReadyPct:           0.60,
		GovernanceRejectedCount: 5,
		ReplayabilityPct:        0.50,
		DefensibilityScore:      55.0,
		DefensibilityTier:       "GOOD",
		ComputedAt:              now,
	})
	snapRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID: "snap_test_def_rec", TenantID: tenantID,
		SnapshotType: "DEFENSIBILITY", ScopeType: "TENANT",
		WindowStart: windowStart, WindowEnd: now,
		ProjectionRefsJSON: []byte(`["defensibility.summary"]`),
		SnapshotJSON:       defSnap, CreatedAt: now,
	})

	svc := NewRecommendationIntelligenceService(snapRepo)
	if err := svc.ComputeAndSave(ctx, tenantID, windowStart, now); err != nil {
		t.Fatalf("ComputeAndSave: %v", err)
	}

	var snap RecommendationSnapshot
	readLatestSnapshot(t, pool, tenantID, "RECOMMENDATION", &snap)

	// Must have produced cards
	if len(snap.Cards) == 0 {
		t.Fatal("no recommendation cards produced")
	}
	if snap.CriticalCount == 0 {
		t.Error("CriticalCount = 0, expected at least one CRITICAL card (leakage 6% + ambiguity 12%)")
	}

	// All cards must have PriorityScore > 0
	for i, c := range snap.Cards {
		if c.PriorityScore <= 0 {
			t.Errorf("card[%d] (%s/%s) PriorityScore = %.4f, want > 0", i, c.Priority, c.Action, c.PriorityScore)
		}
	}

	// Cards must be sorted: CRITICAL before HIGH before MEDIUM before LOW
	priorityOrder := map[string]int{"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
	for i := 1; i < len(snap.Cards); i++ {
		pi := priorityOrder[snap.Cards[i-1].Priority]
		pj := priorityOrder[snap.Cards[i].Priority]
		if pi > pj {
			t.Errorf("cards not sorted by priority: card[%d]=%s appears before card[%d]=%s",
				i-1, snap.Cards[i-1].Priority, i, snap.Cards[i].Priority)
		}
		// Within same tier, priority_score must be descending
		if pi == pj && snap.Cards[i-1].PriorityScore < snap.Cards[i].PriorityScore {
			t.Errorf("within tier %s: card[%d].PriorityScore=%.4f < card[%d].PriorityScore=%.4f — should be desc",
				snap.Cards[i-1].Priority, i-1, snap.Cards[i-1].PriorityScore, i, snap.Cards[i].PriorityScore)
		}
	}

	t.Logf("Recommendation: %d cards (CRITICAL=%d HIGH=%d MEDIUM=%d LOW=%d)",
		len(snap.Cards), snap.CriticalCount, snap.HighCount, snap.MediumCount, snap.LowCount)
	for i, c := range snap.Cards {
		t.Logf("  [%d] %s %-30s score=%.4f amount=%s", i, c.Priority, c.Action, c.PriorityScore, c.AmountAtStakeMinor)
	}
}
