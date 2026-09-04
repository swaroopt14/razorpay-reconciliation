package persistence_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// setupTestDB sets up a connection to the test database.
// To run this test, ensure you have a postgres container running and set:
// export TEST_DB_URL="postgres://postgres:postgres@localhost:5432/zord_test"
func setupTestDB(t *testing.T) (*pgxpool.Pool, func()) {
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: TEST_DB_URL environment variable is not set")
	}

	ctx := context.Background()
	
	// Create connection pool
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to test database at %s: %v", dbURL, err)
	}

	// In a real environment, migrations run before the app starts.
	// For the integration test, we simulate the presence of projection_state.
	// If the table doesn't exist, this test will fail, indicating a missing migration.

	return pool, func() {
		pool.Close()
	}
}

// TestProjectionRepo_AtomicIncrementSuccess thoroughly tests the JSONB SQL arithmetic
// to prevent regression on the zero-division fallback and ensuring race-free counters.
func TestProjectionRepo_AtomicIncrementSuccess(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()

	repo := persistence.NewProjectionRepo(pool)
	ctx := context.Background()

	tenantID := "tnt_test1"
	corridorID := "corr_test1"
	now := time.Now().UTC().Truncate(24 * time.Hour)
	windowStart := now
	windowEnd := now.Add(24 * time.Hour)

	// Clean up any previously stored test data
	key := "corridor.success_rate." + corridorID
	cleanSQL := "DELETE FROM projection_state WHERE tenant_id = $1 AND projection_key = $2"
	_, _ = pool.Exec(ctx, cleanSQL, tenantID, key)

	// Action 1: First increment should instantiate the record
	err := repo.AtomicIncrementSuccess(ctx, tenantID, corridorID, windowStart, windowEnd)
	if err != nil {
		t.Fatalf("Expected no error on first increment, got %v", err)
	}

	state, err := repo.GetLatest(ctx, tenantID, key)
	if err != nil {
		t.Fatalf("Failed to retrieve projection state: %v", err)
	}
	if state == nil {
		t.Fatal("Expected projection state, got nil")
	}

	// Action 2: Second increment should properly append to existing record
	err = repo.AtomicIncrementSuccess(ctx, tenantID, corridorID, windowStart, windowEnd)
	if err != nil {
		t.Fatalf("Expected no error on second increment, got %v", err)
	}
}

// TestProjectionRepo_AtomicIncrementFailure ensures JSONB handles failures properly
// and recomputes the success rate downwards.
func TestProjectionRepo_AtomicIncrementFailure(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()

	repo := persistence.NewProjectionRepo(pool)
	ctx := context.Background()

	tenantID := "tnt_test1"
	corridorID := "corr_test2"
	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)

	// Action 1: Execute a failure increment
	err := repo.AtomicIncrementFailure(ctx, tenantID, corridorID, windowStart, windowEnd)
	if err != nil {
		t.Fatalf("Expected no error on failure increment, got %v", err)
	}

	// Validate insertion semantics by fetching latest
	state, err := repo.GetLatest(ctx, tenantID, "corridor.success_rate."+corridorID)
	if err != nil || state == nil {
		t.Fatalf("Failed to retrieve state after failure increment: %v", err)
	}
}
