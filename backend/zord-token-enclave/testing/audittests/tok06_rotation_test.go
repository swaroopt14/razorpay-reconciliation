package audittests

// TOK-06: "Replace runtime schema creation with migrations and tests."
// Real-Postgres tests for services.TokenService's key rotation lifecycle --
// the "rotation" half of the acceptance test. Same TEST_DATABASE_URL gating
// as tok06_repository_integration_test.go.
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK06_Rotation -v

import (
	"context"
	"testing"
	"time"

	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/services"

	"github.com/google/uuid"
)

// TestTOK06_RotationFullLifecycle proves the real rotate -> migrate cycle:
// tokens created under the original key end up re-encrypted under the new
// key, the old key is retired once nothing references it, and detokenize
// still recovers the original plaintext through the new key.
func TestTOK06_RotationFullLifecycle(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo)
	svc := services.NewTokenService(repo, km, []byte("rotation-test-secret"))
	ctx := context.Background()

	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{
		"account_number": "1234567890",
		"email":          "person@example.com",
	})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}

	oldKey, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() before rotation error = %v", err)
	}

	if rotated, err := svc.RotateKey(ctx, tenantID, "test-rotation"); err != nil || !rotated {
		t.Fatalf("RotateKey() rotated=%v err = %v", rotated, err)
	}
	newKey, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() after rotation error = %v", err)
	}
	if newKey.KeyID == oldKey.KeyID {
		t.Fatal("RotateKey() did not change the active key")
	}

	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() error = %v", err)
	}

	remaining, err := repo.CountTokensByKey(ctx, oldKey.KeyID)
	if err != nil {
		t.Fatalf("CountTokensByKey(old key) error = %v", err)
	}
	if remaining != 0 {
		t.Fatalf("CountTokensByKey(old key) = %d, want 0 -- MigrateKeys should have moved every token off the old key", remaining)
	}

	onNewKey, err := repo.CountTokensByKey(ctx, newKey.KeyID)
	if err != nil {
		t.Fatalf("CountTokensByKey(new key) error = %v", err)
	}
	if onNewKey != len(tokens) {
		t.Fatalf("CountTokensByKey(new key) = %d, want %d (all migrated tokens)", onNewKey, len(tokens))
	}

	// The old key must now be RETIRED (MigrateKeys marks it once count hits 0).
	if _, err := repo.GetRetiringKey(ctx, tenantID); err == nil {
		t.Fatal("GetRetiringKey() still found a RETIRING key after migration completed -- old key should be RETIRED, not RETIRING")
	}

	// Detokenize must still recover the original values, now via the new key.
	plain, err := svc.DetokenizeFields(ctx, services.DetokenizeContext{
		TenantID: tenantID, Caller: "test", PurposeCode: "TEST", ObjectRef: "test",
	}, tokens)
	if err != nil {
		t.Fatalf("DetokenizeFields() after migration error = %v", err)
	}
	if plain["account_number"] != "1234567890" || plain["email"] != "person@example.com" {
		t.Fatalf("DetokenizeFields() after migration = %+v, want original values recovered through the new key", plain)
	}

	t.Log("CONFIRMED: full rotate -> migrate cycle re-encrypts every token under the new key, retires the old key, and detokenize still recovers the original plaintext.")
}

// TestTOK06_AutoRotateKeysTriggersOnAge proves AutoRotateKeys actually finds
// and rotates a key once it's past the 10-month threshold
// (token_service.go's AutoRotateKeys), without any manual RotateKey call.
func TestTOK06_AutoRotateKeysTriggersOnAge(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo)
	svc := services.NewTokenService(repo, km, []byte("auto-rotation-test-secret"))
	ctx := context.Background()

	tenantID := uuid.New().String()
	if rotated, err := svc.RotateKey(ctx, tenantID, "bootstrap"); err != nil || !rotated {
		t.Fatalf("RotateKey() bootstrap rotated=%v err = %v", rotated, err)
	}
	original, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() error = %v", err)
	}

	// Backdate active_from past the 10-month auto-rotation threshold.
	backdated := time.Now().AddDate(0, -11, 0)
	if _, err := db.ExecContext(ctx,
		`UPDATE token_encryption_keys SET active_from = $1 WHERE key_id = $2`,
		backdated, original.KeyID,
	); err != nil {
		t.Fatalf("backdating active_from failed: %v", err)
	}

	if err := svc.AutoRotateKeys(ctx); err != nil {
		t.Fatalf("AutoRotateKeys() error = %v", err)
	}

	rotated, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() after AutoRotateKeys error = %v", err)
	}
	if rotated.KeyID == original.KeyID {
		t.Fatal("AutoRotateKeys() did not rotate a key that was well past the 10-month threshold")
	}

	t.Logf("CONFIRMED: AutoRotateKeys automatically rotated a stale key (%s -> %s) without manual intervention.", original.KeyID, rotated.KeyID)
}

// TestTOK06_AutoRotateKeysLeavesFreshKeysAlone is the negative case: a key
// well within its lifetime must NOT be rotated -- proves AutoRotateKeys
// isn't just rotating everything indiscriminately.
func TestTOK06_AutoRotateKeysLeavesFreshKeysAlone(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo)
	svc := services.NewTokenService(repo, km, []byte("auto-rotation-fresh-secret"))
	ctx := context.Background()

	tenantID := uuid.New().String()
	if rotated, err := svc.RotateKey(ctx, tenantID, "bootstrap"); err != nil || !rotated {
		t.Fatalf("RotateKey() bootstrap rotated=%v err = %v", rotated, err)
	}
	original, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() error = %v", err)
	}

	if err := svc.AutoRotateKeys(ctx); err != nil {
		t.Fatalf("AutoRotateKeys() error = %v", err)
	}

	stillActive, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() after AutoRotateKeys error = %v", err)
	}
	if stillActive.KeyID != original.KeyID {
		t.Fatalf("AutoRotateKeys() rotated a brand-new key (%s -> %s) -- should only rotate keys past the age threshold", original.KeyID, stillActive.KeyID)
	}
}
