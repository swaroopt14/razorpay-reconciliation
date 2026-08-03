package persistence

// advisory_lock_concurrency_test.go — corrective-action-report P1-09.
// White-box (internal package) so resolveBatchContractID — the real
// production call site of the advisory lock, not a standalone SQL
// statement — is directly reachable. TEST_DB_URL-gated, same convention as
// persistence_test's setupTestDB, duplicated locally here since that helper
// lives in the external test package.
//
// pg_advisory_xact_lock only serializes for the LIFETIME OF A TRANSACTION,
// so every case below opens a real pgx.Tx, calls resolveBatchContractID
// inside it, holds it open briefly (simulating real handler work), then
// commits — calling it via a bare pool.Exec (auto-commit per statement)
// would release the lock essentially instantly and prove nothing.

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func advisoryLockTestPool(t *testing.T) (*pgxpool.Pool, func()) {
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: TEST_DB_URL environment variable is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to test database at %s: %v", dbURL, err)
	}
	return pool, pool.Close
}

// holdBatchLock opens a transaction, resolves (claims) the advisory lock +
// batch_contracts_core row for one (tenantID, externalBatchID), holds the
// transaction open for hold, then commits.
func holdBatchLock(ctx context.Context, pool *pgxpool.Pool, tenantID, externalBatchID string, hold time.Duration) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := resolveBatchContractID(ctx, tx, tenantID, externalBatchID); err != nil {
		return err
	}
	time.Sleep(hold)
	return tx.Commit(ctx)
}

// TestAdvisoryLock_SameKey_SerializesWithoutDeadlock spins many concurrent
// goroutines all targeting the SAME (tenant, batch) key — the report's
// "record before/after deadlocks" ask. They must all succeed with zero
// errors (in particular, zero 40P01 deadlocks) and must actually serialize:
// total wall time must be close to N*hold, not hold alone, proving the lock
// is doing real work and this isn't a false-pass from goroutines racing
// through with no real contention.
func TestAdvisoryLock_SameKey_SerializesWithoutDeadlock(t *testing.T) {
	pool, teardown := advisoryLockTestPool(t)
	defer teardown()
	ctx := context.Background()

	const n = 20
	const hold = 15 * time.Millisecond
	tenantID := "tnt_advisory_lock_concurrency"
	batchID := "batch_advisory_lock_concurrency_same_key"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts_core WHERE tenant_id=$1 AND external_batch_id=$2`, tenantID, batchID)
	})

	var wg sync.WaitGroup
	errs := make([]error, n)
	start := time.Now()
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			errs[idx] = holdBatchLock(ctx, pool, tenantID, batchID, hold)
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)

	deadlocks := 0
	for i, err := range errs {
		if err != nil {
			t.Errorf("goroutine %d: unexpected error: %v", i, err)
			if isDeadlockErr(err) {
				deadlocks++
			}
		}
	}
	if deadlocks > 0 {
		t.Fatalf("got %d deadlock(s) (SQLSTATE 40P01) across %d concurrent same-key transactions — the fix this test guards regressed", deadlocks, n)
	}

	// Real serialization proof: N transactions each holding the lock for
	// `hold` cannot all finish faster than serializing them would take.
	// Some slack (half of one hold period) absorbs scheduling jitter without
	// weakening the check to the point it can't catch "these didn't
	// actually serialize."
	minExpected := time.Duration(n)*hold - hold/2
	if elapsed < minExpected {
		t.Errorf("elapsed=%v is less than minExpected=%v — %d same-key transactions appear to have run without serializing on the advisory lock",
			elapsed, minExpected, n)
	}
	t.Logf("same-key: %d transactions, 0 deadlocks, elapsed=%v (serialized as expected)", n, elapsed)
}

// TestAdvisoryLock_DifferentKeys_RunInParallel proves the negative case: the
// fix must never serialize UNRELATED batches. Each of M goroutines targets
// its own distinct (tenant, batch) key; total wall time must stay close to
// one hold period, not M*hold, or the lock has started serializing work it
// has no business touching.
func TestAdvisoryLock_DifferentKeys_RunInParallel(t *testing.T) {
	pool, teardown := advisoryLockTestPool(t)
	defer teardown()
	ctx := context.Background()

	const m = 10
	const hold = 30 * time.Millisecond
	tenantID := "tnt_advisory_lock_concurrency_parallel"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts_core WHERE tenant_id=$1`, tenantID)
	})

	var wg sync.WaitGroup
	errs := make([]error, m)
	start := time.Now()
	for i := 0; i < m; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			batchID := fmt.Sprintf("batch_advisory_lock_concurrency_parallel_%d", idx)
			errs[idx] = holdBatchLock(ctx, pool, tenantID, batchID, hold)
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)

	for i, err := range errs {
		if err != nil {
			t.Errorf("goroutine %d: unexpected error: %v", i, err)
		}
	}

	// Generous ceiling: well under M*hold (which would mean serialized),
	// comfortably above 1*hold (allows scheduling/connection-pool overhead).
	maxExpected := time.Duration(m/2) * hold
	if elapsed > maxExpected {
		t.Errorf("elapsed=%v exceeds maxExpected=%v — %d different-key transactions appear to be serializing against each other, which the advisory lock must never do",
			elapsed, maxExpected, m)
	}
	t.Logf("different-keys: %d transactions, 0 errors, elapsed=%v (ran in parallel as expected)", m, elapsed)
}

func isDeadlockErr(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "40P01") || strings.Contains(err.Error(), "deadlock detected"))
}
