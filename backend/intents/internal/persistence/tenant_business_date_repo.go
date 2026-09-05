package persistence

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// TenantBusinessDateRepository resolves the business_date a tenant's daily
// limit should be tracked against (4.2.7). Every tenant defaults to UTC
// until a row is explicitly configured for it in tenant_business_date_config
// — see that migration's comment for why this is safe to introduce without
// changing any existing tenant's behavior.
type TenantBusinessDateRepository interface {
	// ResolveBusinessDate returns tenantID's business_date for now, formatted
	// as YYYY-MM-DD in whatever timezone is configured for that tenant (UTC
	// if none is, or if the configured value fails to load).
	ResolveBusinessDate(ctx context.Context, tenantID string, now time.Time) string
}

type TenantBusinessDatePostgresRepo struct {
	db *sql.DB
}

func NewTenantBusinessDateRepo(db *sql.DB) TenantBusinessDateRepository {
	return &TenantBusinessDatePostgresRepo{db: db}
}

var _ TenantBusinessDateRepository = (*TenantBusinessDatePostgresRepo)(nil)

func (r *TenantBusinessDatePostgresRepo) ResolveBusinessDate(ctx context.Context, tenantID string, now time.Time) string {
	tz := r.lookupTimezone(ctx, tenantID)
	loc, err := time.LoadLocation(tz)
	if err != nil {
		if tz != "UTC" {
			log.Printf("⚠️ tenant_business_date_config: invalid timezone %q for tenant=%s, falling back to UTC: %v", tz, tenantID, err)
		}
		loc = time.UTC
	}
	return now.In(loc).Format("2006-01-02")
}

func (r *TenantBusinessDatePostgresRepo) lookupTimezone(ctx context.Context, tenantID string) string {
	if r.db == nil {
		return "UTC"
	}
	var tz string
	err := r.db.QueryRowContext(ctx, `
		SELECT business_date_timezone
		FROM tenant_business_date_config
		WHERE tenant_id = $1
	`, tenantID).Scan(&tz)
	switch {
	case err == nil:
		return tz
	case err == sql.ErrNoRows:
		return "UTC"
	default:
		log.Printf("⚠️ tenant_business_date_config: lookup failed for tenant=%s, defaulting to UTC: %v", tenantID, err)
		return "UTC"
	}
}
