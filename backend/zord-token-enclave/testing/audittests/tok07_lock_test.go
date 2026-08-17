package audittests

// TOK-07: "Coordinate key rotation across replicas."
// Real-Postgres tests for the advisory-lock primitives directly:
// repository.TryAcquireTenantRotationLock (session-level, used by
// MigrateKeys) and the unexported xact-level lock RotateKey/RotateKeyIfStale
// use internally (exercised indirectly here via RotateKey, since it's not
// exported -- the same testing-through-the-real-call-path convention
// TOK-06 already established in this package).
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK07_Lock -v

import (
	"context"
	"database/sql/driver"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"zord-token-enclave/internal/repository"
)

// TestTOK07_LockMutualExclusion_SameTenant proves the session-level advisory
// lock is a genuine mutex: two concurrent attempts for the SAME tenant can
// never both succeed at once.
func TestTOK07_LockMutualExclusion_SameTenant(t *testing.T) {
	db := tok06TestDB(t)
	ctx := context.Background()
	tenantID := uuid.New().String()

	const n = 10
	var acquiredCount int
	var mu sync.Mutex
	var wg sync.WaitGroup
	locks := make([]*repository.RotationLock, n)

	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			lock, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
			if err != nil {
				t.Errorf("attempt %d: TryAcquireTenantRotationLock error = %v", idx, err)
				return
			}
			if ok {
				mu.Lock()
				acquiredCount++
				mu.Unlock()
				locks[idx] = lock
				// Hold it briefly so the other concurrent attempts have a
				// real chance to observe it as held, not just get lucky
				// with ordering.
				time.Sleep(50 * time.Millisecond)
			}
		}(i)
	}
	wg.Wait()

	if acquiredCount != 1 {
		t.Fatalf("acquiredCount = %d, want exactly 1 -- %d concurrent attempts for the SAME tenant must never both hold the lock", acquiredCount, n)
	}

	for _, l := range locks {
		if l != nil {
			if err := l.Release(ctx); err != nil {
				t.Errorf("Release() error = %v", err)
			}
		}
	}

	// Sanity: after releasing, a fresh attempt must succeed.
	lock2, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
	if err != nil {
		t.Fatalf("post-release TryAcquireTenantRotationLock error = %v", err)
	}
	if !ok {
		t.Fatal("lock was not free after all holders released it")
	}
	_ = lock2.Release(ctx)

	t.Logf("CONFIRMED: exactly 1 of %d concurrent same-tenant lock attempts succeeded.", n)
}

// TestTOK07_LockParallel_DifferentTenants is the negative case (mirrors
// zord-intelligence's advisory-lock test style): unrelated tenants must
// never serialize against each other.
func TestTOK07_LockParallel_DifferentTenants(t *testing.T) {
	db := tok06TestDB(t)
	ctx := context.Background()

	const m = 10
	errs := make([]error, m)
	oks := make([]bool, m)
	locks := make([]*repository.RotationLock, m)

	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < m; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			tenantID := fmt.Sprintf("tok07-parallel-tenant-%s", uuid.New().String())
			lock, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
			errs[idx], oks[idx], locks[idx] = err, ok, lock
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)

	for i := range errs {
		if errs[i] != nil {
			t.Errorf("goroutine %d: error = %v", i, errs[i])
		}
		if !oks[i] {
			t.Errorf("goroutine %d: expected to acquire immediately (different tenant, no contention)", i)
		}
		if locks[i] != nil {
			_ = locks[i].Release(ctx)
		}
	}

	// Generous ceiling: this should take roughly as long as ONE acquisition,
	// not M of them serialized.
	if elapsed > 2*time.Second {
		t.Errorf("elapsed=%v is too slow for %d different-tenant lock attempts run in parallel -- they may be falsely serializing", elapsed, m)
	}

	t.Logf("CONFIRMED: %d different-tenant lock attempts all acquired immediately in parallel, elapsed=%v.", m, elapsed)
}

// TestTOK07_LockCrashRecovery is the literal "recover after crash" proof:
// a session holding the lock is killed WITHOUT ever calling
// pg_advisory_unlock (simulating a SIGKILL or a dead machine, not a clean
// shutdown), and a subsequent attempt must still succeed -- proving
// Postgres itself detects the dead backend and releases the lock, with no
// manual cleanup required anywhere in this codebase.
func TestTOK07_LockCrashRecovery(t *testing.T) {
	db := tok06TestDB(t)
	ctx := context.Background()
	tenantID := uuid.New().String()

	crashConn, err := db.Conn(ctx)
	if err != nil {
		t.Fatalf("db.Conn() error = %v", err)
	}
	defer crashConn.Close()

	var acquired bool
	if err := crashConn.QueryRowContext(ctx,
		`SELECT pg_try_advisory_lock(hashtextextended('token-rotation:'||$1, 0))`,
		tenantID,
	).Scan(&acquired); err != nil {
		t.Fatalf("manual pg_try_advisory_lock error = %v", err)
	}
	if !acquired {
		t.Fatal("expected to acquire the lock on the soon-to-be-crashed connection")
	}

	// Confirm the real production path is correctly blocked while this
	// "live" session holds it.
	if _, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID); err != nil {
		t.Fatalf("TryAcquireTenantRotationLock error = %v", err)
	} else if ok {
		t.Fatal("acquired the lock while another session was still holding it -- mutual exclusion broken")
	}

	// Simulate a crash: force-close the underlying physical connection
	// directly, WITHOUT ever calling pg_advisory_unlock -- this is what a
	// SIGKILL or a dead node looks like from Postgres's perspective, unlike
	// a clean crashConn.Close() (which merely returns a healthy connection
	// to database/sql's pool and would prove nothing about crash recovery).
	if err := crashConn.Raw(func(driverConn interface{}) error {
		return driverConn.(driver.Conn).Close()
	}); err != nil {
		t.Fatalf("failed to force-close the simulated-crash connection: %v", err)
	}

	// Postgres detects the dead backend and releases its session-level
	// locks -- this isn't necessarily instantaneous, so poll briefly.
	deadline := time.Now().Add(10 * time.Second)
	for {
		lock, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
		if err != nil {
			t.Fatalf("TryAcquireTenantRotationLock (post-crash) error = %v", err)
		}
		if ok {
			_ = lock.Release(ctx)
			t.Log("CONFIRMED: lock was released automatically after the holding connection crashed -- no manual cleanup needed.")
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("lock was never released after the holding connection crashed (10s timeout) -- Postgres did not detect the dead backend")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// TestTOK07_SessionLockBlocksConcurrentXactLock proves the two DIFFERENT
// lock primitives this ticket uses -- MigrateKeys' session-level
// pg_try_advisory_lock and RotateKey's transaction-scoped
// pg_try_advisory_xact_lock -- share the same contention domain for the
// same key, as Postgres's advisory lock system guarantees. Without this,
// a rotation could start while its tenant's migration sweep (from a PRIOR
// rotation) is still in flight, or vice versa.
func TestTOK07_SessionLockBlocksConcurrentXactLock(t *testing.T) {
	db := tok06TestDB(t)
	repo := repository.NewTokenRepository(db)
	ctx := context.Background()
	tenantID := uuid.New().String()

	// Hold the session-level lock, as MigrateKeys would while sweeping.
	sessionLock, ok, err := repository.TryAcquireTenantRotationLock(ctx, db, tenantID)
	if err != nil {
		t.Fatalf("TryAcquireTenantRotationLock error = %v", err)
	}
	if !ok {
		t.Fatal("expected to acquire the session lock")
	}

	// RotateKey's own xact-scoped lock attempt for the SAME tenant must be
	// blocked while the session lock is held.
	rotated, err := repo.RotateKey(ctx, tenantID, uuid.New().String(), make([]byte, 32), "test")
	if err != nil {
		t.Fatalf("RotateKey() error = %v", err)
	}
	if rotated {
		t.Fatal("RotateKey() succeeded while a session-level lock was held for the same tenant -- the two lock primitives are not actually sharing a contention domain")
	}

	if err := sessionLock.Release(ctx); err != nil {
		t.Fatalf("Release() error = %v", err)
	}

	// Now it must succeed.
	rotated, err = repo.RotateKey(ctx, tenantID, uuid.New().String(), make([]byte, 32), "test")
	if err != nil {
		t.Fatalf("RotateKey() after release error = %v", err)
	}
	if !rotated {
		t.Fatal("RotateKey() still did not succeed after the session lock was released")
	}

	t.Log("CONFIRMED: the session-level lock (MigrateKeys) and the transaction-scoped lock (RotateKey) correctly contend against each other for the same tenant.")
}
