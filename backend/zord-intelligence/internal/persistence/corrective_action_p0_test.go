package persistence_test

// corrective_action_p0_test.go — TEST_DB_URL-gated integration tests (see
// setupTestDB in projection_repo_test.go) that directly exercise the P0
// fixes from the 2026-07-23 corrective action report which real live
// traffic had NOT yet touched (no policy is enabled by default, so no
// action ever gets created, and no genuine payload-hash conflict has
// naturally occurred). These tests simulate the upstream scenarios at the
// same entry points zord-intelligence's own Kafka consumer/handlers use
// (EventReceiptRepo.RunOnce, PolicyRepo), so a pass here is a real
// end-to-end proof of the repo-level behavior, independent of the upstream
// pipeline's own unrelated issues.

import (
	"context"
	"testing"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// TestEventReceiptRepo_ConflictDetectedAndBlocked simulates the exact P0-03
// scenario from the corrective action report: the same event_id arriving
// twice with different payload bytes. Before the fix this was only logged;
// after the fix it must be persisted as a queryable, blocking incident and
// the conflicting delivery's handler must never run.
func TestEventReceiptRepo_ConflictDetectedAndBlocked(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewEventReceiptRepo(pool, "test-owner", 5*time.Minute)

	tenantID := uniqueTenant("conflict")
	const source = "test-source"
	const eventID = "evt_conflict_test"

	callCount := 0
	fn := func(txCtx context.Context) error {
		callCount++
		return nil
	}

	// First delivery: processes normally.
	m1 := persistence.EventMeta{
		TenantID: tenantID, EventSource: source, EventType: "test.event",
		EventVersion: "v1", EventID: eventID, PayloadHash: "hash_A",
	}
	skipped, err := repo.RunOnce(ctx, m1, fn)
	if err != nil || skipped {
		t.Fatalf("first delivery: skipped=%v err=%v, want skipped=false err=nil", skipped, err)
	}
	if callCount != 1 {
		t.Fatalf("callCount = %d after first delivery, want 1", callCount)
	}

	// Second delivery: same event id, DIFFERENT payload hash -> conflict.
	// fn must NOT run; the delivery is reported as skipped, not an error.
	m2 := m1
	m2.PayloadHash = "hash_B_DIFFERENT"
	skipped, err = repo.RunOnce(ctx, m2, fn)
	if err != nil {
		t.Fatalf("conflicting delivery returned error: %v", err)
	}
	if !skipped {
		t.Fatal("conflicting delivery should report skipped=true (fn must not run)")
	}
	if callCount != 1 {
		t.Fatalf("callCount = %d after conflicting delivery, want still 1 (handler must never run on conflict)", callCount)
	}

	var status string
	if err := pool.QueryRow(ctx, `
		SELECT processing_status FROM event_receipts
		WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3
	`, tenantID, source, eventID).Scan(&status); err != nil {
		t.Fatalf("select processing_status: %v", err)
	}
	if status != "CONFLICTED" {
		t.Errorf("processing_status = %q, want CONFLICTED", status)
	}

	var storedHash, incomingHash string
	var occurrenceCount int
	if err := pool.QueryRow(ctx, `
		SELECT stored_payload_hash, incoming_payload_hash, occurrence_count
		FROM event_receipt_conflicts
		WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3
	`, tenantID, source, eventID).Scan(&storedHash, &incomingHash, &occurrenceCount); err != nil {
		t.Fatalf("select event_receipt_conflicts: %v", err)
	}
	if storedHash != "hash_A" || incomingHash != "hash_B_DIFFERENT" {
		t.Errorf("conflict hashes = (%q, %q), want (hash_A, hash_B_DIFFERENT)", storedHash, incomingHash)
	}
	if occurrenceCount != 1 {
		t.Errorf("occurrence_count = %d, want 1", occurrenceCount)
	}

	// Third delivery: same conflicting hash redelivered -> occurrence_count
	// bumps to 2, still skipped, fn still never runs.
	skipped, err = repo.RunOnce(ctx, m2, fn)
	if err != nil || !skipped {
		t.Fatalf("redelivered conflict: skipped=%v err=%v, want skipped=true err=nil", skipped, err)
	}
	if callCount != 1 {
		t.Fatalf("callCount = %d after redelivered conflict, want still 1", callCount)
	}
	if err := pool.QueryRow(ctx, `
		SELECT occurrence_count FROM event_receipt_conflicts
		WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3
	`, tenantID, source, eventID).Scan(&occurrenceCount); err != nil {
		t.Fatalf("select occurrence_count: %v", err)
	}
	if occurrenceCount != 2 {
		t.Errorf("occurrence_count after redelivery = %d, want 2", occurrenceCount)
	}

	// Fourth delivery: the ORIGINAL (matching) hash arrives again while the
	// receipt is CONFLICTED — a harmless duplicate must still be skipped
	// without running fn or touching the conflict record.
	skipped, err = repo.RunOnce(ctx, m1, fn)
	if err != nil || !skipped {
		t.Fatalf("harmless duplicate while CONFLICTED: skipped=%v err=%v, want skipped=true err=nil", skipped, err)
	}
	if callCount != 1 {
		t.Fatalf("callCount = %d after harmless duplicate, want still 1", callCount)
	}
}

// TestPolicyRepo_DefinitionLookup_TenantIsolation simulates the P0-05 drift
// scenario the report describes: a policy_definitions row for the same
// policy_key/version belonging to a DIFFERENT tenant, inserted more
// recently than the real one. Before the fix, policyDefinitionCols'
// "ORDER BY created_at DESC LIMIT 1" with no tenant predicate would pick
// this newer, wrong-tenant row; the fix's tenant match must prevent that.
func TestPolicyRepo_DefinitionLookup_TenantIsolation(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("tenantiso")
	tenantA := uniqueTenant("polA")

	p := models.Policy{
		PolicyID: policyID, Version: 1, TenantID: tenantA, ScopeType: "tenant",
		TriggerType: "event", TriggerValue: "outcome.event.normalized",
		DSL: "WHEN corridor.success_rate_1h < 0.90 THEN ESCALATE severity=HIGH",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	tenantB := uniqueTenant("polB")
	if _, err := pool.Exec(ctx, `
		INSERT INTO policy_definitions
			(tenant_id, policy_key, policy_version, policy_source, scope_type,
			 trigger_type, trigger_value, dsl, policy_digest, created_at)
		VALUES ($1, $2, 1, 'zpi_seed_legacy', 'tenant', 'event', 'outcome.event.normalized',
		        'WHEN x THEN y', 'WRONG_TENANT_B_DIGEST', now() + interval '1 hour')
	`, tenantB, policyID); err != nil {
		t.Fatalf("seed drifted cross-tenant policy_definitions row: %v", err)
	}

	got, err := repo.GetByID(ctx, policyID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got == nil {
		t.Fatal("GetByID returned nil for a just-inserted policy")
	}
	if got.PolicyDigest == "WRONG_TENANT_B_DIGEST" {
		t.Fatal("cross-tenant leak: GetByID returned tenant B's digest for tenant A's policy")
	}
	if got.PolicyDigest == "" {
		t.Error("expected tenant A's own digest, got empty string")
	}
}

// TestPolicyDefinitions_DuplicateGlobalVersionRejected simulates the P0-06
// scenario: two global (NULL tenant_id) policy_definitions rows for the
// same key/version/source. Before the fix, plain UNIQUE treats every NULL
// as distinct, so this silently succeeded; UNIQUE NULLS NOT DISTINCT must
// reject the second insert.
func TestPolicyDefinitions_DuplicateGlobalVersionRejected(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()

	policyKey := uniquePolicyID("globaldup")
	insertGlobal := func() error {
		_, err := pool.Exec(ctx, `
			INSERT INTO policy_definitions
				(tenant_id, policy_key, policy_version, policy_source, scope_type,
				 trigger_type, trigger_value, dsl, policy_digest)
			VALUES (NULL, $1, 1, 'ops_api', 'tenant', 'event', 'outcome.event.normalized',
			        'WHEN x THEN y', 'digest1')
		`, policyKey)
		return err
	}
	if err := insertGlobal(); err != nil {
		t.Fatalf("first global insert: %v", err)
	}
	if err := insertGlobal(); err == nil {
		t.Fatal("expected second global (NULL tenant) insert with same key/version/source to violate uniqueness, got no error")
	}
}

// TestPolicyActivations_NoOverlap simulates the P0-06 activation-overlap
// scenario: after real SetEnabled toggles, exactly one open-ended
// (effective_to IS NULL) activation row must exist, and a direct attempt to
// insert a second concurrently-open row for the same policy must be
// rejected by uq_policy_activations_open.
func TestPolicyActivations_NoOverlap(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewPolicyRepo(pool)

	policyID := uniquePolicyID("actoverlap")
	p := models.Policy{
		PolicyID: policyID, Version: 1, ScopeType: "tenant",
		TriggerType: "cron", TriggerValue: "*/5 * * * *",
		DSL: "WHEN tenant.sla_breach_rate > 0.05 THEN ESCALATE severity=MEDIUM",
	}
	if err := repo.Insert(ctx, p); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	for _, enabled := range []bool{true, false, true, false} {
		if err := repo.SetEnabled(ctx, policyID, enabled, "test_actor"); err != nil {
			t.Fatalf("SetEnabled(%v): %v", enabled, err)
		}
	}

	var policyRegistryID string
	if err := pool.QueryRow(ctx, `
		SELECT policy_registry_id FROM policy_definitions WHERE policy_key=$1
	`, policyID).Scan(&policyRegistryID); err != nil {
		t.Fatalf("lookup policy_registry_id: %v", err)
	}

	var openCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM policy_activations
		WHERE policy_registry_id=$1 AND effective_to IS NULL
	`, policyRegistryID).Scan(&openCount); err != nil {
		t.Fatalf("count open rows: %v", err)
	}
	if openCount != 1 {
		t.Errorf("open (effective_to IS NULL) activation rows = %d, want exactly 1 after Insert + 4 SetEnabled toggles", openCount)
	}

	// Direct attack on the invariant: manually try to insert a second
	// concurrently-open row for the same policy_registry_id.
	if _, err := pool.Exec(ctx, `
		INSERT INTO policy_activations (tenant_id, policy_registry_id, enabled, activated_by)
		VALUES (NULL, $1, true, 'test-attack')
	`, policyRegistryID); err == nil {
		t.Fatal("expected uq_policy_activations_open to reject a second concurrently-open row, got no error")
	}
}
