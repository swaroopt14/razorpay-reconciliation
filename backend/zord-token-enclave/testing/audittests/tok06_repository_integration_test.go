package audittests

// TOK-06: "Replace runtime schema creation with migrations and tests."
// Real-Postgres integration tests for internal/repository.TokenRepository --
// gated behind TEST_DATABASE_URL (the idiomatic Go pattern for integration
// tests): `go test ./...` stays green with no database configured, but
// these are genuine, permanent tests once pointed at a real Postgres, not
// a one-off manual proof. Point it at a throwaway database and the schema
// is created via the real db/migrations (goose), the same path cmd/main.go
// runs at startup.
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK06_Repo -v

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"

	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"
)

// tok06TestDB opens a connection to TEST_DATABASE_URL and ensures the real
// migrations have been applied. Skips the test cleanly if the env var isn't set.
func tok06TestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set -- skipping real-Postgres integration test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := db.Ping(); err != nil {
		t.Fatalf("db.Ping() error = %v -- is TEST_DATABASE_URL reachable?", err)
	}

	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("goose.SetDialect() error = %v", err)
	}
	// Migrations dir is relative to this package's working directory when
	// `go test` runs (testing/audittests), so walk up to the repo root --
	// same relative path pattern already used by testing/int02_lease_projection_test.go-
	// style fixtures in this repo family.
	if err := goose.Up(db, "../../db/migrations"); err != nil {
		t.Fatalf("goose.Up() error = %v", err)
	}
	return db
}

// TestTOK06_RepoTenantIsolation proves the composite PK (tenant_id, kind,
// token_id) genuinely isolates tenants: the SAME token_id under two
// different tenants coexists as two independent rows, and Get -- which
// filters WHERE token_id = $1 AND tenant_id = $2 -- never returns one
// tenant's ciphertext for another tenant's lookup.
func TestTOK06_RepoTenantIsolation(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	sharedTokenID := "tok06-shared-token-id-" + uuid.New().String()
	tenantA := uuid.New().String()
	tenantB := uuid.New().String()

	recA := models.TokenRecord{
		TokenID: sharedTokenID, TenantID: tenantA, Kind: "email",
		Ciphertext: []byte("ciphertext-for-tenant-A"), Nonce: []byte("nonce-A-12b"),
		EncryptionKeyID: "key-A", KeyVersion: 1, Status: "ACTIVE", Actor: "test",
	}
	recB := models.TokenRecord{
		TokenID: sharedTokenID, TenantID: tenantB, Kind: "email",
		Ciphertext: []byte("ciphertext-for-tenant-B"), Nonce: []byte("nonce-B-12b"),
		EncryptionKeyID: "key-B", KeyVersion: 1, Status: "ACTIVE", Actor: "test",
	}

	if err := repo.Insert(ctx, recA); err != nil {
		t.Fatalf("Insert(tenant A) error = %v", err)
	}
	if err := repo.Insert(ctx, recB); err != nil {
		t.Fatalf("Insert(tenant B) error = %v -- the same token_id under a DIFFERENT tenant must not conflict", err)
	}

	gotA, err := repo.Get(ctx, sharedTokenID, tenantA, "test", "TEST", "", "")
	if err != nil {
		t.Fatalf("Get(tenant A) error = %v", err)
	}
	if string(gotA.Ciphertext) != "ciphertext-for-tenant-A" {
		t.Fatalf("Get(tenant A) returned ciphertext %q, want tenant A's own ciphertext -- cross-tenant leak", gotA.Ciphertext)
	}

	gotB, err := repo.Get(ctx, sharedTokenID, tenantB, "test", "TEST", "", "")
	if err != nil {
		t.Fatalf("Get(tenant B) error = %v", err)
	}
	if string(gotB.Ciphertext) != "ciphertext-for-tenant-B" {
		t.Fatalf("Get(tenant B) returned ciphertext %q, want tenant B's own ciphertext -- cross-tenant leak", gotB.Ciphertext)
	}

	// Cross-lookup: tenant A's token_id with a tenant that never inserted it
	// must not resolve to any row (the WHERE clause is on both columns).
	if _, err := repo.Get(ctx, sharedTokenID, uuid.New().String(), "test", "TEST", "", ""); err == nil {
		t.Fatal("Get() with a tenant_id that never inserted this token_id unexpectedly succeeded")
	}

	t.Logf("CONFIRMED: token_id %q resolves to independent, correctly-isolated data for tenant A and tenant B.", sharedTokenID)
}

// TestTOK06_RepoActiveKeyIsolatedPerTenant proves two different tenants can
// each hold their own ACTIVE encryption key concurrently (the partial
// unique index idx_one_active_key_per_tenant is scoped by tenant_id, not
// global), and that rotating one tenant's key never touches another's.
func TestTOK06_RepoActiveKeyIsolatedPerTenant(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	tenantA := uuid.New().String()
	tenantB := uuid.New().String()
	keyAv1 := uuid.New().String()
	keyBv1 := uuid.New().String()
	keyAv2 := uuid.New().String()

	if rotated, err := repo.RotateKey(ctx, tenantA, keyAv1, make([]byte, 32), "test-kms-key", "test"); err != nil || !rotated {
		t.Fatalf("RotateKey(tenant A, initial) rotated=%v err = %v", rotated, err)
	}
	if rotated, err := repo.RotateKey(ctx, tenantB, keyBv1, make([]byte, 32), "test-kms-key", "test"); err != nil || !rotated {
		t.Fatalf("RotateKey(tenant B, initial) rotated=%v err = %v", rotated, err)
	}

	activeA, err := repo.GetActiveKey(ctx, tenantA)
	if err != nil {
		t.Fatalf("GetActiveKey(tenant A) error = %v", err)
	}
	activeB, err := repo.GetActiveKey(ctx, tenantB)
	if err != nil {
		t.Fatalf("GetActiveKey(tenant B) error = %v", err)
	}
	if activeA.KeyID != keyAv1 || activeB.KeyID != keyBv1 {
		t.Fatalf("active keys got mixed up: tenant A has %q, tenant B has %q", activeA.KeyID, activeB.KeyID)
	}

	// Rotate tenant A again -- tenant B's active key must be completely unaffected.
	if rotated, err := repo.RotateKey(ctx, tenantA, keyAv2, make([]byte, 32), "test-kms-key", "test"); err != nil || !rotated {
		t.Fatalf("RotateKey(tenant A, second rotation) rotated=%v err = %v", rotated, err)
	}
	stillActiveB, err := repo.GetActiveKey(ctx, tenantB)
	if err != nil {
		t.Fatalf("GetActiveKey(tenant B) after tenant A's rotation error = %v", err)
	}
	if stillActiveB.KeyID != keyBv1 {
		t.Fatalf("tenant B's active key changed to %q after tenant A rotated -- rotation is not tenant-isolated", stillActiveB.KeyID)
	}

	newActiveA, err := repo.GetActiveKey(ctx, tenantA)
	if err != nil {
		t.Fatalf("GetActiveKey(tenant A) after rotation error = %v", err)
	}
	if newActiveA.KeyID != keyAv2 {
		t.Fatalf("tenant A's active key = %q, want %q after rotation", newActiveA.KeyID, keyAv2)
	}

	t.Log("CONFIRMED: each tenant holds its own independent ACTIVE key; rotating one tenant never affects another's.")
}
