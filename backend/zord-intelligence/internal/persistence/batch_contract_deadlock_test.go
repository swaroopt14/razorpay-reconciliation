package persistence_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// TestBatchContractRepo_ConcurrentWrites_NoDeadlock reproduces the exact
// concurrency pattern that caused a live Postgres deadlock (SQLSTATE 40P01)
// on 2026-07-27: multiple Kafka topic-consumer goroutines (settlement,
// attachment-decision, variance, batch-summary, governance, intent) each
// writing to the SAME batch's rows concurrently. Before the lock-ordering
// fix, resolveBatchContractID's advisory lock and the batch_contracts row
// lock were acquired in opposite order by different writers, so a handful
// of concurrent iterations reliably deadlocked. After the fix, every writer
// in batch_contract_repo.go acquires the per-batch advisory lock first, so
// no two transactions can take the two resources in opposite order.
func TestBatchContractRepo_ConcurrentWrites_NoDeadlock(t *testing.T) {
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: TEST_DB_URL environment variable is not set")
	}
	ctx := context.Background()

	// A wide pool is required to actually overlap transactions: with too few
	// connections, writers queue at the pool instead of at the DB locks, and
	// the deadlock window never opens.
	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		t.Fatalf("ParseConfig: %v", err)
	}
	cfg.MaxConns = 40
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("Failed to connect to test database at %s: %v", dbURL, err)
	}
	defer pool.Close()

	repo := persistence.NewBatchContractRepo(pool)

	tenantID := "tnt_deadlock_regression"
	batchID := fmt.Sprintf("batch_deadlock_regression_%d", time.Now().UnixNano())

	t.Cleanup(func() {
		var coreID string
		_ = pool.QueryRow(ctx, `SELECT batch_contract_id FROM batch_contracts_core WHERE tenant_id=$1 AND external_batch_id=$2`,
			tenantID, batchID).Scan(&coreID)
		if coreID != "" {
			_, _ = pool.Exec(ctx, `DELETE FROM batch_risk_summary WHERE batch_contract_id=$1`, coreID)
			_, _ = pool.Exec(ctx, `DELETE FROM batch_reconciliation_summary WHERE batch_contract_id=$1`, coreID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts_core WHERE tenant_id=$1 AND external_batch_id=$2`, tenantID, batchID)
		_, _ = pool.Exec(ctx, `DELETE FROM batch_contracts WHERE batch_id=$1`, batchID)
	})

	amount := decimal.NewFromInt(100)

	// One writer per "topic handler" the real Kafka consumers run
	// concurrently in production — all thirteen batch_contract_repo.go
	// entry points that touch batch_contracts / batch_risk_summary /
	// batch_reconciliation_summary for the same batch.
	writers := []func() error{
		func() error {
			return repo.Upsert(ctx, persistence.BatchContract{
				BatchID: batchID, TenantID: tenantID,
				TotalCount: 1, TotalIntendedAmountMinor: amount,
			})
		},
		func() error { return repo.AtomicAddBatchBankRefStats(ctx, batchID, tenantID, true) },
		func() error { return repo.AtomicAddBatchClientRefStats(ctx, batchID, tenantID, true) },
		func() error { return repo.AtomicAddBatchVarianceBreakdown(ctx, batchID, tenantID, amount, false, false) },
		func() error { return repo.AtomicIncrementBatchMissingRef(ctx, batchID, tenantID, 1) },
		func() error { return repo.AtomicAddBatchUnmatchedAmount(ctx, batchID, tenantID, amount) },
		func() error { return repo.AtomicAddBatchReversalExposure(ctx, batchID, tenantID, amount) },
		func() error { return repo.AtomicAddBatchOrphanAmount(ctx, batchID, tenantID, amount) },
		func() error { return repo.AtomicAddBatchDuplicateRiskExposure(ctx, batchID, tenantID, amount) },
		func() error { return repo.SetDefensibilityTier(ctx, batchID, tenantID, "STRONG") },
		func() error {
			return repo.AtomicAccumulateIntentFeatures(ctx, batchID, tenantID, amount,
				"INR", "TEST", "UPI", "PAYOUT", "razorpay", time.Now().UTC(), true)
		},
		func() error {
			return repo.SetLeakagePrediction(ctx, batchID, tenantID, decimal.NewFromFloat(0.1), amount, "model-v1", time.Now().UTC())
		},
		func() error {
			return repo.UpsertIntentSnapshot(ctx, persistence.BatchContract{
				BatchID: batchID, TenantID: tenantID,
				IntentRowCount: 1, IntentTotalAmountMinor: amount, IntentAmountSquareSum: amount.Mul(amount),
			})
		},
	}

	const goroutines = 40
	const iterations = 15

	var wg sync.WaitGroup
	var ready sync.WaitGroup
	start := make(chan struct{})
	errCh := make(chan error, goroutines*iterations)

	ready.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			ready.Done()
			<-start // all goroutines fire together, maximizing lock overlap
			for i := 0; i < iterations; i++ {
				w := writers[(g+i)%len(writers)]
				if err := w(); err != nil {
					errCh <- err
				}
			}
		}(g)
	}
	ready.Wait() // every goroutine is parked on <-start before any of them begins
	close(start)
	wg.Wait()
	close(errCh)

	var deadlocks, otherErrs []error
	for err := range errCh {
		if strings.Contains(err.Error(), "40P01") || strings.Contains(err.Error(), "deadlock detected") {
			deadlocks = append(deadlocks, err)
		} else {
			otherErrs = append(otherErrs, err)
		}
	}

	if len(deadlocks) > 0 {
		t.Fatalf("got %d deadlock error(s) out of %d concurrent writes to the same batch; lock-ordering fix did not hold. First: %v",
			len(deadlocks), goroutines*iterations, deadlocks[0])
	}
	if len(otherErrs) > 0 {
		t.Fatalf("got %d unexpected non-deadlock error(s): %v", len(otherErrs), otherErrs[0])
	}
}
