package repository

// TOK-07: "Coordinate key rotation across replicas."
//
// RotateKey (token_repo.go) uses a transaction-scoped advisory lock, since
// its whole critical section is one *sql.Tx. MigrateKeys' sweep is different
// -- it spans many separate DB round trips with real Go-side work (decrypt/
// re-encrypt) between them, so holding one transaction open for the whole
// sweep would mean an idle-in-transaction connection for an unbounded
// duration (some Postgres configs kill those via
// idle_in_transaction_session_timeout, and it's a confusing thing to see in
// pg_stat_activity). A SESSION-level advisory lock on a reserved connection
// is the right primitive for a critical section that outlives one
// transaction.

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
)

// RotationLock holds a single reserved *sql.Conn for the lifetime of a
// session-level Postgres advisory lock. Callers MUST call Release when done
// -- see Release's doc comment for why this matters more than the usual
// "don't leak a connection" reason.
type RotationLock struct {
	conn     *sql.Conn
	tenantID string
}

// TryAcquireTenantRotationLock reserves one connection from db's pool and
// attempts a session-level advisory lock (pg_try_advisory_lock, NOT the
// _xact_ variant -- this lock must outlive any single transaction) keyed by
// hashtextextended('token-rotation:'||tenantID, 0) -- same hash function and
// namespacing style as token_repo.go's RotateKey and the existing
// zord-intelligence precedent (projection_meta.go's resolveBatchContractID),
// 64-bit specifically to avoid the birthday-bound collision risk of 32-bit
// hashtext across a real tenant keyspace.
//
// Returns (nil, false, nil) -- NOT an error -- if another session already
// holds it: "someone else is already migrating this tenant's keys right
// now" is an expected, harmless outcome, not a failure. The reserved
// connection is released back to the pool before returning in this case --
// leaking it here would be a pool-exhaustion bug distinct from (but easy to
// conflate with) the lock-leak bug Release's doc comment describes.
//
// Crash safety: session-level advisory locks are tied to the Postgres
// BACKEND PROCESS, not to any explicit unlock call. If this process
// crashes while holding the lock, Postgres detects the dead TCP connection
// and releases the lock automatically -- this is what lets a rotation
// "recover after crash" with no manual cleanup. This requires a DIRECT
// connection to Postgres (confirmed: this service's DB_HOST config connects
// directly, no pooler anywhere in its deployment) -- a transaction-mode
// pgbouncer between us and Postgres would break this invariant, since it
// can multiplex a logical session onto different physical backends between
// statements.
func TryAcquireTenantRotationLock(ctx context.Context, db *sql.DB, tenantID string) (*RotationLock, bool, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, false, err
	}

	var acquired bool
	if err := conn.QueryRowContext(ctx,
		`SELECT pg_try_advisory_lock(hashtextextended('token-rotation:'||$1, 0))`,
		tenantID,
	).Scan(&acquired); err != nil {
		conn.Close()
		return nil, false, err
	}
	if !acquired {
		conn.Close()
		return nil, false, nil
	}

	return &RotationLock{conn: conn, tenantID: tenantID}, true, nil
}

// Release explicitly unlocks the advisory lock, then returns the reserved
// connection to the pool. ctx MUST be a fresh, short-timeout context --
// NEVER the caller's original ctx. If that ctx is already canceled (e.g. a
// shutdown signal fired while a migration sweep was in flight), ExecContext
// returns context.Canceled immediately without ever reaching Postgres, and
// this connection would go back to the pool STILL holding the lock at the
// session level -- since the pool (not Postgres) now owns it, and nothing
// closed the underlying physical connection, the lock would keep blocking
// every future rotation attempt for this tenant, across every replica,
// until that specific pooled connection happens to be reused for something
// else, reset, or evicted (up to ConnMaxLifetime). Passing ctx straight
// through is the idiomatic move everywhere else in this codebase; here it
// is specifically wrong.
func (l *RotationLock) Release(ctx context.Context) error {
	defer l.conn.Close()
	_, err := l.conn.ExecContext(ctx,
		`SELECT pg_advisory_unlock(hashtextextended('token-rotation:'||$1, 0))`,
		l.tenantID,
	)
	return err
}

// TryAcquireTenantRotationLock is TokenRepository's entry point for the
// package-level lock primitive above, using this repository's own
// connection pool. See the package-level TryAcquireTenantRotationLock for
// the full contract.
func (r *TokenRepository) TryAcquireTenantRotationLock(ctx context.Context, tenantID string) (*RotationLock, bool, error) {
	return TryAcquireTenantRotationLock(ctx, r.db, tenantID)
}

// --- key_rotation_jobs: purely observational job-state bookkeeping. ---
//
// This table is NEVER consulted to decide whether a rotation/migration may
// proceed -- only the advisory lock above is a correctness-bearing gate. A
// row stuck RUNNING (e.g. after a real crash) is expected and harmless: it
// just means the DB-level lock already released cleanly and the next
// attempt will run normally, leaving this one row as a permanent (if
// slightly confusing) forensic record. See db/migrations/
// 20260817100000_create_key_rotation_jobs.sql for the full rationale.

// InsertRotationJob records the start of a rotation or migration attempt
// that has genuinely acquired its advisory lock (never call this before
// acquiring -- a lock-miss is not a job, it's a no-op). jobType is "ROTATE"
// or "MIGRATE". Returns the new job's ID for the matching Mark*Job call.
func (r *TokenRepository) InsertRotationJob(ctx context.Context, tenantID, jobType, replicaID string) (string, error) {
	jobID := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO key_rotation_jobs (job_id, tenant_id, job_type, status, replica_id)
		VALUES ($1, $2, $3, 'RUNNING', $4)
	`, jobID, tenantID, jobType, replicaID)
	return jobID, err
}

// MarkRotationJobDone finalizes a job as successfully completed. oldKeyID/
// newKeyID may be empty (e.g. a MIGRATE job that found nothing to migrate).
func (r *TokenRepository) MarkRotationJobDone(ctx context.Context, jobID, oldKeyID, newKeyID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE key_rotation_jobs
		SET status = 'DONE', finished_at = now(), old_key_id = NULLIF($2, ''), new_key_id = NULLIF($3, '')
		WHERE job_id = $1
	`, jobID, oldKeyID, newKeyID)
	return err
}

// MarkRotationJobFailed finalizes a job as failed, recording errMsg for
// operator visibility.
func (r *TokenRepository) MarkRotationJobFailed(ctx context.Context, jobID, errMsg string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE key_rotation_jobs
		SET status = 'FAILED', finished_at = now(), error = $2
		WHERE job_id = $1
	`, jobID, errMsg)
	return err
}
