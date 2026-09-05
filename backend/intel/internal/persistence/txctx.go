package persistence

// txctx.go — ambient event-transaction plumbing (refactor Phase 1).
//
// The event_receipts idempotency pattern requires the receipt claim and every
// projection counter write for one Kafka event to commit in ONE transaction.
// Threading a pgx.Tx through ~60 Atomic* method signatures would be invasive,
// so the transaction rides in the context instead:
//
//	txCtx := persistence.ContextWithTx(ctx, tx)
//	projRepo.AtomicIncrementPending(txCtx, ...)   // joins tx automatically
//
// Repos resolve their executor with r.q(ctx): ambient tx when present,
// otherwise the pool. Methods that used to open their own transaction
// (BothScopes writers) join the ambient tx via beginOrJoin/withTx so nested
// begins never happen.
//
// SCOPE RULE: only ProjectionRepo and BatchContractRepo resolve the ambient
// tx. Snapshot/ML/action/outbox/SLA repos intentionally stay pool-bound —
// snapshot writes happen in async ML callbacks that outlive the event
// transaction, and actions manage their own transactions.

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DBTX is the minimal executor interface satisfied by both *pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type txCtxKey struct{}

// ContextWithTx returns a context carrying the event transaction.
// Pass the returned context ONLY into the transactional section of an event
// handler — never into post-commit work (snapshots, ML, policy evaluation).
func ContextWithTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, txCtxKey{}, tx)
}

// TxFromContext returns the ambient event transaction, or nil.
func TxFromContext(ctx context.Context) pgx.Tx {
	if tx, ok := ctx.Value(txCtxKey{}).(pgx.Tx); ok {
		return tx
	}
	return nil
}

// q resolves the executor for ProjectionRepo: ambient tx if present, else pool.
func (r *ProjectionRepo) q(ctx context.Context) DBTX {
	if tx := TxFromContext(ctx); tx != nil {
		return tx
	}
	return r.pool
}

// q resolves the executor for BatchContractRepo: ambient tx if present, else pool.
func (r *BatchContractRepo) q(ctx context.Context) DBTX {
	if tx := TxFromContext(ctx); tx != nil {
		return tx
	}
	return r.pool
}

// beginOrJoin returns the ambient transaction when one is carried in ctx
// (owned=false: caller must NOT commit/rollback it), or begins a new one
// (owned=true: caller commits/rolls back as before).
func (r *ProjectionRepo) beginOrJoin(ctx context.Context) (tx pgx.Tx, owned bool, err error) {
	if ambient := TxFromContext(ctx); ambient != nil {
		return ambient, false, nil
	}
	tx, err = r.pool.Begin(ctx)
	return tx, true, err
}
