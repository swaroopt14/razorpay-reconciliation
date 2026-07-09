package services

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

// TestLoadTenantSynonyms_LoadsAndCaches is a Phase 3 regression test: a
// tenant's active synonym rows must be loaded into the source_key ->
// canonical_path map the normalizer expects, and the in-memory cache must
// return stale data until explicitly invalidated (matching the mapping
// profile cache's documented contract).
func TestLoadTenantSynonyms_LoadsAndCaches(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	tenantID := uuid.New()

	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO tenant_synonym_profiles (tenant_id, source_key, canonical_path, is_active)
		VALUES ($1, 'Vendor Name', 'beneficiary.name', true)
	`, tenantID)
	if err != nil {
		t.Fatalf("failed to insert tenant synonym: %v", err)
	}
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM tenant_synonym_profiles WHERE tenant_id = $1", tenantID)
	}()

	synonyms := loadTenantSynonyms(ctx, db.DB, tenantID)
	if synonyms["vendor name"] != "beneficiary.name" {
		t.Fatalf("expected loaded synonym 'vendor name' -> 'beneficiary.name', got %v", synonyms)
	}

	// Insert a second row directly (bypassing the cache) — the cached result
	// must NOT reflect it until invalidated.
	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO tenant_synonym_profiles (tenant_id, source_key, canonical_path, is_active)
		VALUES ($1, 'Party', 'beneficiary.name', true)
	`, tenantID)
	if err != nil {
		t.Fatalf("failed to insert second tenant synonym: %v", err)
	}

	staleSynonyms := loadTenantSynonyms(ctx, db.DB, tenantID)
	if _, ok := staleSynonyms["party"]; ok {
		t.Fatal("expected cached synonym map to NOT include the new row before invalidation")
	}

	InvalidateTenantSynonymCache(tenantID)
	freshSynonyms := loadTenantSynonyms(ctx, db.DB, tenantID)
	if freshSynonyms["party"] != "beneficiary.name" {
		t.Fatalf("expected fresh load after invalidation to include 'party' -> 'beneficiary.name', got %v", freshSynonyms)
	}
}
