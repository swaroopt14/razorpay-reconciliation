package audittests

// TOK-05: "Scope token-key updates by the full composite identity."
// Real-Postgres tests against the REAL TokenRepository.UpdateTokenKey --
// gated behind TEST_DATABASE_URL, same convention as tok06/tok07/tok08.
//
// The literal acceptance test: "Cross-tenant collision test cannot update
// another row; zero/multiple rows abort rotation."
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK05_ -v

import (
	"context"
	"database/sql"
	"testing"

	"github.com/google/uuid"

	"zord-token-enclave/internal/repository"
)

// seedTokenRow inserts a minimal token_map row directly via SQL (bypassing
// the service layer -- these tests are about the repository's own defensive
// scoping, not the tokenize flow) and returns nothing; callers assert
// against the row afterward.
func seedTokenRow(t *testing.T, db *sql.DB, tokenID, tenantID, kind string, ciphertext, nonce []byte, keyID string, keyVersion int) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), `
		INSERT INTO token_encryption_keys (key_id, tenant_id, key_version, encrypted_key, wrapped, status, active_from, created_by)
		VALUES ($1, $2, $3, 'fake-wrapped-key', false, 'ACTIVE', now(), 'test')
		ON CONFLICT (key_id) DO NOTHING
	`, keyID, tenantID, keyVersion); err != nil {
		t.Fatalf("seed key row error = %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
		INSERT INTO token_map (token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', now())
	`, tokenID, tenantID, kind, ciphertext, nonce, keyID, keyVersion); err != nil {
		t.Fatalf("seed token row error = %v", err)
	}
}

func readTokenRow(t *testing.T, db *sql.DB, tokenID, tenantID string) (ciphertext, nonce []byte, encryptionKeyID string, keyVersion int) {
	t.Helper()
	err := db.QueryRowContext(context.Background(), `
		SELECT ciphertext, nonce, encryption_key_id, key_version
		FROM token_map WHERE token_id = $1 AND tenant_id = $2
	`, tokenID, tenantID).Scan(&ciphertext, &nonce, &encryptionKeyID, &keyVersion)
	if err != nil {
		t.Fatalf("readTokenRow(%s, %s) error = %v", tokenID, tenantID, err)
	}
	return
}

// TestTOK05_UpdateTokenKeySucceedsForTheOwningTenant is the baseline
// positive case: the correct composite identity updates the row exactly
// as intended.
func TestTOK05_UpdateTokenKeySucceedsForTheOwningTenant(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	tenantID := uuid.New().String()
	tokenID := "zrd_" + uuid.New().String()
	oldKeyID := uuid.New().String()
	newKeyID := uuid.New().String()

	seedTokenRow(t, db, tokenID, tenantID, "account_number", []byte("old-ciphertext"), []byte("old-nonce123"), oldKeyID, 1)

	err := repo.UpdateTokenKey(ctx, tenantID, "account_number", tokenID, []byte("new-ciphertext"), []byte("new-nonce123"), newKeyID, 2)
	if err != nil {
		t.Fatalf("UpdateTokenKey() error = %v", err)
	}

	ciphertext, nonce, keyID, version := readTokenRow(t, db, tokenID, tenantID)
	if string(ciphertext) != "new-ciphertext" || string(nonce) != "new-nonce123" || keyID != newKeyID || version != 2 {
		t.Fatalf("row not updated correctly: ciphertext=%q nonce=%q keyID=%q version=%d", ciphertext, nonce, keyID, version)
	}

	t.Log("CONFIRMED: UpdateTokenKey with the correct composite identity updates the row exactly as intended.")
}

// TestTOK05_CrossTenantCollisionCannotUpdateAnotherRow is the LITERAL
// acceptance test: seed the SAME token_id under two different tenants
// (simulating a token_id collision -- the real primary key is
// (tenant_id, kind, token_id), so this is a legitimate, supported state,
// not a corrupted one), then update ONE tenant's row and confirm the
// OTHER tenant's row is completely untouched.
func TestTOK05_CrossTenantCollisionCannotUpdateAnotherRow(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	sharedTokenID := "zrd_shared_" + uuid.New().String()
	tenantA := uuid.New().String()
	tenantB := uuid.New().String()
	keyA := uuid.New().String()
	keyB := uuid.New().String()

	seedTokenRow(t, db, sharedTokenID, tenantA, "account_number", []byte("tenant-A-ciphertext"), []byte("tenant-A-nonce1"), keyA, 1)
	seedTokenRow(t, db, sharedTokenID, tenantB, "account_number", []byte("tenant-B-ciphertext"), []byte("tenant-B-nonce1"), keyB, 1)

	// Rotate ONLY tenant B's key.
	newKeyB := uuid.New().String()
	if err := repo.UpdateTokenKey(ctx, tenantB, "account_number", sharedTokenID, []byte("tenant-B-NEW-ciphertext"), []byte("tenant-B-NEW-nonce"), newKeyB, 2); err != nil {
		t.Fatalf("UpdateTokenKey(tenant B) error = %v", err)
	}

	// Tenant B's row must reflect the update.
	ciphertextB, _, keyIDB, versionB := readTokenRow(t, db, sharedTokenID, tenantB)
	if string(ciphertextB) != "tenant-B-NEW-ciphertext" || keyIDB != newKeyB || versionB != 2 {
		t.Fatalf("tenant B's own row was not updated: ciphertext=%q keyID=%q version=%d", ciphertextB, keyIDB, versionB)
	}

	// Tenant A's row -- SAME token_id -- must be COMPLETELY UNTOUCHED.
	ciphertextA, nonceA, keyIDA, versionA := readTokenRow(t, db, sharedTokenID, tenantA)
	if string(ciphertextA) != "tenant-A-ciphertext" || string(nonceA) != "tenant-A-nonce1" || keyIDA != keyA || versionA != 1 {
		t.Fatalf("CROSS-TENANT CORRUPTION: tenant A's row changed when only tenant B was rotated -- ciphertext=%q nonce=%q keyID=%q version=%d", ciphertextA, nonceA, keyIDA, versionA)
	}

	t.Log("CONFIRMED: rotating tenant B's key for a token_id shared with tenant A never touches tenant A's row -- the full composite identity (tenant_id, kind, token_id) is what's actually scoped, not token_id alone.")
}

// TestTOK05_MismatchedTenantAbortsRotation is the "programming error"
// half of the Problem statement: calling UpdateTokenKey with a tenant_id
// that does NOT own the given token_id must return an error (abort), not
// silently succeed as a no-op -- and the real owning tenant's row must
// stay completely unchanged.
func TestTOK05_MismatchedTenantAbortsRotation(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	realTenant := uuid.New().String()
	wrongTenant := uuid.New().String() // never inserted anything
	tokenID := "zrd_" + uuid.New().String()
	keyID := uuid.New().String()

	seedTokenRow(t, db, tokenID, realTenant, "email", []byte("original-ciphertext"), []byte("original-nonce1"), keyID, 1)

	err := repo.UpdateTokenKey(ctx, wrongTenant, "email", tokenID, []byte("attacker-ciphertext"), []byte("attacker-nonce1"), uuid.New().String(), 2)
	if err == nil {
		t.Fatal("UpdateTokenKey() with a tenant_id that doesn't own this token_id succeeded -- should have aborted with zero rows affected")
	}

	// The real owner's row must be completely unchanged.
	ciphertext, nonce, gotKeyID, version := readTokenRow(t, db, tokenID, realTenant)
	if string(ciphertext) != "original-ciphertext" || string(nonce) != "original-nonce1" || gotKeyID != keyID || version != 1 {
		t.Fatalf("real owner's row was modified by a mismatched-tenant call: ciphertext=%q nonce=%q keyID=%q version=%d", ciphertext, nonce, gotKeyID, version)
	}

	t.Logf("CONFIRMED: a mismatched tenant_id aborts with an error (%v) instead of silently no-op-succeeding, and the real owner's row is untouched.", err)
}

// TestTOK05_MismatchedKindAbortsRotation is the same defensive check for
// kind specifically -- the same tenant, the same token_id, but the wrong
// kind must also abort rather than match nothing silently.
func TestTOK05_MismatchedKindAbortsRotation(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	tenantID := uuid.New().String()
	tokenID := "zrd_" + uuid.New().String()
	keyID := uuid.New().String()

	seedTokenRow(t, db, tokenID, tenantID, "phone", []byte("phone-ciphertext"), []byte("phone-nonce123"), keyID, 1)

	err := repo.UpdateTokenKey(ctx, tenantID, "email", tokenID, []byte("wrong-kind-ciphertext"), []byte("wrong-kind-nonce"), uuid.New().String(), 2)
	if err == nil {
		t.Fatal("UpdateTokenKey() with the wrong kind for this token_id succeeded -- should have aborted with zero rows affected")
	}

	ciphertext, _, gotKeyID, version := readTokenRow(t, db, tokenID, tenantID)
	if string(ciphertext) != "phone-ciphertext" || gotKeyID != keyID || version != 1 {
		t.Fatalf("row was modified by a mismatched-kind call: ciphertext=%q keyID=%q version=%d", ciphertext, gotKeyID, version)
	}

	t.Log("CONFIRMED: a mismatched kind aborts the rotation instead of silently no-op-succeeding.")
}

// TestTOK05_SuccessfulUpdateWritesImmutableAuditRow proves the "wrap
// rotation in transaction and immutable audit" half of the practical
// implementation: a successful UpdateTokenKey leaves a real, permanent
// token_audit row behind.
func TestTOK05_SuccessfulUpdateWritesImmutableAuditRow(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	tenantID := uuid.New().String()
	tokenID := "zrd_" + uuid.New().String()
	keyID := uuid.New().String()
	newKeyID := uuid.New().String()

	seedTokenRow(t, db, tokenID, tenantID, "vpa", []byte("vpa-ciphertext"), []byte("vpa-nonce1234"), keyID, 1)

	if err := repo.UpdateTokenKey(ctx, tenantID, "vpa", tokenID, []byte("new-vpa-ciphertext"), []byte("new-vpa-nonce1"), newKeyID, 2); err != nil {
		t.Fatalf("UpdateTokenKey() error = %v", err)
	}

	var count int
	var objectRef string
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*), MAX(object_ref) FROM token_audit
		WHERE token_id = $1 AND tenant_id = $2 AND action = 'KEY_ROTATION'
	`, tokenID, tenantID).Scan(&count, &objectRef); err != nil {
		t.Fatalf("query audit row error = %v", err)
	}
	if count != 1 {
		t.Fatalf("token_audit KEY_ROTATION row count = %d, want 1", count)
	}
	if objectRef != newKeyID {
		t.Fatalf("audit row object_ref = %q, want the new key_id %q", objectRef, newKeyID)
	}

	t.Log("CONFIRMED: a successful UpdateTokenKey writes exactly one immutable KEY_ROTATION token_audit row, atomically with the update.")
}

// TestTOK05_AbortedUpdateWritesNoAuditRow proves the atomicity half: when
// UpdateTokenKey aborts (mismatched identity), NO audit row leaks through
// either -- the whole transaction rolled back, not just the UPDATE.
func TestTOK05_AbortedUpdateWritesNoAuditRow(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()

	realTenant := uuid.New().String()
	wrongTenant := uuid.New().String()
	tokenID := "zrd_" + uuid.New().String()
	keyID := uuid.New().String()

	seedTokenRow(t, db, tokenID, realTenant, "ifsc", []byte("ifsc-ciphertext"), []byte("ifsc-nonce1234"), keyID, 1)

	if err := repo.UpdateTokenKey(ctx, wrongTenant, "ifsc", tokenID, []byte("x"), []byte("y"), uuid.New().String(), 2); err == nil {
		t.Fatal("expected UpdateTokenKey to abort with an error")
	}

	var count int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM token_audit WHERE token_id = $1 AND action = 'KEY_ROTATION'
	`, tokenID).Scan(&count); err != nil {
		t.Fatalf("query audit row error = %v", err)
	}
	if count != 0 {
		t.Fatalf("token_audit has %d KEY_ROTATION row(s) for an ABORTED rotation, want 0 -- the transaction did not roll back atomically", count)
	}

	t.Log("CONFIRMED: an aborted rotation leaves zero audit rows behind -- the update and its audit entry are genuinely atomic.")
}
