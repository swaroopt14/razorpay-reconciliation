package audittests

// TOK-07: "Coordinate key rotation across replicas."
// Real-Postgres tests against the REAL services.TokenService /
// repository.TokenRepository call paths -- not reimplementations. Covers:
// no-corruption under concurrent RotateKey, the AutoRotateKeys staleness
// re-check ("two replicas initiate one effective rotation"), MigrateKeys
// skipping cleanly when another replica already holds the lock, and
// key_rotation_jobs' RUNNING->DONE / RUNNING->FAILED bookkeeping.
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK07_ -v

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/services"
)

func tok07NewService(db *sql.DB, secret string) (*repository.TokenRepository, *services.TokenService) {
	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo)
	return repo, services.NewTokenService(repo, km, []byte(secret))
}

// TestTOK07_ConcurrentRotateKeyNoCorruption fires many concurrent, genuinely
// unconditional RotateKey calls (the bootstrap/manual-trigger shape, which
// has no staleness check by design -- every caller really does want a
// rotation right now) at the SAME tenant. The lock means they serialize
// rather than interleave, so every one of them may legitimately succeed --
// what must NEVER happen is the corruption the audit describes: at every
// point there must be exactly one ACTIVE key for the tenant, and the
// original bug's signature (two keys stuck RETIRING because a second
// replica's UPDATE re-matched the first replica's freshly-created ACTIVE
// key) must not appear.
func TestTOK07_ConcurrentRotateKeyNoCorruption(t *testing.T) {
	db := tok06TestDB(t)
	repo, svc := tok07NewService(db, "tok07-corruption-secret")
	ctx := context.Background()
	tenantID := uuid.New().String()

	if rotated, err := svc.RotateKey(ctx, tenantID, "bootstrap"); err != nil || !rotated {
		t.Fatalf("bootstrap RotateKey() rotated=%v err=%v", rotated, err)
	}

	const n = 8
	var wg sync.WaitGroup
	rotatedFlags := make([]bool, n)
	errs := make([]error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			rotatedFlags[idx], errs[idx] = svc.RotateKey(ctx, tenantID, "concurrent-test")
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d: RotateKey() error = %v", i, err)
		}
	}

	// Exactly one ACTIVE key must exist for this tenant -- the partial
	// unique index enforces this structurally, but we check it directly to
	// make the assertion explicit and independent of that index.
	var activeCount int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM token_encryption_keys WHERE tenant_id=$1 AND status='ACTIVE'`,
		tenantID,
	).Scan(&activeCount); err != nil {
		t.Fatalf("count ACTIVE keys error = %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("ACTIVE key count for tenant = %d, want exactly 1 after %d concurrent rotations -- corruption", activeCount, n)
	}

	// key_version must be strictly increasing with no duplicates -- a torn
	// interleaving would produce a duplicate or out-of-order version.
	rows, err := db.QueryContext(ctx,
		`SELECT key_version FROM token_encryption_keys WHERE tenant_id=$1 ORDER BY key_version`, tenantID)
	if err != nil {
		t.Fatalf("query versions error = %v", err)
	}
	defer rows.Close()
	seen := map[int]bool{}
	prev := 0
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			t.Fatalf("scan version error = %v", err)
		}
		if seen[v] {
			t.Fatalf("duplicate key_version %d for tenant %s -- corruption", v, tenantID)
		}
		seen[v] = true
		if v <= prev {
			t.Fatalf("key_version out of order: %d after %d", v, prev)
		}
		prev = v
	}

	activeKey, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() error = %v", err)
	}
	t.Logf("CONFIRMED: %d concurrent RotateKey calls produced %d total key versions, exactly 1 ACTIVE (v%d), no corruption.", n, len(seen), activeKey.Version)
}

// TestTOK07_AutoRotateStalenessRecheck_OnlyOneEffectiveRotation is the
// literal acceptance test: "Two replicas initiate one effective rotation."
// Two goroutines both call RotateKeyIfStale (the function AutoRotateKeys
// uses) for a tenant whose key IS genuinely stale -- simulating two
// replicas that both independently read the same stale ActiveFrom before
// either acquired the lock. Exactly one must actually rotate; the other
// must recognize under the lock that the key is no longer stale and skip.
func TestTOK07_AutoRotateStalenessRecheck_OnlyOneEffectiveRotation(t *testing.T) {
	db := tok06TestDB(t)
	repo, svc := tok07NewService(db, "tok07-staleness-secret")
	ctx := context.Background()
	tenantID := uuid.New().String()

	if rotated, err := svc.RotateKey(ctx, tenantID, "bootstrap"); err != nil || !rotated {
		t.Fatalf("bootstrap RotateKey() rotated=%v err=%v", rotated, err)
	}
	original, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() error = %v", err)
	}

	// Backdate past the 10-month auto-rotation threshold.
	if _, err := db.ExecContext(ctx,
		`UPDATE token_encryption_keys SET active_from = $1 WHERE key_id = $2`,
		time.Now().AddDate(0, -11, 0), original.KeyID,
	); err != nil {
		t.Fatalf("backdating active_from failed: %v", err)
	}

	const maxAge = 10 * 30 * 24 * time.Hour // matches services.autoRotationMaxAge

	const n = 5 // more than 2, to stress-test "only one" isn't a lucky coincidence
	var wg sync.WaitGroup
	rotatedFlags := make([]bool, n)
	errs := make([]error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			newKey := make([]byte, 32)
			rotatedFlags[idx], errs[idx] = repo.RotateKeyIfStale(ctx, tenantID, uuid.New().String(), newKey, "auto-rotation", maxAge)
		}(i)
	}
	wg.Wait()

	rotatedCount := 0
	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d: RotateKeyIfStale() error = %v", i, err)
		}
		if rotatedFlags[i] {
			rotatedCount++
		}
	}
	if rotatedCount != 1 {
		t.Fatalf("rotatedCount = %d, want exactly 1 -- %d replicas racing the SAME stale tenant must produce exactly one effective rotation", rotatedCount, n)
	}

	newActive, err := repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		t.Fatalf("GetActiveKey() after race error = %v", err)
	}
	if newActive.KeyID == original.KeyID {
		t.Fatal("no rotation actually took effect")
	}
	if newActive.Version != original.Version+1 {
		t.Fatalf("active key version = %d, want exactly %d (one rotation, not %d)", newActive.Version, original.Version+1, rotatedCount)
	}

	t.Logf("CONFIRMED: %d replicas raced a genuinely stale tenant, exactly 1 effective rotation occurred (v%d -> v%d).", n, original.Version, newActive.Version)
}

// TestTOK07_MigrateKeysSkipsWhenAlreadyLocked proves MigrateKeys' lock-miss
// path: while another session holds the tenant's rotation lock, MigrateKeys
// must return cleanly (nil error) without attempting any work or recording
// a job row -- not block, not error.
func TestTOK07_MigrateKeysSkipsWhenAlreadyLocked(t *testing.T) {
	db := tok06TestDB(t)
	_, svc := tok07NewService(db, "tok07-migrate-skip-secret")
	ctx := context.Background()
	tenantID := uuid.New().String()

	holder, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
	if err != nil {
		t.Fatalf("TryAcquireTenantRotationLock error = %v", err)
	}
	if !ok {
		t.Fatal("expected to acquire the lock")
	}
	defer holder.Release(ctx)

	var jobCountBefore int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM key_rotation_jobs WHERE tenant_id=$1`, tenantID).Scan(&jobCountBefore); err != nil {
		t.Fatalf("count jobs before error = %v", err)
	}

	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() while locked elsewhere returned an error, want a clean skip: %v", err)
	}

	var jobCountAfter int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM key_rotation_jobs WHERE tenant_id=$1`, tenantID).Scan(&jobCountAfter); err != nil {
		t.Fatalf("count jobs after error = %v", err)
	}
	if jobCountAfter != jobCountBefore {
		t.Fatalf("MigrateKeys() recorded a job row while it never actually acquired the lock (before=%d, after=%d)", jobCountBefore, jobCountAfter)
	}

	t.Log("CONFIRMED: MigrateKeys skips cleanly (no error, no job row) when another session already holds the tenant's rotation lock.")
}

// TestTOK07_JobStateRunningToDone proves the observational job-state table
// correctly records a normal, successful migration.
func TestTOK07_JobStateRunningToDone(t *testing.T) {
	db := tok06TestDB(t)
	_, svc := tok07NewService(db, "tok07-jobstate-done-secret")
	ctx := context.Background()
	tenantID := uuid.New().String()

	tokens, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "1234567890"})
	if err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}
	if rotated, err := svc.RotateKey(ctx, tenantID, "test-rotation"); err != nil || !rotated {
		t.Fatalf("RotateKey() rotated=%v err=%v", rotated, err)
	}

	if err := svc.MigrateKeys(ctx, tenantID); err != nil {
		t.Fatalf("MigrateKeys() error = %v", err)
	}

	var status, jobType string
	var oldKeyID, newKeyID sql.NullString
	var finishedAt sql.NullTime
	err = db.QueryRowContext(ctx, `
		SELECT status, job_type, old_key_id, new_key_id, finished_at
		FROM key_rotation_jobs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 1
	`, tenantID).Scan(&status, &jobType, &oldKeyID, &newKeyID, &finishedAt)
	if err != nil {
		t.Fatalf("query job row error = %v", err)
	}
	if status != "DONE" {
		t.Fatalf("job status = %q, want DONE", status)
	}
	if jobType != "MIGRATE" {
		t.Fatalf("job_type = %q, want MIGRATE", jobType)
	}
	if !oldKeyID.Valid || !newKeyID.Valid || oldKeyID.String == "" || newKeyID.String == "" {
		t.Fatalf("old_key_id/new_key_id not recorded: old=%v new=%v", oldKeyID, newKeyID)
	}
	if !finishedAt.Valid {
		t.Fatal("finished_at not set on a DONE job")
	}

	_ = tokens
	t.Log("CONFIRMED: key_rotation_jobs shows RUNNING->DONE with old/new key IDs for a real migration.")
}

// TestTOK07_JobStateRunningToFailed fault-injects a decrypt failure mid-sweep
// (corrupting the retiring key's stored bytes directly via SQL, no
// production code changes needed) and confirms: the job row reaches
// FAILED with the real error recorded, AND the lock is still released
// (Release fires on the error path too, not just success) -- proven by a
// subsequent MigrateKeys attempt being able to acquire the lock again
// immediately rather than hanging.
func TestTOK07_JobStateRunningToFailed(t *testing.T) {
	db := tok06TestDB(t)
	_, svc := tok07NewService(db, "tok07-jobstate-failed-secret")
	ctx := context.Background()
	tenantID := uuid.New().String()

	if _, err := svc.TokenizePII(ctx, tenantID, "trace-1", "test-actor", map[string]string{"account_number": "1234567890"}); err != nil {
		t.Fatalf("TokenizePII() error = %v", err)
	}
	if rotated, err := svc.RotateKey(ctx, tenantID, "test-rotation"); err != nil || !rotated {
		t.Fatalf("RotateKey() rotated=%v err=%v", rotated, err)
	}

	// Corrupt the RETIRING key's encrypted_key bytes so decrypting any
	// token still on it fails -- a realistic-shaped failure (e.g. a bad
	// KMS unwrap) without needing to inject a fault into production code.
	if _, err := db.ExecContext(ctx,
		`UPDATE token_encryption_keys SET encrypted_key = $1 WHERE tenant_id=$2 AND status='RETIRING'`,
		[]byte("not-a-valid-32-byte-key-at-all!"), tenantID,
	); err != nil {
		t.Fatalf("corrupting retiring key failed: %v", err)
	}

	if err := svc.MigrateKeys(ctx, tenantID); err == nil {
		t.Fatal("MigrateKeys() succeeded despite a corrupted retiring key -- fault injection did not take effect")
	}

	var status string
	var errMsg sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT status, error FROM key_rotation_jobs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 1
	`, tenantID).Scan(&status, &errMsg)
	if err != nil {
		t.Fatalf("query job row error = %v", err)
	}
	if status != "FAILED" {
		t.Fatalf("job status = %q, want FAILED", status)
	}
	if !errMsg.Valid || errMsg.String == "" {
		t.Fatal("FAILED job has no error message recorded")
	}

	// The lock must have been released despite the error -- prove it by
	// acquiring it fresh, with no wait/timeout.
	lock, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
	if err != nil {
		t.Fatalf("TryAcquireTenantRotationLock after failed migration error = %v", err)
	}
	if !ok {
		t.Fatal("lock was not released after MigrateKeys failed -- Release() did not fire on the error path")
	}
	_ = lock.Release(ctx)

	t.Logf("CONFIRMED: a mid-sweep failure marks the job FAILED with an error message recorded, and still releases the lock (error message: %q).", errMsg.String)
}
