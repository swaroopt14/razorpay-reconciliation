package persistence

import (
	"context"
	"os"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

// These are regression tests for Phase 1 of the intent-engine refactor:
// every repository write must be tenant-scoped, and batch_id is only unique
// per tenant, never globally.

func skipIfNoDB(t *testing.T) {
	if os.Getenv("DB_HOST") == "" && os.Getenv("DB_NAME") == "" {
		t.Skip("Skipping DB integration test because environment variables are not set")
	}
}

// insertMinimalPaymentIntent inserts the smallest possible valid payment_intents
// row (satisfying NOT NULL columns only) for use as a tenant-scoping fixture.
func insertMinimalPaymentIntent(t *testing.T, ctx context.Context, tenantID, intentID string) {
	t.Helper()
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO payment_intents (
			intent_id, trace_id, envelope_id, tenant_id, contract_id,
			salient_hash, payload_hash, intent_type, canonical_version,
			amount, currency, status, canonical_hash, canonical_snapshot_ref
		) VALUES (
			$1, $2, $3, $4, $5,
			'NA', 'test-payload-hash', 'PAYOUT', 'v1',
			100, 'INR', 'ACCEPTED', 'initial-hash', 'initial-ref'
		)
	`, intentID, uuid.New(), uuid.New(), tenantID, uuid.New())
	if err != nil {
		t.Fatalf("failed to insert fixture payment_intent: %v", err)
	}
}

// TestUpdateSnapshotRefs_TenantScoped verifies that UpdateSnapshotRefs cannot
// mutate a payment_intents row belonging to a different tenant, even when the
// caller supplies the correct intent_id. Before the Phase 1 fix, the UPDATE's
// WHERE clause only matched on intent_id, so a wrong tenant_id would still
// succeed silently.
func TestUpdateSnapshotRefs_TenantScoped(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	repo := NewPaymentIntentRepo(db.DB)
	ctx := context.Background()

	tenantA := uuid.New().String()
	tenantB := uuid.New().String()
	intentID := uuid.New().String()

	insertMinimalPaymentIntent(t, ctx, tenantA, intentID)
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM payment_intents WHERE intent_id = $1", intentID)
	}()

	// Attempting the update as the WRONG tenant must not modify the row.
	if err := repo.UpdateSnapshotRefs(ctx, tenantB, intentID, "canonical-ref", "nir-ref", "gov-ref", "new-hash", ""); err != nil {
		t.Fatalf("UpdateSnapshotRefs (wrong tenant) returned error: %v", err)
	}

	var hash, ref string
	err := db.DB.QueryRowContext(ctx,
		"SELECT canonical_hash, canonical_snapshot_ref FROM payment_intents WHERE intent_id = $1", intentID,
	).Scan(&hash, &ref)
	if err != nil {
		t.Fatalf("failed to read back fixture row: %v", err)
	}
	if hash != "initial-hash" || ref != "initial-ref" {
		t.Fatalf("cross-tenant UpdateSnapshotRefs mutated the row: hash=%s ref=%s (expected unchanged initial values)", hash, ref)
	}

	// Attempting the update as the CORRECT tenant must succeed.
	if err := repo.UpdateSnapshotRefs(ctx, tenantA, intentID, "canonical-ref", "nir-ref", "gov-ref", "new-hash", ""); err != nil {
		t.Fatalf("UpdateSnapshotRefs (correct tenant) returned error: %v", err)
	}
	err = db.DB.QueryRowContext(ctx,
		"SELECT canonical_hash, canonical_snapshot_ref FROM payment_intents WHERE intent_id = $1", intentID,
	).Scan(&hash, &ref)
	if err != nil {
		t.Fatalf("failed to read back fixture row: %v", err)
	}
	if hash != "new-hash" || ref != "canonical-ref" {
		t.Fatalf("same-tenant UpdateSnapshotRefs did not update the row: hash=%s ref=%s", hash, ref)
	}
}

// TestIntentIngestRuns_BatchIDScopedPerTenant verifies that two different
// tenants can independently use the same client-supplied batch_id without
// colliding. Before the Phase 1 migration, intent_ingest_runs.batch_id had a
// bare UNIQUE constraint, so tenant B's upsert would silently overwrite
// tenant A's run row.
func TestIntentIngestRuns_BatchIDScopedPerTenant(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	batchID := "shared-batch-name-" + uuid.New().String()[:8]
	tenantA := uuid.New().String()
	tenantB := uuid.New().String()

	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM intent_ingest_runs WHERE batch_id = $1", batchID)
	}()

	if err := db.UpsertIngestRun(ctx, db.DB, uuid.New().String(), batchID, tenantA, "", "", "", "", 10, 9, 1, 0, "COMPLETED"); err != nil {
		t.Fatalf("UpsertIngestRun for tenant A failed: %v", err)
	}
	if err := db.UpsertIngestRun(ctx, db.DB, uuid.New().String(), batchID, tenantB, "", "", "", "", 20, 18, 2, 0, "COMPLETED"); err != nil {
		t.Fatalf("UpsertIngestRun for tenant B failed: %v", err)
	}

	var count int
	if err := db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM intent_ingest_runs WHERE batch_id = $1", batchID).Scan(&count); err != nil {
		t.Fatalf("failed to count rows: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 separate intent_ingest_runs rows (one per tenant) for the same batch_id, got %d", count)
	}

	var totalA, totalB int
	if err := db.DB.QueryRowContext(ctx, "SELECT total_rows FROM intent_ingest_runs WHERE batch_id = $1 AND tenant_id = $2", batchID, tenantA).Scan(&totalA); err != nil {
		t.Fatalf("failed to read tenant A row: %v", err)
	}
	if err := db.DB.QueryRowContext(ctx, "SELECT total_rows FROM intent_ingest_runs WHERE batch_id = $1 AND tenant_id = $2", batchID, tenantB).Scan(&totalB); err != nil {
		t.Fatalf("failed to read tenant B row: %v", err)
	}
	if totalA != 10 || totalB != 20 {
		t.Fatalf("tenant rows are not independent: totalA=%d (want 10) totalB=%d (want 20)", totalA, totalB)
	}
}
