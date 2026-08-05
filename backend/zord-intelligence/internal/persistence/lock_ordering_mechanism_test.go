package persistence_test

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// lock_ordering_mechanism_test.go proves the actual deadlock mechanism found
// live in zord-intelligence-postgres on 2026-07-27 (SQLSTATE 40P01), directly
// on the two primitives involved — a per-batch pg_advisory_xact_lock and a
// row-level lock on a shared row — independent of any application code's
// exact timing.
//
// The full-stack repo-level concurrency test in
// batch_contract_deadlock_test.go could NOT reliably reproduce the race:
// each repo call completes in well under a millisecond against a local DB,
// so the lock-contention window never stays open long enough for Postgres's
// deadlock detector to fire (deadlock_timeout defaults to 1s — matching the
// ~1s spacing between deadlock log lines seen in the real incident). A timing
// -dependent test that only sometimes reproduces a bug is not trustworthy
// either way, so this test instead controls timing directly with a short
// sleep, to deterministically prove:
//
//  1. Acquiring [row lock, then advisory lock] in one transaction and
//     [advisory lock, then row lock] in another — the exact pattern that
//     existed before the fix — deadlocks.
//  2. Acquiring the advisory lock first in BOTH transactions — the fix
//     applied across all 13 writers in batch_contract_repo.go — cannot
//     deadlock: the second transaction simply queues behind the first.

func lockOrderingTestPool(t *testing.T) (*pgxpool.Pool, func()) {
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

// TestLockOrdering_InconsistentOrder_Deadlocks proves the bug's mechanism:
// two transactions taking a per-key advisory lock and a row lock in opposite
// order will deadlock under Postgres, given enough overlap.
func TestLockOrdering_InconsistentOrder_Deadlocks(t *testing.T) {
	pool, teardown := lockOrderingTestPool(t)
	defer teardown()
	ctx := context.Background()

	tenantID := "tnt_lock_order_mechanism"
	batchID := "batch_lock_order_mechanism"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts WHERE batch_id=$1`, batchID)
	})
	_, err := pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id) VALUES ($1, $2)
		ON CONFLICT (batch_id) DO NOTHING
	`, batchID, tenantID)
	if err != nil {
		t.Fatalf("seed batch_contracts: %v", err)
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)

	// Tx A: row lock first, then advisory lock — the pre-fix order used by
	// AtomicAddBatchBankRefStats/AtomicAddBatchClientRefStats/etc.
	wg.Add(1)
	go func() {
		defer wg.Done()
		tx, err := pool.Begin(ctx)
		if err != nil {
			errs[0] = err
			return
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `UPDATE batch_contracts SET last_updated_at = now() WHERE batch_id = $1`, batchID); err != nil {
			errs[0] = err
			return
		}
		time.Sleep(300 * time.Millisecond) // hold the row lock open so B can queue behind it
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, tenantID, batchID); err != nil {
			errs[0] = err
			return
		}
		errs[0] = tx.Commit(ctx)
	}()

	// Tx B: advisory lock first, then row lock — the pre-fix order used by
	// resolveBatchContractID-first callers like Upsert's shadow writers.
	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(50 * time.Millisecond) // let A grab the row lock first
		tx, err := pool.Begin(ctx)
		if err != nil {
			errs[1] = err
			return
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, tenantID, batchID); err != nil {
			errs[1] = err
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE batch_contracts SET last_updated_at = now() WHERE batch_id = $1`, batchID); err != nil {
			errs[1] = err
			return
		}
		errs[1] = tx.Commit(ctx)
	}()

	wg.Wait()

	deadlockSeen := false
	for _, err := range errs {
		if err != nil && (strings.Contains(err.Error(), "40P01") || strings.Contains(err.Error(), "deadlock detected")) {
			deadlockSeen = true
		}
	}
	if !deadlockSeen {
		t.Fatalf("expected a deadlock (40P01) from the inconsistent-order pattern, got errs=%v — the mechanism assumption behind the fix is wrong", errs)
	}
	t.Logf("confirmed: inconsistent lock order deadlocks as expected (errs=%v)", errs)
}

// TestLockOrdering_ConsistentOrder_NoDeadlock proves the fix: when both
// transactions take the advisory lock first (as every writer in
// batch_contract_repo.go now does), there is no cycle to form — B simply
// queues behind A.
func TestLockOrdering_ConsistentOrder_NoDeadlock(t *testing.T) {
	pool, teardown := lockOrderingTestPool(t)
	defer teardown()
	ctx := context.Background()

	tenantID := "tnt_lock_order_mechanism_fixed"
	batchID := "batch_lock_order_mechanism_fixed"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts WHERE batch_id=$1`, batchID)
	})
	_, err := pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id) VALUES ($1, $2)
		ON CONFLICT (batch_id) DO NOTHING
	`, batchID, tenantID)
	if err != nil {
		t.Fatalf("seed batch_contracts: %v", err)
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)

	run := func(idx int, delay time.Duration) {
		defer wg.Done()
		time.Sleep(delay)
		tx, err := pool.Begin(ctx)
		if err != nil {
			errs[idx] = err
			return
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, tenantID, batchID); err != nil {
			errs[idx] = err
			return
		}
		time.Sleep(300 * time.Millisecond) // same hold time as the deadlock test, deliberately
		if _, err := tx.Exec(ctx, `UPDATE batch_contracts SET last_updated_at = now() WHERE batch_id = $1`, batchID); err != nil {
			errs[idx] = err
			return
		}
		errs[idx] = tx.Commit(ctx)
	}

	wg.Add(2)
	go run(0, 0)
	go run(1, 50*time.Millisecond)
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("tx %d: unexpected error with consistent lock ordering: %v", i, err)
		}
	}
	t.Log("confirmed: consistent lock order (advisory lock always first) does not deadlock")
}
