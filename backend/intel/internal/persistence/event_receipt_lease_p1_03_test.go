package persistence_test

// event_receipt_lease_p1_03_test.go — TEST_DB_URL-gated integration tests
// covering the corrective-action-report's 4 acceptance criteria for P1-03
// ("Add stale PROCESSING recovery and receipt leasing"): crash after claim
// is recoverable; a live worker's lease cannot be stolen early; an expired
// lease is reclaimed by the sweep with an attempt increment; two workers
// cannot both commit projection writes for the same event.
//
// See event_receipt_repo.go's file header for why PROCESSING is never a
// durably committed state on any current production code path (claim, the
// handler's writes, and markProcessed all run in one transaction) — that is
// also why test 3 below has to insert its synthetic stale row directly via
// SQL rather than reach that state through RunOnce itself.

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// TestEventReceiptRepo_CrashAfterClaim_Recoverable simulates a worker that
// claims an event then crashes before completing it: the claim-shaped
// INSERT runs on its own transaction, which is then rolled back (the
// closest available approximation, without process-kill infrastructure, of
// what a crashed connection's implicit rollback does). A subsequent normal
// delivery of the same event must complete cleanly with no leftover trace.
func TestEventReceiptRepo_CrashAfterClaim_Recoverable(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()

	tenantID := uniqueTenant("crash_recover")
	const source = "test-source"
	eventID := fmt.Sprintf("evt_crash_%d", time.Now().UnixNano())

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin crash-sim tx: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO event_receipts
			(tenant_id, event_source, source_topic, event_type, event_version, event_id,
			 payload_hash, processing_status, attempt_count,
			 processing_started_at, lease_owner, lease_expires_at)
		VALUES ($1, $2, 'test-topic', 'test.event', 'v1', $3,
		        'hash_crash', 'PROCESSING', 1,
		        now(), 'crashed-worker', now() + interval '5 minutes')
	`, tenantID, source, eventID); err != nil {
		t.Fatalf("claim-sim insert: %v", err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("crash-sim rollback: %v", err)
	}

	// The single-transaction design's whole point: a rolled-back claim
	// leaves no row behind at all.
	var preCount int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM event_receipts WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3`,
		tenantID, source, eventID,
	).Scan(&preCount); err != nil {
		t.Fatalf("post-rollback count query: %v", err)
	}
	if preCount != 0 {
		t.Fatalf("expected rolled-back claim to leave no row, found %d", preCount)
	}

	repo := persistence.NewEventReceiptRepo(pool, "recovery-worker", 5*time.Minute)
	var callCount int32
	fn := func(txCtx context.Context) error {
		atomic.AddInt32(&callCount, 1)
		return nil
	}
	meta := persistence.EventMeta{
		TenantID: tenantID, EventSource: source, EventType: "test.event",
		EventVersion: "v1", EventID: eventID, PayloadHash: "hash_crash",
	}
	skipped, err := repo.RunOnce(ctx, meta, fn)
	if err != nil || skipped {
		t.Fatalf("post-crash redelivery: skipped=%v err=%v, want skipped=false err=nil", skipped, err)
	}
	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("callCount = %d, want 1", callCount)
	}

	var status string
	var leaseOwner *string
	var leaseExpiresAt *time.Time
	if err := pool.QueryRow(ctx,
		`SELECT processing_status, lease_owner, lease_expires_at FROM event_receipts WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3`,
		tenantID, source, eventID,
	).Scan(&status, &leaseOwner, &leaseExpiresAt); err != nil {
		t.Fatalf("post-recovery status query: %v", err)
	}
	if status != "PROCESSED" {
		t.Fatalf("status = %q, want PROCESSED", status)
	}
	if leaseOwner != nil || leaseExpiresAt != nil {
		t.Fatalf("expected lease fields cleared after PROCESSED, got owner=%v expires=%v", leaseOwner, leaseExpiresAt)
	}
}

// TestEventReceiptRepo_LiveLeaseNotStolen proves a second concurrent
// delivery of the same event cannot run its handler while the first
// delivery's transaction is still open — the row lock taken at claim time
// already prevents a live lease from being "stolen" early, regardless of
// what lease_expires_at says.
func TestEventReceiptRepo_LiveLeaseNotStolen(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewEventReceiptRepo(pool, "concurrency-worker", 5*time.Minute)

	tenantID := uniqueTenant("lease_not_stolen")
	const source = "test-source"
	eventID := fmt.Sprintf("evt_lease_%d", time.Now().UnixNano())
	meta := persistence.EventMeta{
		TenantID: tenantID, EventSource: source, EventType: "test.event",
		EventVersion: "v1", EventID: eventID, PayloadHash: "hash_lease",
	}

	var callCount int32
	started := make(chan struct{})
	release := make(chan struct{})

	firstFn := func(txCtx context.Context) error {
		atomic.AddInt32(&callCount, 1)
		close(started) // signal: claim succeeded, tx (and its row lock) is open
		<-release
		return nil
	}
	secondFn := func(txCtx context.Context) error {
		atomic.AddInt32(&callCount, 1)
		return nil
	}

	var wg sync.WaitGroup
	wg.Add(1)
	var firstErr error
	var firstSkipped bool
	go func() {
		defer wg.Done()
		firstSkipped, firstErr = repo.RunOnce(ctx, meta, firstFn)
	}()

	<-started // first goroutine is now holding the row lock inside an open tx

	wg.Add(1)
	var secondErr error
	var secondSkipped bool
	go func() {
		defer wg.Done()
		secondSkipped, secondErr = repo.RunOnce(ctx, meta, secondFn)
	}()

	// Give the second attempt's claim query time to actually reach and
	// block on the row lock before we let the first transaction commit.
	time.Sleep(200 * time.Millisecond)
	close(release)
	wg.Wait()

	if firstErr != nil || firstSkipped {
		t.Fatalf("first RunOnce: skipped=%v err=%v, want skipped=false err=nil", firstSkipped, firstErr)
	}
	if secondErr != nil {
		t.Fatalf("second RunOnce error: %v", secondErr)
	}
	if !secondSkipped {
		t.Fatalf("second RunOnce should have been skipped as a duplicate of the already-PROCESSED event, got skipped=false")
	}
	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("callCount = %d, want exactly 1 — the live lease must not be stolen/re-run by the concurrent second attempt", callCount)
	}
}

// TestEventReceiptRepo_ExpiredLeaseSweep_ReclaimsWithAttemptIncrement covers
// the sweep itself. Production code cannot commit a row in PROCESSING (see
// file header), so this test inserts one directly to simulate the
// hypothetical the report is guarding against, then proves SweepStaleLeases
// reclaims it (clearing the lease and bumping attempt_count) and that a
// real redelivery afterward still completes normally end-to-end.
func TestEventReceiptRepo_ExpiredLeaseSweep_ReclaimsWithAttemptIncrement(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewEventReceiptRepo(pool, "sweep-test-worker", 5*time.Minute)

	tenantID := uniqueTenant("expired_lease")
	const source = "test-source"
	eventID := fmt.Sprintf("evt_expired_%d", time.Now().UnixNano())

	if _, err := pool.Exec(ctx, `
		INSERT INTO event_receipts
			(tenant_id, event_source, source_topic, event_type, event_version, event_id,
			 payload_hash, processing_status, attempt_count,
			 processing_started_at, lease_owner, lease_expires_at)
		VALUES ($1, $2, 'test-topic', 'test.event', 'v1', $3,
		        'hash_expired', 'PROCESSING', 1,
		        now() - interval '10 minutes', 'dead-worker', now() - interval '5 minutes')
	`, tenantID, source, eventID); err != nil {
		t.Fatalf("synthetic stale-lease insert: %v", err)
	}

	reclaimed, err := repo.SweepStaleLeases(ctx)
	if err != nil {
		t.Fatalf("SweepStaleLeases: %v", err)
	}
	if reclaimed < 1 {
		t.Fatalf("reclaimed = %d, want >= 1", reclaimed)
	}

	var attemptCount int
	var leaseOwner *string
	var leaseExpiresAt *time.Time
	if err := pool.QueryRow(ctx,
		`SELECT attempt_count, lease_owner, lease_expires_at FROM event_receipts WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3`,
		tenantID, source, eventID,
	).Scan(&attemptCount, &leaseOwner, &leaseExpiresAt); err != nil {
		t.Fatalf("post-sweep query: %v", err)
	}
	if attemptCount != 2 {
		t.Fatalf("attempt_count = %d after sweep, want 2 (1 + reclaim increment)", attemptCount)
	}
	if leaseOwner != nil || leaseExpiresAt != nil {
		t.Fatalf("expected lease fields cleared by sweep, got owner=%v expires=%v", leaseOwner, leaseExpiresAt)
	}

	var callCount int32
	fn := func(txCtx context.Context) error {
		atomic.AddInt32(&callCount, 1)
		return nil
	}
	meta := persistence.EventMeta{
		TenantID: tenantID, EventSource: source, EventType: "test.event",
		EventVersion: "v1", EventID: eventID, PayloadHash: "hash_expired",
	}
	skipped, err := repo.RunOnce(ctx, meta, fn)
	if err != nil || skipped {
		t.Fatalf("post-reclaim redelivery: skipped=%v err=%v, want skipped=false err=nil", skipped, err)
	}
	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("callCount = %d, want 1", callCount)
	}

	var finalStatus string
	var finalAttempt int
	if err := pool.QueryRow(ctx,
		`SELECT processing_status, attempt_count FROM event_receipts WHERE tenant_id=$1 AND event_source=$2 AND event_id=$3`,
		tenantID, source, eventID,
	).Scan(&finalStatus, &finalAttempt); err != nil {
		t.Fatalf("final status query: %v", err)
	}
	if finalStatus != "PROCESSED" {
		t.Fatalf("final status = %q, want PROCESSED", finalStatus)
	}
	if finalAttempt != 3 {
		t.Fatalf("final attempt_count = %d, want 3 (1 initial + 1 sweep reclaim + 1 real redelivery claim)", finalAttempt)
	}
}

// TestEventReceiptRepo_TwoWorkersCannotBothCommitProjectionWrites is the
// same concurrency shape as TestEventReceiptRepo_LiveLeaseNotStolen, but
// asserts against actual DB-visible projection state (not just handler call
// counts) — proving exactly one committed write lands, using the same
// txCtx-joins-the-ambient-transaction path production handlers use.
func TestEventReceiptRepo_TwoWorkersCannotBothCommitProjectionWrites(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewEventReceiptRepo(pool, "projection-race-worker", 5*time.Minute)
	projRepo := persistence.NewProjectionRepo(pool)

	tenantID := uniqueTenant("projection_race")
	corridorID := "corr_lease_race"
	const source = "test-source"
	eventID := fmt.Sprintf("evt_projrace_%d", time.Now().UnixNano())
	now := time.Now().UTC().Truncate(24 * time.Hour)
	windowStart := now
	windowEnd := now.Add(24 * time.Hour)

	key := "corridor.success_rate." + corridorID
	_, _ = pool.Exec(ctx, `DELETE FROM projection_state WHERE tenant_id=$1 AND projection_key=$2`, tenantID, key)

	meta := persistence.EventMeta{
		TenantID: tenantID, EventSource: source, EventType: "test.event",
		EventVersion: "v1", EventID: eventID, PayloadHash: "hash_projrace",
	}

	started := make(chan struct{})
	release := make(chan struct{})

	firstFn := func(txCtx context.Context) error {
		close(started)
		<-release
		return projRepo.AtomicIncrementSuccess(txCtx, tenantID, corridorID, windowStart, windowEnd)
	}
	secondFn := func(txCtx context.Context) error {
		return projRepo.AtomicIncrementSuccess(txCtx, tenantID, corridorID, windowStart, windowEnd)
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := repo.RunOnce(ctx, meta, firstFn); err != nil {
			t.Errorf("first RunOnce: %v", err)
		}
	}()

	<-started

	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := repo.RunOnce(ctx, meta, secondFn); err != nil {
			t.Errorf("second RunOnce: %v", err)
		}
	}()

	time.Sleep(200 * time.Millisecond)
	close(release)
	wg.Wait()

	var valueJSON []byte
	if err := pool.QueryRow(ctx,
		`SELECT value_json FROM projection_state WHERE tenant_id=$1 AND projection_key=$2`,
		tenantID, key,
	).Scan(&valueJSON); err != nil {
		t.Fatalf("projection_state query: %v", err)
	}
	var parsed struct {
		TotalCount   float64 `json:"total_count"`
		SettledCount float64 `json:"settled_count"`
	}
	if err := json.Unmarshal(valueJSON, &parsed); err != nil {
		t.Fatalf("unmarshal value_json %s: %v", valueJSON, err)
	}
	if parsed.TotalCount != 1 {
		t.Fatalf("total_count = %v, want exactly 1 — two concurrent deliveries of the same event must not both commit a projection write", parsed.TotalCount)
	}
}
