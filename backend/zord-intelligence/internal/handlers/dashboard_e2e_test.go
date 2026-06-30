package handlers_test

// dashboard_e2e_test.go
//
// Integration tests for the five dashboard KPI endpoints.
// Requires a live PostgreSQL instance. Set TEST_DB_URL to run:
//
//	TEST_DB_URL=postgres://postgres:postgres@localhost:5432/zord_test go test ./internal/handlers/...
//
// Each test seeds its own isolated data using a unique tenant ID derived from
// the current nanosecond timestamp, so tests are safe to run in parallel and
// do not affect production data. Seeded rows are deleted in t.Cleanup.
//
// Coverage:
//   - Happy path: seeded snapshot / action rows → correct KPI values returned
//   - No-data: fresh tenant → data_available=false, reason present
//   - Missing tenant_id → 400 Bad Request
//   - Date range filtering: from_date / to_date excludes out-of-range snapshots
//   - Pattern: with and without batch_id query param
//   - Recommendation: APPROVED + DISMISSED + PENDING + EXPIRED seed
//     verifies formula: acceptance_rate = Accepted/Total, resolution_rate = Resolved/Total

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/handlers"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ── Test DB helpers ────────────────────────────────────────────────────────────

func setupE2EDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: TEST_DB_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect to test DB: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// uniqueTenant returns a tenant ID that is unique per test run.
func uniqueTenant(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
}

// seedSnapshot inserts one row into intelligence_snapshots and registers cleanup.
// windowStart is set to 24 h before now; windowEnd and created_at are set to now.
func seedSnapshot(
	t *testing.T,
	pool *pgxpool.Pool,
	snapID, tenantID, snapType, scopeType string,
	scopeRef *string,
	payload []byte,
) {
	t.Helper()
	now := time.Now().UTC()
	windowStart := now.Add(-24 * time.Hour)
	_, err := pool.Exec(context.Background(), `
		INSERT INTO intelligence_snapshots
			(snapshot_id, tenant_id, snapshot_type, scope_type, scope_ref,
			 window_start, window_end, projection_refs_json, snapshot_json,
			 model_version, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8,NULL,$9)
		ON CONFLICT (snapshot_id) DO NOTHING`,
		snapID, tenantID, snapType, scopeType, scopeRef,
		windowStart, now, payload, now,
	)
	if err != nil {
		t.Fatalf("seedSnapshot %s: %v", snapID, err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(),
			"DELETE FROM intelligence_snapshots WHERE snapshot_id = $1", snapID)
	})
}

// seedSnapshotAt inserts a snapshot with an explicit created_at for date-range tests.
func seedSnapshotAt(
	t *testing.T,
	pool *pgxpool.Pool,
	snapID, tenantID, snapType, scopeType string,
	scopeRef *string,
	payload []byte,
	createdAt time.Time,
) {
	t.Helper()
	windowStart := createdAt.Add(-24 * time.Hour)
	_, err := pool.Exec(context.Background(), `
		INSERT INTO intelligence_snapshots
			(snapshot_id, tenant_id, snapshot_type, scope_type, scope_ref,
			 window_start, window_end, projection_refs_json, snapshot_json,
			 model_version, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8,NULL,$9)
		ON CONFLICT (snapshot_id) DO NOTHING`,
		snapID, tenantID, snapType, scopeType, scopeRef,
		windowStart, createdAt, payload, createdAt,
	)
	if err != nil {
		t.Fatalf("seedSnapshotAt %s: %v", snapID, err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(),
			"DELETE FROM intelligence_snapshots WHERE snapshot_id = $1", snapID)
	})
}

// seedAction inserts one row into action_contracts with the given status.
func seedAction(t *testing.T, pool *pgxpool.Pool, actionID, tenantID, status string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO action_contracts
			(action_id, tenant_id, policy_id, policy_version,
			 scope_refs, input_refs_json, decision, confidence,
			 payload_json, signature, idempotency_key,
			 contract_status, created_at)
		VALUES
			($1,$2,'P_DASH_TEST',1,
			 '{"corridor_id":""}'::jsonb,'[]'::jsonb,
			 'ESCALATE',0.9,
			 '{"severity":"MEDIUM"}'::jsonb,'sig_test','idem_'||$1,
			 $3,now())
		ON CONFLICT (idempotency_key) DO NOTHING`,
		actionID, tenantID, status,
	)
	if err != nil {
		t.Fatalf("seedAction %s: %v", actionID, err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(),
			"DELETE FROM action_contracts WHERE action_id = $1", actionID)
	})
}

// decodeBody decodes a recorder body into a generic map.
func decodeBody(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&m); err != nil {
		t.Fatalf("decode response body: %v\nbody was: %s", err, rr.Body.String())
	}
	return m
}

// ── Leakage (KPIs 1-6) ────────────────────────────────────────────────────────

func TestDashboard_Leakage_HappyPath(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_leak")

	seedSnapshot(t, pool, "snap_e2e_leak_001", tenantID, "LEAKAGE", "TENANT", nil, []byte(`{
		"total_intended_amount_minor": 1000000,
		"unmatched_amount_minor":      80000,
		"under_settlement_amount_minor": 30000,
		"orphan_amount_minor":          10000,
		"reversal_exposure_minor":       5000,
		"leakage_percentage":            0.08,
		"risk_tier":                     "HIGH"
	}`))

	h := handlers.NewDashboardLeakageHandler(persistence.NewIntelligenceSnapshotRepo(pool), persistence.NewBatchContractRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/leakage?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetLeakageKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)

	if resp["data_available"] != true {
		t.Errorf("data_available: want true, got %v", resp["data_available"])
	}
	if resp["risk_tier"] != "HIGH" {
		t.Errorf("risk_tier: want HIGH, got %v", resp["risk_tier"])
	}
	if resp["leakage_percentage"].(float64) != 0.08 {
		t.Errorf("leakage_percentage: want 0.08, got %v", resp["leakage_percentage"])
	}
	for _, field := range []string{
		"total_intended_amount_minor",
		"unmatched_amount_minor",
		"under_settlement_amount_minor",
		"orphan_amount_minor",
		"reversal_exposure_minor",
	} {
		if resp[field] == nil {
			t.Errorf("field %s missing from response", field)
		}
	}
}

func TestDashboard_Leakage_NoData(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_leak_empty")

	h := handlers.NewDashboardLeakageHandler(persistence.NewIntelligenceSnapshotRepo(pool), persistence.NewBatchContractRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/leakage?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetLeakageKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("data_available: want false for fresh tenant, got %v", resp["data_available"])
	}
	if resp["reason"] == nil || resp["reason"] == "" {
		t.Error("expected reason field when data_available=false")
	}
}

func TestDashboard_Leakage_MissingTenantID(t *testing.T) {
	pool := setupE2EDB(t)

	h := handlers.NewDashboardLeakageHandler(persistence.NewIntelligenceSnapshotRepo(pool), persistence.NewBatchContractRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet, "/v1/intelligence/dashboard/leakage", nil)
	rr := httptest.NewRecorder()
	h.GetLeakageKPIs(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["error"] == nil {
		t.Error("expected error field in 400 response")
	}
}

func TestDashboard_Leakage_DateRangeFilter(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_leak_dates")

	old := time.Now().UTC().AddDate(-1, 0, 0) // 1 year ago
	recent := time.Now().UTC()

	// Seed old snapshot — should be excluded by from_date filter.
	seedSnapshotAt(t, pool, "snap_e2e_leak_old", tenantID, "LEAKAGE", "TENANT", nil,
		[]byte(`{"leakage_percentage":0.50,"risk_tier":"CRITICAL"}`), old)

	// Seed recent snapshot — should be returned.
	seedSnapshotAt(t, pool, "snap_e2e_leak_new", tenantID, "LEAKAGE", "TENANT", nil,
		[]byte(`{"leakage_percentage":0.02,"risk_tier":"LOW"}`), recent)

	h := handlers.NewDashboardLeakageHandler(persistence.NewIntelligenceSnapshotRepo(pool), persistence.NewBatchContractRepo(pool), "GRADE_A")
	// from_date set to yesterday — old snapshot is excluded, recent is within range.
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/leakage?tenant_id="+tenantID+"&from_date="+yesterday, nil)
	rr := httptest.NewRecorder()
	h.GetLeakageKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != true {
		t.Fatalf("want data_available=true, got %v", resp["data_available"])
	}
	if resp["risk_tier"] != "LOW" {
		t.Errorf("expected recent snapshot (risk_tier=LOW), got risk_tier=%v", resp["risk_tier"])
	}
}

// ── Ambiguity (KPIs 7-10) ─────────────────────────────────────────────────────

func TestDashboard_Ambiguity_HappyPath(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_ambig")

	seedSnapshot(t, pool, "snap_e2e_ambig_001", tenantID, "AMBIGUITY", "TENANT", nil, []byte(`{
		"ambiguous_intent_count":    45,
		"ambiguity_rate":             0.15,
		"avg_attachment_confidence": 0.72,
		"provider_ref_missing_rate": 0.03,
		"ambiguous_amount_minor":    120000,
		"value_at_risk_minor":       350000,
		"risk_tier":                 "MEDIUM"
	}`))

	h := handlers.NewDashboardAmbiguityHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/ambiguity?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetAmbiguityKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)

	if resp["data_available"] != true {
		t.Errorf("data_available: want true, got %v", resp["data_available"])
	}
	if resp["ambiguity_rate"].(float64) != 0.15 {
		t.Errorf("ambiguity_rate: want 0.15, got %v", resp["ambiguity_rate"])
	}
	if int(resp["ambiguous_intent_count"].(float64)) != 45 {
		t.Errorf("ambiguous_intent_count: want 45, got %v", resp["ambiguous_intent_count"])
	}
	if resp["avg_attachment_confidence"].(float64) != 0.72 {
		t.Errorf("avg_attachment_confidence: want 0.72, got %v", resp["avg_attachment_confidence"])
	}
	if resp["provider_ref_missing_rate"].(float64) != 0.03 {
		t.Errorf("provider_ref_missing_rate: want 0.03, got %v", resp["provider_ref_missing_rate"])
	}
	if got := fmt.Sprint(resp["value_at_risk_minor"]); got != "120000" {
		t.Errorf("value_at_risk_minor: want ambiguous_amount_minor 120000, got %v", resp["value_at_risk_minor"])
	}
}

func TestDashboard_Ambiguity_NoData(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_ambig_empty")

	h := handlers.NewDashboardAmbiguityHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/ambiguity?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetAmbiguityKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("want data_available=false, got %v", resp["data_available"])
	}
}

func TestDashboard_Ambiguity_MissingTenantID(t *testing.T) {
	pool := setupE2EDB(t)

	h := handlers.NewDashboardAmbiguityHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet, "/v1/intelligence/dashboard/ambiguity", nil)
	rr := httptest.NewRecorder()
	h.GetAmbiguityKPIs(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
}

// ── Defensibility (KPIs 11-13) ────────────────────────────────────────────────

func TestDashboard_Defensibility_HappyPath(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_def")

	seedSnapshot(t, pool, "snap_e2e_def_001", tenantID, "DEFENSIBILITY", "TENANT", nil, []byte(`{
		"evidence_pack_rate":      0.92,
		"governance_coverage_pct": 0.88,
		"replayability_pct":       0.95,
		"defensibility_score":     60.0,
		"defensibility_tier":      "STRONG",
		"audit_ready_pct":         0.93,
		"dispute_ready_pct":       0.89
	}`))

	h := handlers.NewDashboardDefensibilityHandler(persistence.NewIntelligenceSnapshotRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/defensibility?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetDefensibilityKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)

	if resp["data_available"] != true {
		t.Errorf("data_available: want true, got %v", resp["data_available"])
	}
	if resp["evidence_pack_rate"].(float64) != 0.92 {
		t.Errorf("evidence_pack_rate: want 0.92, got %v", resp["evidence_pack_rate"])
	}
	if resp["governance_coverage_pct"].(float64) != 0.88 {
		t.Errorf("governance_coverage_pct: want 0.88, got %v", resp["governance_coverage_pct"])
	}
	if resp["replayability_pct"].(float64) != 0.95 {
		t.Errorf("replayability_pct: want 0.95, got %v", resp["replayability_pct"])
	}
	if resp["defensibility_tier"] != "STRONG" {
		t.Errorf("defensibility_tier: want STRONG, got %v", resp["defensibility_tier"])
	}
}

func TestDashboard_Defensibility_NoData(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_def_empty")

	h := handlers.NewDashboardDefensibilityHandler(persistence.NewIntelligenceSnapshotRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/defensibility?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetDefensibilityKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("want data_available=false, got %v", resp["data_available"])
	}
}

func TestDashboard_Defensibility_MissingTenantID(t *testing.T) {
	pool := setupE2EDB(t)

	h := handlers.NewDashboardDefensibilityHandler(persistence.NewIntelligenceSnapshotRepo(pool), "GRADE_A")
	req := httptest.NewRequest(http.MethodGet, "/v1/intelligence/dashboard/defensibility", nil)
	rr := httptest.NewRecorder()
	h.GetDefensibilityKPIs(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
}

// ── Pattern (KPI 14) ──────────────────────────────────────────────────────────

func TestDashboard_Pattern_HappyPath_NoBatchID(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_pat")
	batchID := "batch_e2e_001"

	seedSnapshot(t, pool, "snap_e2e_pat_001", tenantID, "PATTERN", "BATCH", &batchID, []byte(`{
		"batch_id":           "batch_e2e_001",
		"batch_anomaly_score": 0.73,
		"anomaly_level":       "ELEVATED",
		"anomaly_type":        "VOLUME_SPIKE",
		"batch_risk_score":    0.65,
		"risk_tier":           "MEDIUM",
		"finality_status":     "COMPLETE",
		"total_count":         120,
		"success_count":       98,
		"failed_count":        15,
		"pending_count":       7
	}`))

	h := handlers.NewDashboardPatternHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/patterns?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetPatternKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)

	if resp["data_available"] != true {
		t.Errorf("data_available: want true, got %v", resp["data_available"])
	}
	if resp["batch_anomaly_score"].(float64) != 0.73 {
		t.Errorf("batch_anomaly_score: want 0.73, got %v", resp["batch_anomaly_score"])
	}
	if resp["anomaly_level"] != "ELEVATED" {
		t.Errorf("anomaly_level: want ELEVATED, got %v", resp["anomaly_level"])
	}
	if resp["batch_id"] != batchID {
		t.Errorf("batch_id: want %s, got %v", batchID, resp["batch_id"])
	}
}

func TestDashboard_Pattern_HappyPath_WithBatchID(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_pat_scoped")
	batchA := "batch_e2e_A"
	batchB := "batch_e2e_B"

	// Seed two different batch snapshots for the same tenant.
	seedSnapshot(t, pool, "snap_e2e_pat_A", tenantID, "PATTERN", "BATCH", &batchA, []byte(`{
		"batch_id":"batch_e2e_A","batch_anomaly_score":0.20,"anomaly_level":"NORMAL"
	}`))
	seedSnapshot(t, pool, "snap_e2e_pat_B", tenantID, "PATTERN", "BATCH", &batchB, []byte(`{
		"batch_id":"batch_e2e_B","batch_anomaly_score":0.85,"anomaly_level":"HIGH"
	}`))

	h := handlers.NewDashboardPatternHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, "GRADE_A")

	// Request scoped to batch A — should not return batch B.
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/patterns?tenant_id="+tenantID+"&batch_id="+batchA, nil)
	rr := httptest.NewRecorder()
	h.GetPatternKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)
	if resp["anomaly_level"] != "NORMAL" {
		t.Errorf("expected batch A (anomaly_level=NORMAL), got %v", resp["anomaly_level"])
	}
}

func TestDashboard_Pattern_NoData(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_pat_empty")

	h := handlers.NewDashboardPatternHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/patterns?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetPatternKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("want data_available=false, got %v", resp["data_available"])
	}
}

func TestDashboard_Pattern_MissingTenantID(t *testing.T) {
	pool := setupE2EDB(t)

	h := handlers.NewDashboardPatternHandler(persistence.NewIntelligenceSnapshotRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet, "/v1/intelligence/dashboard/patterns", nil)
	rr := httptest.NewRecorder()
	h.GetPatternKPIs(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
}

// ── Recommendation (KPIs 15-16) ───────────────────────────────────────────────
//
// Seed:
//   5 total (excluding EXPIRED)       PENDING x2, APPROVED x2, DISMISSED x1
//   1 EXPIRED                         excluded from Total
//
// Expected:
//   acceptance_rate = 2/5 = 0.40
//   resolution_rate = 3/5 = 0.60  (APPROVED + DISMISSED)

func TestDashboard_Recommendation_HappyPath(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_rec")

	ns := time.Now().UnixNano()
	seedAction(t, pool, fmt.Sprintf("act_rec_pend1_%d", ns), tenantID, "PENDING_APPROVAL")
	seedAction(t, pool, fmt.Sprintf("act_rec_pend2_%d", ns), tenantID, "PENDING_APPROVAL")
	seedAction(t, pool, fmt.Sprintf("act_rec_appr1_%d", ns), tenantID, "APPROVED")
	seedAction(t, pool, fmt.Sprintf("act_rec_appr2_%d", ns), tenantID, "APPROVED")
	seedAction(t, pool, fmt.Sprintf("act_rec_dism1_%d", ns), tenantID, "DISMISSED")
	seedAction(t, pool, fmt.Sprintf("act_rec_expr1_%d", ns), tenantID, "EXPIRED") // excluded

	h := handlers.NewDashboardRecommendationHandler(persistence.NewActionContractRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/recommendations?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetRecommendationKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d — %s", rr.Code, rr.Body)
	}
	resp := decodeBody(t, rr)

	if resp["data_available"] != true {
		t.Errorf("data_available: want true, got %v", resp["data_available"])
	}
	if int(resp["total_actions"].(float64)) != 5 {
		t.Errorf("total_actions: want 5 (EXPIRED excluded), got %v", resp["total_actions"])
	}
	if int(resp["accepted_actions"].(float64)) != 2 {
		t.Errorf("accepted_actions: want 2, got %v", resp["accepted_actions"])
	}
	if int(resp["resolved_actions"].(float64)) != 3 {
		t.Errorf("resolved_actions: want 3 (APPROVED+DISMISSED), got %v", resp["resolved_actions"])
	}

	const eps = 1e-9
	acceptRate := resp["action_acceptance_rate"].(float64)
	if absf(acceptRate-0.40) > eps {
		t.Errorf("action_acceptance_rate: want 0.40, got %.6f", acceptRate)
	}
	resolveRate := resp["action_resolution_rate"].(float64)
	if absf(resolveRate-0.60) > eps {
		t.Errorf("action_resolution_rate: want 0.60, got %.6f", resolveRate)
	}
}

func TestDashboard_Recommendation_NoData(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_rec_empty")

	h := handlers.NewDashboardRecommendationHandler(persistence.NewActionContractRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/recommendations?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetRecommendationKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("want data_available=false, got %v", resp["data_available"])
	}
	if resp["reason"] == nil || resp["reason"] == "" {
		t.Error("expected reason field when no contracts exist")
	}
}

func TestDashboard_Recommendation_OnlyExpired(t *testing.T) {
	pool := setupE2EDB(t)
	tenantID := uniqueTenant("tnt_rec_expired")

	ns := time.Now().UnixNano()
	// Seed only EXPIRED rows — all excluded from Total → no_data path.
	seedAction(t, pool, fmt.Sprintf("act_rec_xp1_%d", ns), tenantID, "EXPIRED")
	seedAction(t, pool, fmt.Sprintf("act_rec_xp2_%d", ns), tenantID, "EXPIRED")

	h := handlers.NewDashboardRecommendationHandler(persistence.NewActionContractRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet,
		"/v1/intelligence/dashboard/recommendations?tenant_id="+tenantID, nil)
	rr := httptest.NewRecorder()
	h.GetRecommendationKPIs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	resp := decodeBody(t, rr)
	if resp["data_available"] != false {
		t.Errorf("all-EXPIRED tenant: want data_available=false, got %v", resp["data_available"])
	}
}

func TestDashboard_Recommendation_MissingTenantID(t *testing.T) {
	pool := setupE2EDB(t)

	h := handlers.NewDashboardRecommendationHandler(persistence.NewActionContractRepo(pool), nil, "GRADE_A")
	req := httptest.NewRequest(http.MethodGet, "/v1/intelligence/dashboard/recommendations", nil)
	rr := httptest.NewRecorder()
	h.GetRecommendationKPIs(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func absf(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
