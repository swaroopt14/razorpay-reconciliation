package persistence

import (
	"context"
	"os"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

func skipIfNoDB(t *testing.T) {
	if os.Getenv("DB_HOST") == "" && os.Getenv("DB_NAME") == "" {
		t.Skip("Skipping DB integration test because environment variables are not set")
	}
}

// TestEnsureIngestRun_StableAcrossCalls is a Phase 6 regression test: every
// caller used to generate its own throwaway uuid.New() that ON CONFLICT
// silently discarded after the first insert, so run_id was never a usable
// join key. EnsureIngestRun must return the SAME run_id for repeated calls
// on the same (tenant_id, batch_id), and intent_ingest_rows.run_id must
// actually reference it.
func TestEnsureIngestRun_StableAcrossCalls(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	tenantID := uuid.New().String()
	batchID := "test-batch-" + uuid.New().String()[:8]

	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM intent_ingest_rows WHERE batch_id = $1", batchID)
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM intent_ingest_runs WHERE batch_id = $1", batchID)
	}()

	runID1, err := db.EnsureIngestRun(ctx, db.DB, tenantID, batchID)
	if err != nil {
		t.Fatalf("EnsureIngestRun (first call) failed: %v", err)
	}
	if runID1 == "" {
		t.Fatal("expected a non-empty run_id")
	}

	runID2, err := db.EnsureIngestRun(ctx, db.DB, tenantID, batchID)
	if err != nil {
		t.Fatalf("EnsureIngestRun (second call) failed: %v", err)
	}
	if runID2 != runID1 {
		t.Fatalf("expected the same run_id across calls for the same (tenant_id, batch_id), got %q then %q", runID1, runID2)
	}

	var count int
	if err := db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM intent_ingest_runs WHERE tenant_id = $1 AND batch_id = $2", tenantID, batchID).Scan(&count); err != nil {
		t.Fatalf("failed to count intent_ingest_runs: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 intent_ingest_runs row after two EnsureIngestRun calls, got %d", count)
	}

	// intent_ingest_rows.run_id must reference the real run.
	if err := db.InsertIngestRow(ctx, db.DB, runID1, batchID, tenantID, "", "", 1, "idem-1", "ACCEPTED", "", "TEST", "", "", []byte(`{}`)); err != nil {
		t.Fatalf("InsertIngestRow with a real run_id failed: %v", err)
	}
	var linkedRunID string
	if err := db.DB.QueryRowContext(ctx, "SELECT run_id::text FROM intent_ingest_rows WHERE batch_id = $1", batchID).Scan(&linkedRunID); err != nil {
		t.Fatalf("failed to read back run_id: %v", err)
	}
	if linkedRunID != runID1 {
		t.Fatalf("expected intent_ingest_rows.run_id=%q, got %q", runID1, linkedRunID)
	}

	// A bogus run_id must be rejected by the FK.
	if err := db.InsertIngestRow(ctx, db.DB, uuid.New().String(), batchID, tenantID, "", "", 2, "idem-2", "ACCEPTED", "", "TEST", "", "", []byte(`{}`)); err == nil {
		t.Fatal("expected FK violation when run_id does not exist in intent_ingest_runs")
	}
}

// TestFetchUnscoredEvents_DoesNotLeaseOrCompeteWithRelay is a Phase 6
// regression test for the outbox race condition: the ETL fetch must find an
// event regardless of its delivery status, must not touch lease_id/status,
// and must stop returning an event once it has an ACTIVE etl_ingest_runs row.
func TestFetchUnscoredEvents_DoesNotLeaseOrCompeteWithRelay(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	repo := NewOutboxPullRepo(db.DB)
	tenantID := uuid.New()
	eventID := uuid.New()
	aggregateID := uuid.New()

	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO payment_intents (
			intent_id, trace_id, envelope_id, tenant_id, contract_id,
			salient_hash, payload_hash, intent_type, canonical_version,
			amount, currency, status, canonical_hash, canonical_snapshot_ref
		) VALUES ($1, $2, $3, $4, $5, 'h', 'h', 'PAYOUT', 'v1', 100, 'INR', 'ACCEPTED', 'h', 'r')
	`, aggregateID, uuid.New(), uuid.New(), tenantID, uuid.New())
	if err != nil {
		t.Fatalf("failed to insert fixture payment_intent: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM payment_intents WHERE intent_id = $1", aggregateID)
	}()

	// status='SENT' — already delivered by relay. The old lease-based ETL path
	// would never have seen this row again once it left PENDING.
	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO outbox (
			event_id, trace_id, envelope_id, tenant_id, contract_id,
			aggregate_type, aggregate_id, event_type, payload, payload_hash, status
		) VALUES ($1, $2, $3, $4, $5, 'intent', $6, 'intent.created.v1', '{}'::jsonb, 'h', 'SENT')
	`, eventID, uuid.New(), uuid.New(), tenantID, uuid.New(), aggregateID)
	if err != nil {
		t.Fatalf("failed to insert fixture outbox row: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM outbox WHERE event_id = $1", eventID)
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM etl_ingest_runs WHERE outbox_event_id = $1", eventID.String())
	}()

	events, err := repo.FetchUnscoredEvents(ctx, 500)
	if err != nil {
		t.Fatalf("FetchUnscoredEvents error: %v", err)
	}
	found := false
	for _, e := range events {
		if e.EventID == eventID.String() {
			found = true
		}
	}
	if !found {
		t.Fatal("expected FetchUnscoredEvents to return the SENT event — ETL scoring must not depend on delivery status")
	}

	// Confirm it did NOT touch lease/status — proving it never competed with relay.
	var status string
	var leaseID *string
	if err := db.DB.QueryRowContext(ctx, "SELECT status, lease_id::text FROM outbox WHERE event_id = $1", eventID).Scan(&status, &leaseID); err != nil {
		t.Fatalf("failed to read back outbox row: %v", err)
	}
	if status != "SENT" {
		t.Fatalf("expected outbox status to remain SENT (untouched), got %q", status)
	}
	if leaseID != nil {
		t.Fatalf("expected lease_id to remain unset — FetchUnscoredEvents must not lease, got %v", leaseID)
	}

	// Mark it as ETL-scored (active run) — it must not be returned again.
	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO etl_ingest_runs (tenant_id, envelope_id, outbox_event_id, status, is_active)
		VALUES ($1, $2, $3, 'COMPLETED', true)
	`, tenantID, uuid.New(), eventID.String())
	if err != nil {
		t.Fatalf("failed to insert fixture etl_ingest_runs: %v", err)
	}

	events, err = repo.FetchUnscoredEvents(ctx, 500)
	if err != nil {
		t.Fatalf("FetchUnscoredEvents (second call) error: %v", err)
	}
	for _, e := range events {
		if e.EventID == eventID.String() {
			t.Fatal("expected an already-scored (is_active=true) event to be excluded from FetchUnscoredEvents")
		}
	}
}

// TestLeaseBatch_CompletedIngestRunSkipsQuietWait is a Phase 6 regression
// test: a batch whose intent_ingest_runs.status is COMPLETED must be
// leaseable immediately, without waiting for the 5-minute quiet heuristic.
func TestLeaseBatch_CompletedIngestRunSkipsQuietWait(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	repo := NewBatchPullRepo(db.DB)
	tenantID := uuid.New()
	batchID := "test-batch-" + uuid.New().String()[:8]

	// updated_at is "now" (well inside the 5-minute quiet window) — under the
	// old heuristic this batch would NOT be leaseable yet.
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO canonical_batches (
			tenant_id, batch_id, source_system, received_count, canonicalized_count,
			dlq_count, review_count, updated_at
		) VALUES ($1, $2, 'test-source', 5, 5, 0, 0, NOW())
	`, tenantID, batchID)
	if err != nil {
		t.Fatalf("failed to insert fixture canonical_batches: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM canonical_batches WHERE batch_id = $1", batchID)
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM intent_ingest_runs WHERE batch_id = $1", batchID)
	}()

	_, _, batches, err := repo.LeaseBatch(ctx, 10, 60, "test-worker")
	if err != nil {
		t.Fatalf("LeaseBatch (before ingest run exists) failed: %v", err)
	}
	for _, b := range batches {
		if b.BatchID == batchID {
			t.Fatal("expected a fresh batch with no ingest run and recent updated_at to NOT be leaseable yet (falls back to quiet-wait)")
		}
	}

	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO intent_ingest_runs (tenant_id, batch_id, status) VALUES ($1, $2, 'COMPLETED')
	`, tenantID, batchID)
	if err != nil {
		t.Fatalf("failed to insert fixture intent_ingest_runs: %v", err)
	}

	leaseID, _, batches, err := repo.LeaseBatch(ctx, 10, 60, "test-worker")
	if err != nil {
		t.Fatalf("LeaseBatch (after ingest run COMPLETED) failed: %v", err)
	}
	found := false
	for _, b := range batches {
		if b.BatchID == batchID {
			found = true
		}
	}
	if !found {
		t.Fatal("expected the batch to be immediately leaseable once intent_ingest_runs.status = COMPLETED, even with recent updated_at")
	}

	// Clean up the lease so the deferred cleanup's DELETE isn't blocked by FK/lease state.
	if leaseID != "" {
		_, _ = repo.AckBatch(ctx, leaseID, []string{batchID})
	}
}
