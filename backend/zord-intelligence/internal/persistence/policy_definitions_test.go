package persistence_test

// policy_definitions_test.go — Phase 5 (refactor) integration tests for the
// policy_registry → policy_definitions/policy_activations dual-write and its
// shadow-diff comparison. TEST_DB_URL-gated (see setupTestDB in
// projection_repo_test.go), against a freshly-initialized DB (db/init.sql
// already carries the Phase 5 CREATE TABLE statements, so no separate
// migration step is needed for a fresh test container).

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

func uniquePolicyID(label string) string {
	return "P_TEST_" + label + "_" + time.Now().UTC().Format("20060102150405.000000000")
}

type policyDefRow struct {
	PolicyRegistryID string
	Enabled          bool
	ActivationCount  int
}

func readLatestPolicyDefAndActivationCount(t *testing.T, pool *pgxpool.Pool, policyID string) policyDefRow {
	t.Helper()
	var row policyDefRow
	err := pool.QueryRow(context.Background(), `
		SELECT pd.policy_registry_id,
		       COALESCE((SELECT pa.enabled FROM policy_activations pa
		                 WHERE pa.policy_registry_id = pd.policy_registry_id
		                 ORDER BY pa.created_at DESC LIMIT 1), false),
		       (SELECT count(*) FROM policy_activations pa WHERE pa.policy_registry_id = pd.policy_registry_id)
		FROM policy_definitions pd
		WHERE pd.policy_key = $1
	`, policyID).Scan(&row.PolicyRegistryID, &row.Enabled, &row.ActivationCount)
	if err != nil {
		t.Fatalf("readLatestPolicyDefAndActivationCount id=%s: %v", policyID, err)
	}
	return row
}

// TestPolicyRepo_Insert_DualWritesDefinitionAndActivation verifies that
// creating a new policy via PolicyRepo.Insert produces both a
// policy_definitions row (immutable rule content + digest) and an initial,
// disabled policy_activations row — without changing Insert's signature or
// its policy_registry write, which stays the source of truth for the hot
// evaluation path (GetByTrigger etc.).
func TestPolicyRepo_Insert_DualWritesDefinitionAndActivation(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("insert")
	p := models.Policy{
		PolicyID:     policyID,
		Version:      1,
		ScopeType:    "tenant",
		TriggerType:  "event",
		TriggerValue: "outcome.event.normalized",
		DSL:          "WHEN corridor.failure_rate_1h > 0.10 THEN ESCALATE severity=HIGH",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	row := readLatestPolicyDefAndActivationCount(t, pool, policyID)
	if row.PolicyRegistryID == "" {
		t.Fatal("expected a policy_definitions row after Insert, found none")
	}
	if row.Enabled {
		t.Error("new policy's dual-written activation should start disabled (enabled=true, want false)")
	}
	if row.ActivationCount != 1 {
		t.Errorf("ActivationCount = %d, want 1 (the initial disabled activation)", row.ActivationCount)
	}

	// GetByID must surface the same policy_registry_id/digest for
	// action_service.go to stamp onto new ActionContracts.
	got, err := repo.GetByID(ctx, policyID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got == nil {
		t.Fatal("GetByID returned nil for a just-inserted policy")
	}
	if got.PolicyRegistryID != row.PolicyRegistryID {
		t.Errorf("GetByID PolicyRegistryID = %q, want %q (from policy_definitions)", got.PolicyRegistryID, row.PolicyRegistryID)
	}
	if got.PolicyDigest == "" {
		t.Error("GetByID PolicyDigest is empty, want a sha256 hex digest")
	}
}

// TestPolicyRepo_SetEnabled_AppendsActivationHistory verifies SetEnabled
// appends a NEW immutable policy_activations row on every toggle rather than
// mutating a past one — the whole point of separating "definition" from
// "activation" (blueprint §5).
func TestPolicyRepo_SetEnabled_AppendsActivationHistory(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("setenabled")
	p := models.Policy{
		PolicyID: policyID, Version: 1, ScopeType: "tenant",
		TriggerType: "cron", TriggerValue: "*/5 * * * *",
		DSL: "WHEN tenant.sla_breach_rate > 0.05 THEN ESCALATE severity=MEDIUM",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	// toggle ON, then OFF, then ON again — 4 activation rows total
	// (1 initial-disabled from Insert + 3 toggles).
	for _, enabled := range []bool{true, false, true} {
		if err := repo.SetEnabled(ctx, policyID, enabled); err != nil {
			t.Fatalf("SetEnabled(%v): %v", enabled, err)
		}
	}

	row := readLatestPolicyDefAndActivationCount(t, pool, policyID)
	if !row.Enabled {
		t.Error("latest activation should be enabled=true after ON/OFF/ON, got false")
	}
	if row.ActivationCount != 4 {
		t.Errorf("ActivationCount = %d, want 4 (never mutates a past row)", row.ActivationCount)
	}
}

// TestPolicyRepo_ComparePolicyOldVsNew_MatchesAfterInsert verifies the
// shadow-diff comparison reports a clean match right after a normal
// Insert — the common case, and the one the scheduled shadow-diff worker
// (shadow_diff_worker.go) will observe for every correctly dual-written policy.
func TestPolicyRepo_ComparePolicyOldVsNew_MatchesAfterInsert(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("shadowdiff")
	p := models.Policy{
		PolicyID: policyID, Version: 1, ScopeType: "corridor",
		TriggerType: "event", TriggerValue: "outcome.event.normalized",
		DSL: "WHEN corridor.success_rate_1h < 0.90 THEN ESCALATE severity=HIGH",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	matched, err := repo.ComparePolicyOldVsNew(ctx, policyID)
	if err != nil {
		t.Fatalf("ComparePolicyOldVsNew: %v", err)
	}
	if !matched {
		t.Error("expected ComparePolicyOldVsNew to report a match right after Insert, got mismatch")
	}

	var mismatchCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM refactor_shadow_diffs
		WHERE diff_family = 'policy_registry' AND scope_ref = $1
	`, policyID).Scan(&mismatchCount); err != nil {
		t.Fatalf("count refactor_shadow_diffs: %v", err)
	}
	if mismatchCount != 0 {
		t.Errorf("refactor_shadow_diffs has %d row(s) for a policy that should match cleanly, want 0", mismatchCount)
	}
}
