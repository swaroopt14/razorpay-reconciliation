package persistence

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

// Daily-limit reservation decisions — R-05.
const (
	DailyLimitDecisionAccept         = "ACCEPT"
	DailyLimitDecisionRequiresReview = "REQUIRES_REVIEW"
)

// TenantDailyUsageRepository durably tracks accepted intent volume per
// (tenant_id, business_date, currency), atomically. See R-05.
type TenantDailyUsageRepository interface {
	// ReserveIfWithinLimit locks the usage row for (tenantID, businessDate,
	// currency) inside one transaction, computes the projected total
	// (current accepted + amount), and either:
	//   - commits with accepted_amount incremented by amount and returns
	//     DailyLimitDecisionAccept, if the projection stays within limit; or
	//   - commits with no change and returns DailyLimitDecisionRequiresReview,
	//     if the projection would exceed limit.
	// priorTotal is the accepted total BEFORE this reservation (for
	// audit/hash purposes). Held-for-review amounts are never added to
	// accepted_amount — only an ACCEPT decision increments it.
	ReserveIfWithinLimit(ctx context.Context, tenantID, businessDate, currency string, amount, limit decimal.Decimal) (decision string, priorTotal decimal.Decimal, err error)
}

type TenantDailyUsagePostgresRepo struct {
	db *sql.DB
}

func NewTenantDailyUsageRepo(db *sql.DB) TenantDailyUsageRepository {
	return &TenantDailyUsagePostgresRepo{db: db}
}

var _ TenantDailyUsageRepository = (*TenantDailyUsagePostgresRepo)(nil)

// BusinessDateUTC returns today's business_date per R-05's documented
// interim policy: UTC, since no per-tenant policy timezone concept exists
// anywhere in this codebase yet. Exported so callers resolve the same date
// consistently rather than each computing it ad hoc.
func BusinessDateUTC(now time.Time) string {
	return now.UTC().Format("2006-01-02")
}

func (r *TenantDailyUsagePostgresRepo) ReserveIfWithinLimit(
	ctx context.Context,
	tenantID, businessDate, currency string,
	amount, limit decimal.Decimal,
) (string, decimal.Decimal, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	// Ensure the row exists before locking it — a plain SELECT FOR UPDATE
	// on a nonexistent row locks nothing and returns no rows.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO tenant_daily_usage (tenant_id, business_date, currency, accepted_amount)
		VALUES ($1, $2, $3, 0)
		ON CONFLICT (tenant_id, business_date, currency) DO NOTHING
	`, tenantID, businessDate, currency); err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: ensure row: %w", err)
	}

	var currentStr string
	if err := tx.QueryRowContext(ctx, `
		SELECT accepted_amount::text
		FROM tenant_daily_usage
		WHERE tenant_id = $1 AND business_date = $2 AND currency = $3
		FOR UPDATE
	`, tenantID, businessDate, currency).Scan(&currentStr); err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: lock row: %w", err)
	}

	current, err := decimal.NewFromString(currentStr)
	if err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: parse accepted_amount: %w", err)
	}

	projected := current.Add(amount)
	if projected.GreaterThan(limit) {
		if err := tx.Commit(); err != nil {
			return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: commit (review): %w", err)
		}
		committed = true
		return DailyLimitDecisionRequiresReview, current, nil
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE tenant_daily_usage
		SET accepted_amount = accepted_amount + $1, updated_at = now()
		WHERE tenant_id = $2 AND business_date = $3 AND currency = $4
	`, amount, tenantID, businessDate, currency); err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: increment: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return "", decimal.Zero, fmt.Errorf("tenant_daily_usage: commit (accept): %w", err)
	}
	committed = true
	return DailyLimitDecisionAccept, current, nil
}
