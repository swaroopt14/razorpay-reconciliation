package persistence

import (
	"context"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

// TestMappingProfiles_ValidationModeCheckConstraint is a Phase 3 regression
// test: validation_mode must default to STRICT and reject any value outside
// the documented vocabulary.
func TestMappingProfiles_ValidationModeCheckConstraint(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	profileID := "test-profile-" + uuid.New().String()[:8]

	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO mapping_profiles (profile_id, source_system, column_map)
		VALUES ($1, 'TEST', '{}')
	`, profileID)
	if err != nil {
		t.Fatalf("failed to insert mapping profile: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM mapping_profiles WHERE profile_id = $1", profileID)
	}()

	var mode string
	if err := db.DB.QueryRowContext(ctx,
		"SELECT validation_mode FROM mapping_profiles WHERE profile_id = $1", profileID,
	).Scan(&mode); err != nil {
		t.Fatalf("failed to read validation_mode: %v", err)
	}
	if mode != "STRICT" {
		t.Fatalf("expected default validation_mode to be STRICT, got %q", mode)
	}

	_, err = db.DB.ExecContext(ctx,
		"UPDATE mapping_profiles SET validation_mode = 'NOT_A_REAL_MODE' WHERE profile_id = $1", profileID)
	if err == nil {
		t.Fatal("expected CHECK constraint to reject an unrecognized validation_mode value, but UPDATE succeeded")
	}
}
