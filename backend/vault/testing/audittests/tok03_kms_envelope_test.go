package audittests

// TOK-03: "Actually wrap tenant DEKs with the master/KMS key."
//
// Two layers, mirroring this service's established TEST_DATABASE_URL
// convention: fast, network-free tests against the realistic fake KMSClient
// (fake_kms_client_test.go) that still genuinely prove context-mismatch
// failure (real AES-GCM AEAD auth failure, not a rigged check); and
// TEST_KMS_KEY_ID-gated tests against the real CMK created for this
// ticket, for genuine end-to-end proof against live AWS KMS.
//
// Run fake-KMS tests:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK03_Fake -v
//
// Run real-KMS tests:
//   TEST_DATABASE_URL=... TEST_KMS_KEY_ID="arn:aws:kms:..." \
//   go test ./testing/... -run TestTOK03_RealKMS -v

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	awskms "github.com/aws/aws-sdk-go-v2/service/kms"

	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/services"
)

// ---------------------------------------------------------------------
// Fake-KMS tests -- fast, no AWS needed, run in every `go test ./...`.
// ---------------------------------------------------------------------

// TestTOK03_FakeWrapUnwrapRoundTrip proves the full RotateKey -> Tokenize ->
// DetokenizeFields path works when DEKs are KMS-wrapped: the wrapped blob
// stored in the DB is never usable directly, only what keymanager returns
// after a genuine unwrap is.
func TestTOK03_FakeWrapUnwrapRoundTrip(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	fake := newFakeKMSClient("test-kms-key")
	km := keymanager.NewKeyManager(repo, fake, "test-kms-key")
	svc := services.NewTokenService(repo, km, []byte("tok03-roundtrip-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{
		"account_number": "1234567890",
	})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}

	// The literal acceptance test: raw database dump contains no usable DEK.
	activeKey, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() (raw repo, no unwrap) error = %v", err)
	}
	if !activeKey.Wrapped {
		t.Fatal("active key row is not marked wrapped=true")
	}
	if len(activeKey.RawKey) == 32 {
		t.Fatal("raw DB column is exactly 32 bytes -- looks like an unwrapped DEK, not a KMS ciphertext blob")
	}
	encryptCalls, _ := fake.callCounts()
	if encryptCalls == 0 {
		t.Fatal("WrapNewDEK never actually called KMS Encrypt")
	}

	plain, err := svc.DetokenizeFields(ctx, services.DetokenizeContext{
		TenantID: tenantID, Caller: "test", PurposeCode: "TEST", ObjectRef: "test",
	}, tokens)
	if err != nil {
		t.Fatalf("DetokenizeFields() error = %v", err)
	}
	if plain["account_number"] != "1234567890" {
		t.Fatalf("DetokenizeFields() = %+v, want original value recovered through the unwrap path", plain)
	}

	t.Log("CONFIRMED: wrap -> store -> unwrap round trip works; raw DB column is not a usable 32-byte DEK.")
}

// TestTOK03_FakeWrongContextCannotUnwrap is the literal acceptance test
// "wrong KMS context cannot unwrap": a DEK wrapped under tenant A's context
// must fail to decrypt under tenant B's context, even with the SAME
// ciphertext bytes and the SAME KMS key -- proving EncryptionContext
// actually gates access, not just the key ID.
func TestTOK03_FakeWrongContextCannotUnwrap(t *testing.T) {
	fake := newFakeKMSClient("test-kms-key")
	ctx := context.Background()

	wrapped, err := fake.Encrypt(ctx, []byte("a-fake-32-byte-dek-for-testing!!"), map[string]string{"tenant_id": "tenant-A"})
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}

	// Correct context: succeeds.
	plain, err := fake.Decrypt(ctx, wrapped, "test-kms-key", map[string]string{"tenant_id": "tenant-A"})
	if err != nil {
		t.Fatalf("Decrypt() with correct context error = %v", err)
	}
	if string(plain) != "a-fake-32-byte-dek-for-testing!!" {
		t.Fatalf("Decrypt() with correct context = %q, want original plaintext", plain)
	}

	// Wrong context: must fail.
	if _, err := fake.Decrypt(ctx, wrapped, "test-kms-key", map[string]string{"tenant_id": "tenant-B"}); err == nil {
		t.Fatal("Decrypt() with WRONG tenant context succeeded -- cross-tenant unwrap is possible, EncryptionContext is not being enforced")
	}

	t.Log("CONFIRMED: decrypting with the wrong tenant_id context fails (genuine AEAD auth failure), matching real AWS KMS's InvalidCiphertextException behavior.")
}

// TestTOK03_FakeCacheReducesKMSCalls proves the 5-minute in-memory cache
// actually avoids a second KMS round trip for the same key within its TTL.
func TestTOK03_FakeCacheReducesKMSCalls(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	fake := newFakeKMSClient("test-kms-key")
	km := keymanager.NewKeyManager(repo, fake, "test-kms-key")
	svc := services.NewTokenService(repo, km, []byte("tok03-cache-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	if rotated, err := svc.RotateKey(ctx, tenantID, "bootstrap"); err != nil || !rotated {
		t.Fatalf("RotateKey() rotated=%v err=%v", rotated, err)
	}

	if _, err := km.GetActiveKey(ctx, tenantID); err != nil {
		t.Fatalf("GetActiveKey() #1 error = %v", err)
	}
	_, decryptsAfterFirst := fake.callCounts()
	if decryptsAfterFirst == 0 {
		t.Fatal("first GetActiveKey() never called KMS Decrypt -- cache pre-populated unexpectedly")
	}

	if _, err := km.GetActiveKey(ctx, tenantID); err != nil {
		t.Fatalf("GetActiveKey() #2 error = %v", err)
	}
	_, decryptsAfterSecond := fake.callCounts()
	if decryptsAfterSecond != decryptsAfterFirst {
		t.Fatalf("decrypt call count grew from %d to %d on a second GetActiveKey() within the cache TTL -- cache is not being used", decryptsAfterFirst, decryptsAfterSecond)
	}

	t.Log("CONFIRMED: a second GetActiveKey() for the same key within the 5-minute TTL served from cache, no extra KMS call.")
}

// TestTOK03_FakeLegacyUnwrappedRowNeedsNoKMS proves rows written before this
// ticket (wrapped=false) stay readable with ZERO KMS calls -- the gradual-
// transition safety net.
func TestTOK03_FakeLegacyUnwrappedRowNeedsNoKMS(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	fake := newFakeKMSClient("test-kms-key")
	km := keymanager.NewKeyManager(repo, fake, "test-kms-key")
	ctx := context.Background()
	tenantID := uuid.New().String()
	keyID := uuid.New().String()
	rawDEK := make([]byte, 32)
	for i := range rawDEK {
		rawDEK[i] = byte(i)
	}

	// Simulate a pre-TOK-03 row: wrapped=false, encrypted_key is a raw DEK.
	if _, err := db.ExecContext(ctx, `
		INSERT INTO token_encryption_keys (key_id, tenant_id, key_version, encrypted_key, wrapped, status, active_from, created_by)
		VALUES ($1, $2, 1, $3, false, 'ACTIVE', now(), 'legacy-seed')
	`, keyID, tenantID, rawDEK); err != nil {
		t.Fatalf("seed legacy row error = %v", err)
	}

	key, err := km.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() on legacy row error = %v", err)
	}
	if string(key.RawKey) != string(rawDEK) {
		t.Fatalf("GetActiveKey() on legacy row returned %v, want the raw DEK unchanged", key.RawKey)
	}
	encryptCalls, decryptCalls := fake.callCounts()
	if encryptCalls != 0 || decryptCalls != 0 {
		t.Fatalf("legacy (wrapped=false) row triggered a KMS call (encrypt=%d, decrypt=%d) -- should need none", encryptCalls, decryptCalls)
	}

	t.Log("CONFIRMED: a legacy wrapped=false row is read with zero KMS calls, exactly today's pre-TOK-03 behavior.")
}

// TestTOK03_FakeRetiringKeyMigrationBug is a direct regression test for the
// bug found during TOK-03 implementation: doMigrateKeys used to call
// repository.GetRetiringKey directly, bypassing unwrap entirely. Without
// the fix, this test hard-crashes (crypto.NewCrypto rejects a non-32-byte
// "key") the moment a tenant rotates a SECOND time, since by then the
// RETIRING key is a wrapped KMS blob, not a raw DEK.
func TestTOK03_FakeRetiringKeyMigrationBug(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	fake := newFakeKMSClient("test-kms-key")
	km := keymanager.NewKeyManager(repo, fake, "test-kms-key")
	svc := services.NewTokenService(repo, km, []byte("tok03-retiring-bug-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "1234567890"})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}

	// First rotation: RETIRING key is the bootstrap key (also wrapped, but
	// this rotation alone wouldn't have caught the bug -- migrate it fully first).
	if rotated, err := svc.RotateKey(ctx, tenantID, "rotation-1"); err != nil || !rotated {
		t.Fatalf("RotateKey() #1 rotated=%v err=%v", rotated, err)
	}
	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() #1 error = %v -- this is the exact bug: doMigrateKeys must unwrap the RETIRING key, not pass its wrapped bytes straight to crypto.NewCrypto", err)
	}

	// Second rotation: NOW the RETIRING key (the one from rotation #1) is
	// definitely wrapped -- this is the scenario that would crash pre-fix.
	if rotated, err := svc.RotateKey(ctx, tenantID, "rotation-2"); err != nil || !rotated {
		t.Fatalf("RotateKey() #2 rotated=%v err=%v", rotated, err)
	}
	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() #2 error = %v -- doMigrateKeys crashed migrating a WRAPPED retiring key, the exact bug found during TOK-03", err)
	}

	plain, err := svc.DetokenizeFields(ctx, services.DetokenizeContext{
		TenantID: tenantID, Caller: "test", PurposeCode: "TEST", ObjectRef: "test",
	}, tokens)
	if err != nil {
		t.Fatalf("DetokenizeFields() after 2 rotations error = %v", err)
	}
	if plain["account_number"] != "1234567890" {
		t.Fatalf("DetokenizeFields() after 2 rotations = %+v, want original value", plain)
	}

	t.Log("CONFIRMED: a tenant surviving TWO rotations (RETIRING key genuinely wrapped both times) migrates and decrypts correctly -- the GetRetiringKey-bypass bug is fixed.")
}

// TestTOK03_FakeMigrateJobFailsCleanlyOnDecryptError is a fault-injection
// test: force the fake KMS's Decrypt to fail and confirm MigrateKeys
// surfaces a real error (not a silent no-op or a crash) and the
// TOK-07 job-state table records FAILED.
func TestTOK03_FakeMigrateJobFailsCleanlyOnDecryptError(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	fake := newFakeKMSClient("test-kms-key")
	km := keymanager.NewKeyManager(repo, fake, "test-kms-key")
	svc := services.NewTokenService(repo, km, []byte("tok03-fault-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	if _, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "1234567890"}); err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}
	if rotated, err := svc.RotateKey(ctx, tenantID, "test-rotation"); err != nil || !rotated {
		t.Fatalf("RotateKey() rotated=%v err=%v", rotated, err)
	}

	fake.mu.Lock()
	fake.decryptErr = context.DeadlineExceeded // any non-nil error
	fake.mu.Unlock()

	if err := svc.MigrateKeys(ctx, tenantID); err == nil {
		t.Fatal("MigrateKeys() succeeded despite KMS Decrypt being forced to fail")
	}

	var status string
	if err := db.QueryRowContext(ctx, `
		SELECT status FROM key_rotation_jobs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 1
	`, tenantID).Scan(&status); err != nil {
		t.Fatalf("query job row error = %v", err)
	}
	if status != "FAILED" {
		t.Fatalf("job status = %q, want FAILED", status)
	}

	t.Log("CONFIRMED: a KMS decrypt failure during migration surfaces as a real error and is recorded as FAILED in key_rotation_jobs.")
}

// ---------------------------------------------------------------------
// Real-AWS-gated tests -- genuine end-to-end proof against live KMS.
// ---------------------------------------------------------------------

func tok03RealKMSClient(t *testing.T) (keymanager.KMSClient, string) {
	t.Helper()
	keyID := os.Getenv("TEST_KMS_KEY_ID")
	if keyID == "" {
		t.Skip("TEST_KMS_KEY_ID not set -- skipping real-AWS-KMS integration test")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background())
	if err != nil {
		t.Fatalf("LoadDefaultConfig() error = %v", err)
	}
	client := keymanager.NewAWSKMSClient(awskms.NewFromConfig(awsCfg), keyID)
	return client, keyID
}

// TestTOK03_RealKMSWrapUnwrapRoundTrip is TestTOK03_FakeWrapUnwrapRoundTrip
// against the REAL CMK created for this ticket.
func TestTOK03_RealKMSWrapUnwrapRoundTrip(t *testing.T) {
	db := tok06TestDB(t)
	kmsClient, keyID := tok03RealKMSClient(t)
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo, kmsClient, keyID)
	svc := services.NewTokenService(repo, km, []byte("tok03-real-roundtrip-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "9876543210"})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}

	activeKey, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() (raw repo) error = %v", err)
	}
	if !activeKey.Wrapped || len(activeKey.RawKey) == 32 {
		t.Fatalf("row does not look genuinely KMS-wrapped: wrapped=%v len=%d", activeKey.Wrapped, len(activeKey.RawKey))
	}

	plain, err := svc.DetokenizeFields(ctx, services.DetokenizeContext{
		TenantID: tenantID, Caller: "test", PurposeCode: "TEST", ObjectRef: "test",
	}, tokens)
	if err != nil {
		t.Fatalf("DetokenizeFields() error = %v", err)
	}
	if plain["account_number"] != "9876543210" {
		t.Fatalf("DetokenizeFields() = %+v, want original value recovered via REAL AWS KMS", plain)
	}

	t.Log("CONFIRMED (real AWS KMS): wrap -> store -> unwrap round trip works against the live CMK.")
}

// TestTOK03_RealKMSWrongContextCannotUnwrap proves the acceptance test
// against LIVE AWS KMS, not just the fake: decrypting with the wrong
// tenant_id context fails.
func TestTOK03_RealKMSWrongContextCannotUnwrap(t *testing.T) {
	kmsClient, keyID := tok03RealKMSClient(t)
	ctx := context.Background()

	wrapped, err := kmsClient.Encrypt(ctx, []byte("real-kms-context-test-dek-32byt"), map[string]string{"tenant_id": "tok03-tenant-A"})
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}

	if _, err := kmsClient.Decrypt(ctx, wrapped, keyID, map[string]string{"tenant_id": "tok03-tenant-A"}); err != nil {
		t.Fatalf("Decrypt() with correct context error = %v", err)
	}

	if _, err := kmsClient.Decrypt(ctx, wrapped, keyID, map[string]string{"tenant_id": "tok03-tenant-B"}); err == nil {
		t.Fatal("Decrypt() with WRONG tenant context succeeded against REAL AWS KMS -- EncryptionContext is not being enforced")
	}

	t.Log("CONFIRMED (real AWS KMS): wrong tenant_id context fails to decrypt -- verified against live AWS, not just the fake.")
}

// TestTOK03_RealKMSRetiringKeyMigration is the GetRetiringKey-bypass
// regression test against real KMS: two rotations, migrate after each,
// against the live CMK.
func TestTOK03_RealKMSRetiringKeyMigration(t *testing.T) {
	db := tok06TestDB(t)
	kmsClient, keyID := tok03RealKMSClient(t)
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo, kmsClient, keyID)
	svc := services.NewTokenService(repo, km, []byte("tok03-real-retiring-secret"))
	ctx := context.Background()
	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "1112223333"})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}

	if rotated, err := svc.RotateKey(ctx, tenantID, "rotation-1"); err != nil || !rotated {
		t.Fatalf("RotateKey() #1 rotated=%v err=%v", rotated, err)
	}
	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() #1 error = %v", err)
	}
	if rotated, err := svc.RotateKey(ctx, tenantID, "rotation-2"); err != nil || !rotated {
		t.Fatalf("RotateKey() #2 rotated=%v err=%v", rotated, err)
	}
	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() #2 error = %v -- against REAL AWS KMS, a wrapped RETIRING key must migrate cleanly", err)
	}

	plain, err := svc.DetokenizeFields(ctx, services.DetokenizeContext{
		TenantID: tenantID, Caller: "test", PurposeCode: "TEST", ObjectRef: "test",
	}, tokens)
	if err != nil {
		t.Fatalf("DetokenizeFields() error = %v", err)
	}
	if plain["account_number"] != "1112223333" {
		t.Fatalf("DetokenizeFields() = %+v, want original value", plain)
	}

	t.Log("CONFIRMED (real AWS KMS): two full rotate->migrate cycles against the live CMK, DEK genuinely re-wrapped both times, plaintext still recovers correctly.")
}
