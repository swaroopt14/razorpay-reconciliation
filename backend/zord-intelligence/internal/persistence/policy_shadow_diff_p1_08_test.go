package persistence_test

// policy_shadow_diff_p1_08_test.go — corrective-action-report P1-08 (shadow-
// diff incident dedup). TEST_DB_URL-gated (see setupTestDB in
// projection_repo_test.go).

import (
	"context"
	"testing"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// TestPolicyRepo_ComparePolicyOldVsNew_DedupesRepeatedMismatch forces a
// policy_registry/policy_definitions drift (by updating only the old-table
// side directly, bypassing the normal dual-write) and verifies:
//  1. the first mismatch creates exactly one refactor_shadow_diffs row
//  2. calling the comparison again with the SAME drift updates that same
//     row (occurrence_count increments) instead of inserting a second row
//  3. a DIFFERENT drift (new old_payload_hash) creates a genuinely new row
func TestPolicyRepo_ComparePolicyOldVsNew_DedupesRepeatedMismatch(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("shadowdiff_dedup")
	p := models.Policy{
		PolicyID: policyID, Version: 1, ScopeType: "corridor",
		TriggerType: "event", TriggerValue: "outcome.event.normalized",
		DSL: "WHEN corridor.success_rate_1h < 0.90 THEN ESCALATE severity=HIGH",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	// Diverge only the old-table side, bypassing the normal dual-write, to
	// force a comparable mismatch — the direct SQL equivalent of a bug that
	// updates policy_registry without also updating policy_definitions.
	if _, err := pool.Exec(ctx, `UPDATE policy_registry SET dsl = $2 WHERE policy_id = $1`,
		policyID, "WHEN corridor.success_rate_1h < 0.80 THEN ESCALATE severity=HIGH"); err != nil {
		t.Fatalf("diverge old side: %v", err)
	}

	matched, err := repo.ComparePolicyOldVsNew(ctx, policyID)
	if err != nil {
		t.Fatalf("ComparePolicyOldVsNew (1st): %v", err)
	}
	if matched {
		t.Fatal("expected a mismatch after diverging policy_registry.dsl, got matched=true")
	}

	rowCount := func() int {
		var n int
		if err := pool.QueryRow(ctx, `
			SELECT count(*) FROM refactor_shadow_diffs
			WHERE diff_family = 'policy_registry' AND scope_ref = $1
		`, policyID).Scan(&n); err != nil {
			t.Fatalf("count refactor_shadow_diffs: %v", err)
		}
		return n
	}
	occurrenceCount := func() int {
		var n int
		if err := pool.QueryRow(ctx, `
			SELECT occurrence_count FROM refactor_shadow_diffs
			WHERE diff_family = 'policy_registry' AND scope_ref = $1
		`, policyID).Scan(&n); err != nil {
			t.Fatalf("select occurrence_count: %v", err)
		}
		return n
	}

	if got := rowCount(); got != 1 {
		t.Fatalf("after 1st mismatch: refactor_shadow_diffs row count = %d, want 1", got)
	}
	if got := occurrenceCount(); got != 1 {
		t.Fatalf("after 1st mismatch: occurrence_count = %d, want 1", got)
	}

	// Same drift, compared again — must upsert the SAME row, not insert a
	// second one. This is the exact bug P1-08 fixes: before this change,
	// every 15-minute worker tick inserted a brand new row for an unchanged,
	// still-open mismatch.
	matched, err = repo.ComparePolicyOldVsNew(ctx, policyID)
	if err != nil {
		t.Fatalf("ComparePolicyOldVsNew (2nd, same drift): %v", err)
	}
	if matched {
		t.Fatal("expected the same mismatch to still be reported, got matched=true")
	}
	if got := rowCount(); got != 1 {
		t.Fatalf("after repeated identical mismatch: refactor_shadow_diffs row count = %d, want 1 (deduped)", got)
	}
	if got := occurrenceCount(); got != 2 {
		t.Fatalf("after repeated identical mismatch: occurrence_count = %d, want 2", got)
	}

	// A genuinely different drift (new dsl value → new old_payload_hash)
	// must create a distinct row — "changed mismatch creates a new
	// revision," not silently folded into the first incident.
	if _, err := pool.Exec(ctx, `UPDATE policy_registry SET dsl = $2 WHERE policy_id = $1`,
		policyID, "WHEN corridor.success_rate_1h < 0.70 THEN ESCALATE severity=HIGH"); err != nil {
		t.Fatalf("diverge old side again: %v", err)
	}
	matched, err = repo.ComparePolicyOldVsNew(ctx, policyID)
	if err != nil {
		t.Fatalf("ComparePolicyOldVsNew (3rd, different drift): %v", err)
	}
	if matched {
		t.Fatal("expected a mismatch after a second, different divergence, got matched=true")
	}
	if got := rowCount(); got != 2 {
		t.Fatalf("after a genuinely different mismatch: refactor_shadow_diffs row count = %d, want 2", got)
	}
}
