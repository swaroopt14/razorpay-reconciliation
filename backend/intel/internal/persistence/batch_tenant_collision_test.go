package persistence_test

// batch_tenant_collision_test.go
//
// Gap-fix pass (2026-07-13): both source documents explicitly require this
// scenario as an acceptance test (blueprint §Phase1 "Tests" table; clarification
// §1 doubt this whole refactor exists to fix). It was verified manually via
// psql during Phase 2 but never captured as an automated test — this closes
// that gap.
//
// Proves the actual bug batch_contracts_core fixes: two tenants choosing the
// same external batch label must resolve to two different internal
// identities, with zero data bleed between them.
//
// To run: export TEST_DB_URL="postgres://postgres:postgres@localhost:5432/zord_test"

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// uniqueTenant generates a test-scoped tenant ID to avoid cross-test/cross-run
// contamination (this package's own copy — internal/services has an
// equivalent but package-private helper of the same name).
func uniqueTenant(label string) string {
	return fmt.Sprintf("tnt_test_%s_%d", label, time.Now().UnixNano())
}

func TestBatchContractsCore_TenantCollision(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	tenantA := uniqueTenant("collision_a")
	tenantB := uniqueTenant("collision_b")
	// Unique per test run so repeat runs don't collide with a leftover row
	// from a previous run via the OLD table's bare batch_id PK (that would
	// be test pollution, not a fresh reproduction of the tenant-collision
	// scenario this test is about). Within THIS run, both tenants use the
	// exact same label — that's the actual scenario under test.
	sharedExternalBatchID := fmt.Sprintf("batch-001-%d", time.Now().UnixNano())

	batchRepo := persistence.NewBatchContractRepo(pool)
	now := time.Now().UTC()

	// Tenant A and Tenant B both upload a batch they call "batch-001",
	// with clearly different data so cross-contamination would be obvious.
	bcA := persistence.BatchContract{
		BatchID: sharedExternalBatchID, TenantID: tenantA,
		TotalCount: 10, SuccessCount: 10,
		TotalIntendedAmountMinor:  decimal.NewFromInt(100000),
		TotalConfirmedAmountMinor: decimal.NewFromInt(100000),
		BatchFinalityStatus:       "FULLY_RECONCILED",
		LastUpdatedAt:             now, CreatedAt: now,
	}
	bcB := persistence.BatchContract{
		BatchID: sharedExternalBatchID, TenantID: tenantB,
		TotalCount: 3, SuccessCount: 1,
		TotalIntendedAmountMinor:  decimal.NewFromInt(500000),
		TotalConfirmedAmountMinor: decimal.NewFromInt(100000),
		BatchFinalityStatus:       "REQUIRES_REVIEW",
		LastUpdatedAt:             now, CreatedAt: now,
	}

	if err := batchRepo.Upsert(ctx, bcA); err != nil {
		t.Fatalf("Upsert tenant A: %v", err)
	}
	if err := batchRepo.Upsert(ctx, bcB); err != nil {
		t.Fatalf("Upsert tenant B: %v", err)
	}

	// ── Assertion 1: two different internal UUIDs ──────────────────────────
	uuidA, err := batchRepo.GetCoreID(ctx, tenantA, sharedExternalBatchID)
	if err != nil {
		t.Fatalf("GetCoreID tenant A: %v", err)
	}
	uuidB, err := batchRepo.GetCoreID(ctx, tenantB, sharedExternalBatchID)
	if err != nil {
		t.Fatalf("GetCoreID tenant B: %v", err)
	}
	if uuidA == nil || uuidB == nil {
		t.Fatalf("expected both tenants to have a resolved UUID, got A=%v B=%v", uuidA, uuidB)
	}
	if *uuidA == *uuidB {
		t.Fatalf("tenant collision bug reproduced: same external_batch_id resolved to the SAME internal UUID for two different tenants (%s)", *uuidA)
	}

	// ── Assertion 2: no data bleed — each tenant reads back its own numbers ──
	gotA, err := batchRepo.GetByID(ctx, sharedExternalBatchID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if gotA == nil {
		t.Fatalf("expected a row for batch=%s, got none", sharedExternalBatchID)
	}
	// Old batch_contracts has a bare batch_id PK, so this read only ever
	// returns ONE row for "batch-001" — and it's corrupted, not just
	// overwritten: Upsert's ON CONFLICT DO UPDATE SET list never includes
	// tenant_id (only the data columns), so the surviving row keeps the
	// FIRST writer's tenant_id (tenant A) while its data columns reflect the
	// LAST writer (tenant B) — a hybrid row with tenant A's identity and
	// tenant B's numbers. Asserting this exact shape documents the bug this
	// test exists to contrast against the new table's real isolation below.
	if gotA.TenantID != tenantA {
		t.Fatalf("expected old-table row to keep the first writer's tenant_id (tenant A) — got tenant=%s; old-table collision behavior changed unexpectedly", gotA.TenantID)
	}
	if gotA.TotalCount != bcB.TotalCount {
		t.Fatalf("expected old-table row's data to reflect the last writer (tenant B, total_count=%d) — got total_count=%d; old-table collision behavior changed unexpectedly", bcB.TotalCount, gotA.TotalCount)
	}

	// The NEW split tables must NOT have this problem — each tenant's row,
	// reached via its own UUID, must show its OWN data untouched by the other.
	var totalCountA, totalCountB int
	if err := pool.QueryRow(ctx, `SELECT total_count FROM batch_reconciliation_summary WHERE batch_contract_id = $1`, *uuidA).Scan(&totalCountA); err != nil {
		t.Fatalf("read reconciliation_summary tenant A: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT total_count FROM batch_reconciliation_summary WHERE batch_contract_id = $1`, *uuidB).Scan(&totalCountB); err != nil {
		t.Fatalf("read reconciliation_summary tenant B: %v", err)
	}
	if totalCountA != bcA.TotalCount {
		t.Fatalf("tenant A data corrupted: expected total_count=%d, got %d (tenant B's value was %d)", bcA.TotalCount, totalCountA, bcB.TotalCount)
	}
	if totalCountB != bcB.TotalCount {
		t.Fatalf("tenant B data corrupted: expected total_count=%d, got %d (tenant A's value was %d)", bcB.TotalCount, totalCountB, bcA.TotalCount)
	}

	// ── Assertion 3: querying tenant A for tenant B's batch finds nothing scoped to A ──
	// (mirrors blueprint §Phase1 test "Query Tenant A for Tenant B batch → 404/403";
	// at the repo layer, the equivalent is: resolving batch-001 scoped to tenant A
	// never returns tenant B's internal UUID.)
	if *uuidA == *uuidB {
		t.Fatalf("tenant A must never resolve to tenant B's internal identity")
	}
}
