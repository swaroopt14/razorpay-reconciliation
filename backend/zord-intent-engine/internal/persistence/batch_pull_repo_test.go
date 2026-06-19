package persistence

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

func TestBatchPullRepoLifecycle(t *testing.T) {
	// Skip the test if DB environment variables are not set (e.g. in environments without DB)
	if os.Getenv("DB_HOST") == "" && os.Getenv("DB_NAME") == "" {
		t.Skip("Skipping DB integration test because environment variables are not set")
	}

	config.InitDB()
	defer db.DB.Close()

	repo := NewBatchPullRepo(db.DB)
	ctx := context.Background()

	tenantID := uuid.New()
	batchID := "test-batch-" + uuid.New().String()[:8]

	// Clean up just in case
	_, _ = db.DB.ExecContext(ctx, "DELETE FROM canonical_batches WHERE batch_id = $1", batchID)

	// 1. Insert a mock completed batch (updated_at must be > 5 minutes ago)
	query := `
		INSERT INTO canonical_batches (
			tenant_id, batch_id, source_system, received_count, canonicalized_count,
			dlq_count, review_count, updated_at
		) VALUES (
			$1, $2, 'test-source', 10, 10, 0, 0, NOW() - INTERVAL '10 minutes'
		)
	`
	_, err := db.DB.ExecContext(ctx, query, tenantID, batchID)
	if err != nil {
		t.Fatalf("Failed to insert mock batch: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM canonical_batches WHERE batch_id = $1", batchID)
	}()

	// 2. Lease the batch
	leaseID, leaseUntil, batches, err := repo.LeaseBatch(ctx, 10, 60, "test-worker")
	if err != nil {
		t.Fatalf("LeaseBatch failed: %v", err)
	}

	// Verify the batch was leased
	var found bool
	for _, b := range batches {
		if b.BatchID == batchID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("Expected leased batches to contain our test batch, but got %v", batches)
	}
	if leaseID == "" {
		t.Fatal("Expected non-empty leaseID")
	}
	if leaseUntil == nil {
		t.Fatal("Expected non-nil leaseUntil")
	}

	// 3. Ack the batch
	acked, err := repo.AckBatch(ctx, leaseID, []string{batchID})
	if err != nil {
		t.Fatalf("AckBatch failed: %v", err)
	}
	if acked != 1 {
		t.Fatalf("Expected 1 row to be acked, got %d", acked)
	}

	// Verify in DB that it is dispatched
	var dispAt sql.NullTime
	var dbLeaseID sql.NullString
	err = db.DB.QueryRowContext(ctx, "SELECT dispatched_at, lease_id FROM canonical_batches WHERE batch_id = $1", batchID).Scan(&dispAt, &dbLeaseID)
	if err != nil {
		t.Fatalf("Querying batch after ack failed: %v", err)
	}
	if !dispAt.Valid {
		t.Fatal("Expected dispatched_at to be valid (not null) after ack")
	}
	if dbLeaseID.Valid && dbLeaseID.String != "" {
		t.Fatalf("Expected lease_id to be cleared after ack, but got %s", dbLeaseID.String)
	}

	// 4. Test Nack scenario
	batchID2 := "test-batch-" + uuid.New().String()[:8]
	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO canonical_batches (
			tenant_id, batch_id, source_system, received_count, canonicalized_count,
			dlq_count, review_count, updated_at
		) VALUES (
			$1, $2, 'test-source', 10, 10, 0, 0, NOW() - INTERVAL '10 minutes'
		)
	`, tenantID, batchID2)
	if err != nil {
		t.Fatalf("Failed to insert mock batch 2: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM canonical_batches WHERE batch_id = $1", batchID2)
	}()

	leaseID2, _, batches2, err := repo.LeaseBatch(ctx, 10, 60, "test-worker")
	if err != nil {
		t.Fatalf("LeaseBatch 2 failed: %v", err)
	}

	found = false
	for _, b := range batches2 {
		if b.BatchID == batchID2 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("Expected leased batches 2 to contain our test batch 2")
	}

	// Nack the second batch
	nacked, err := repo.NackBatch(ctx, leaseID2, []string{batchID2})
	if err != nil {
		t.Fatalf("NackBatch failed: %v", err)
	}
	if nacked != 1 {
		t.Fatalf("Expected 1 row to be nacked, got %d", nacked)
	}

	// Verify in DB that retry_count is incremented and lease is cleared
	var retryCount int
	var nextAttemptAt sql.NullTime
	err = db.DB.QueryRowContext(ctx, "SELECT retry_count, next_attempt_at, lease_id FROM canonical_batches WHERE batch_id = $1", batchID2).Scan(&retryCount, &nextAttemptAt, &dbLeaseID)
	if err != nil {
		t.Fatalf("Querying batch after nack failed: %v", err)
	}
	if retryCount != 1 {
		t.Fatalf("Expected retry_count to be 1, got %d", retryCount)
	}
	if !nextAttemptAt.Valid {
		t.Fatal("Expected next_attempt_at to be valid (not null) after nack")
	}
	if dbLeaseID.Valid && dbLeaseID.String != "" {
		t.Fatalf("Expected lease_id to be cleared after nack, but got %s", dbLeaseID.String)
	}
}
