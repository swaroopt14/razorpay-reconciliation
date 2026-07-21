package persistence_test

// projection_state_phase3_test.go — Phase 3 refactor integration tests.
//
// Requires TEST_DB_URL (see setupTestDB in projection_repo_test.go) against a
// freshly-initialized DB (db/init.sql, which already carries the Phase 3
// ALTER block + trg_projection_state_hashes trigger + uq_projection_v2, so no
// separate migration step is needed for a fresh test container).
//
// Covers: writer metadata correctness (scope/source/window/retention/expiry),
// the value_hash/source_refs_hash trigger, uq_projection_v2 non-violation
// under normal ON CONFLICT upserts, the bug-E1 __unbatched__ routing, and that
// the tenant=Σbatch consistency invariant still holds with mixed batched/
// unbatched writes.

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

type projectionMetaRow struct {
	ScopeType        *string
	ScopeRef         *string
	MetricKey        *string
	WindowType       *string
	ProjectionSource *string
	SourceVersion    *string
	RetentionClass   *string
	ExpiresAt        *time.Time
	ValueHash        *string
	ProjectionFamily *string
}

func readProjectionMeta(t *testing.T, pool *pgxpool.Pool, tenantID, key string, windowStart time.Time) projectionMetaRow {
	t.Helper()
	var row projectionMetaRow
	err := pool.QueryRow(context.Background(), `
		SELECT scope_type, scope_ref, metric_key, window_type,
		       projection_source, projection_source_version, retention_class,
		       expires_at, value_hash, projection_family
		FROM projection_state
		WHERE tenant_id = $1 AND projection_key = $2 AND window_start = $3 AND projection_version = 1
	`, tenantID, key, windowStart).Scan(
		&row.ScopeType, &row.ScopeRef, &row.MetricKey, &row.WindowType,
		&row.ProjectionSource, &row.SourceVersion, &row.RetentionClass,
		&row.ExpiresAt, &row.ValueHash, &row.ProjectionFamily,
	)
	if err != nil {
		t.Fatalf("readProjectionMeta tenant=%s key=%s: %v", tenantID, key, err)
	}
	return row
}

func mustStr(t *testing.T, p *string, field string) string {
	t.Helper()
	if p == nil {
		t.Fatalf("%s: expected non-NULL, got NULL", field)
	}
	return *p
}

// TestPhase3_CorridorWriterMetadata verifies a plain tenant/corridor-scoped
// writer (AtomicIncrementSuccess) stamps the full Phase 3 metadata contract:
// scope_type/scope_ref derived from the corridor, ROLLING_24H window,
// non-empty value_hash (trigger fired), and a 90-day expiry past window_end.
func TestPhase3_CorridorWriterMetadata(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewProjectionRepo(pool)

	tenantID := uniqueTenant("p3_corridor")
	corridorID := "razorpay_UPI"
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)

	if err := repo.AtomicIncrementSuccess(ctx, tenantID, corridorID, windowStart, windowEnd); err != nil {
		t.Fatalf("AtomicIncrementSuccess: %v", err)
	}

	key := "corridor.success_rate." + corridorID
	row := readProjectionMeta(t, pool, tenantID, key, windowStart)

	if got := mustStr(t, row.ScopeType, "scope_type"); got != "CORRIDOR" {
		t.Errorf("scope_type = %q, want CORRIDOR", got)
	}
	if got := mustStr(t, row.ScopeRef, "scope_ref"); got != corridorID {
		t.Errorf("scope_ref = %q, want %q", got, corridorID)
	}
	if got := mustStr(t, row.MetricKey, "metric_key"); got != "success_rate" {
		t.Errorf("metric_key = %q, want success_rate", got)
	}
	if got := mustStr(t, row.WindowType, "window_type"); got != "ROLLING_24H" {
		t.Errorf("window_type = %q, want ROLLING_24H", got)
	}
	if got := mustStr(t, row.RetentionClass, "retention_class"); got != "DERIVED_CACHE" {
		t.Errorf("retention_class = %q, want DERIVED_CACHE", got)
	}
	if row.ExpiresAt == nil {
		t.Fatal("expires_at: expected non-NULL for ROLLING_24H row")
	}
	wantExpiry := windowEnd.Add(90 * 24 * time.Hour)
	if diff := row.ExpiresAt.Sub(wantExpiry); diff > time.Minute || diff < -time.Minute {
		t.Errorf("expires_at = %v, want ~%v", *row.ExpiresAt, wantExpiry)
	}
	hash := mustStr(t, row.ValueHash, "value_hash")
	if len(hash) != 64 {
		t.Errorf("value_hash length = %d, want 64 (sha256 hex) — trigger may not have fired: %q", len(hash), hash)
	}

	// Second write to the SAME key must update value_hash (proves the
	// trigger recomputes on UPDATE, not just INSERT) without violating
	// uq_projection_v2 (same scope/family/metric/window/source/version).
	if err := repo.AtomicIncrementSuccess(ctx, tenantID, corridorID, windowStart, windowEnd); err != nil {
		t.Fatalf("AtomicIncrementSuccess (second write): %v", err)
	}
	row2 := readProjectionMeta(t, pool, tenantID, key, windowStart)
	hash2 := mustStr(t, row2.ValueHash, "value_hash (second write)")
	if hash2 == hash {
		t.Errorf("value_hash unchanged after a counter increment (%q) — trigger not recomputing on UPDATE", hash2)
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM projection_state WHERE tenant_id=$1 AND projection_key=$2`, tenantID, key).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Errorf("expected exactly 1 row after two writes to the same key (ON CONFLICT should update, not duplicate), got %d", count)
	}
}

// TestPhase3_BatchScopeRefIsCoreUUID verifies the blueprint §5.3 requirement:
// a BATCH-scoped projection row's scope_ref is the batch_contracts_core UUID,
// not the raw external batch id (which remains the projection_key suffix for
// readability), and that the row has no expiry (BATCH_LIFETIME, Phase 9+
// decides batch retention).
func TestPhase3_BatchScopeRefIsCoreUUID(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewProjectionRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)

	tenantID := uniqueTenant("p3_batch_scope")
	externalBatchID := "PAYROLL-2026-04-01"
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)
	amount := decimal.NewFromInt(100000)

	if err := repo.AtomicIncrementLeakageIntendedTotalBothScopes(ctx, tenantID, externalBatchID, amount, windowStart, windowEnd); err != nil {
		t.Fatalf("AtomicIncrementLeakageIntendedTotalBothScopes: %v", err)
	}

	coreID, err := batchRepo.GetCoreID(ctx, tenantID, externalBatchID)
	if err != nil {
		t.Fatalf("GetCoreID: %v", err)
	}
	if coreID == nil {
		t.Fatal("expected batch_contracts_core row to exist after a BothScopes write")
	}

	batchKey := "leakage.batch." + externalBatchID
	row := readProjectionMeta(t, pool, tenantID, batchKey, persistence.BatchProjectionWindowStart)

	if got := mustStr(t, row.ScopeType, "scope_type"); got != "BATCH" {
		t.Errorf("scope_type = %q, want BATCH", got)
	}
	if got := mustStr(t, row.ScopeRef, "scope_ref"); got != *coreID {
		t.Errorf("scope_ref = %q, want the resolved batch_contracts_core UUID %q (blueprint §5.3) — got the raw external id instead", got, *coreID)
	}
	if got := mustStr(t, row.WindowType, "window_type"); got != "BATCH_LIFETIME" {
		t.Errorf("window_type = %q, want BATCH_LIFETIME", got)
	}
	if row.ExpiresAt != nil {
		t.Errorf("expires_at = %v, want NULL for BATCH_LIFETIME rows", *row.ExpiresAt)
	}

	// The tenant-scoped twin must use tenant_id as scope_ref, not the batch UUID.
	tenantRow := readProjectionMeta(t, pool, tenantID, "leakage.total", windowStart)
	if got := mustStr(t, tenantRow.ScopeType, "scope_type"); got != "TENANT" {
		t.Errorf("tenant row scope_type = %q, want TENANT", got)
	}
	if got := mustStr(t, tenantRow.ScopeRef, "scope_ref"); got != tenantID {
		t.Errorf("tenant row scope_ref = %q, want tenant_id %q", got, tenantID)
	}
}

// TestPhase3_UnbatchedBucket_BugE1 verifies the bug-E1 fix: an empty batch id
// must route to the explicit __unbatched__ scope bucket — never to a
// SQL-injected empty string that produces an ambiguous trailing-dot key — and
// must NOT create a phantom batch_contracts_core row (the shadow-diff worker
// iterates that table; a fake row there would surface as a false batch).
func TestPhase3_UnbatchedBucket_BugE1(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewProjectionRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)

	tenantID := uniqueTenant("p3_unbatched")
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)
	amount := decimal.NewFromInt(5000)

	if err := repo.AtomicIncrementLeakageIntendedTotalBothScopes(ctx, tenantID, "", amount, windowStart, windowEnd); err != nil {
		t.Fatalf("AtomicIncrementLeakageIntendedTotalBothScopes (empty batchID): %v", err)
	}

	const wantKey = "leakage.batch.__unbatched__"
	row := readProjectionMeta(t, pool, tenantID, wantKey, persistence.BatchProjectionWindowStart)
	if got := mustStr(t, row.ScopeRef, "scope_ref"); got != "__unbatched__" {
		t.Errorf("scope_ref = %q, want __unbatched__", got)
	}

	coreID, err := batchRepo.GetCoreID(ctx, tenantID, "")
	if err != nil {
		t.Fatalf("GetCoreID: %v", err)
	}
	if coreID != nil {
		t.Errorf("expected no batch_contracts_core row for an unbatched event, got id=%s — this would falsely surface as a real batch to the shadow-diff worker", *coreID)
	}
	coreIDUnbatched, err := batchRepo.GetCoreID(ctx, tenantID, "__unbatched__")
	if err != nil {
		t.Fatalf("GetCoreID(__unbatched__): %v", err)
	}
	if coreIDUnbatched != nil {
		t.Errorf("expected no batch_contracts_core row for the __unbatched__ sentinel either, got id=%s", *coreIDUnbatched)
	}
}

// TestPhase3_ConsistencyInvariant_WithUnbatchedEvents proves the tenant=Σbatch
// dual-bookkeeping invariant (clarification §11) still holds when some events
// carry no batch reference: the unbatched bucket must be summed by
// VerifyBatchTenantConsistency's prefix match just like any real batch.
func TestPhase3_ConsistencyInvariant_WithUnbatchedEvents(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewProjectionRepo(pool)

	tenantID := uniqueTenant("p3_consistency")
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)

	writes := []struct {
		batchID string
		amount  int64
	}{
		{"BATCH-A", 10000},
		{"BATCH-B", 25000},
		{"", 500}, // unbatched — must still land in the batch-side sum
	}
	for _, w := range writes {
		if err := repo.AtomicIncrementLeakageIntendedTotalBothScopes(
			ctx, tenantID, w.batchID, decimal.NewFromInt(w.amount), windowStart, windowEnd,
		); err != nil {
			t.Fatalf("write batch=%q: %v", w.batchID, err)
		}
	}

	if err := repo.VerifyBatchTenantConsistency(ctx, tenantID); err != nil {
		t.Errorf("tenant=Σbatch invariant violated with a mix of batched/unbatched writes: %v", err)
	}
}

// TestPhase3_UQProjectionV2_NoViolationOnRepeatedWrites hammers the same
// tenant+key with many concurrent-ish writes (sequential, but same identity)
// to confirm the new uq_projection_v2 index — additive alongside the
// pre-existing uq_projection, per the "no cutover to empty/new index" rule —
// never rejects the normal ON CONFLICT upsert path.
func TestPhase3_UQProjectionV2_NoViolationOnRepeatedWrites(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewProjectionRepo(pool)

	tenantID := uniqueTenant("p3_uqv2")
	corridorID := "cashfree_IMPS"
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)

	for i := 0; i < 10; i++ {
		if err := repo.AtomicIncrementPending(ctx, tenantID, corridorID, windowStart, windowEnd); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
	}

	var count int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM projection_state
		WHERE tenant_id = $1 AND projection_key = $2
	`, tenantID, "corridor.pending_backlog."+corridorID).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 row after 10 repeated writes to the same identity, got %d (uq_projection_v2 may be over-eager or under-constrained)", count)
	}
}
