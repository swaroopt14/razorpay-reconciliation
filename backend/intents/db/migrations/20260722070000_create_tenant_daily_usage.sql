-- +goose Up
-- R-05: atomic, currency-scoped tenant daily-limit accounting. Replaces the
-- old unlocked SELECT SUM(amount) (intent_service.go's sumTenantAmountToday)
-- with a real per-(tenant, business_date, currency) row that gets locked
-- (SELECT ... FOR UPDATE) and conditionally incremented inside one
-- transaction — see internal/persistence/tenant_daily_usage_repo.go.
--
-- business_date is resolved in UTC today: no tenant-policy-timezone concept
-- exists anywhere in this codebase yet (verified — only
-- mapping_profiles.source_timezone, which parses source file timestamps,
-- unrelated to business-day policy). UTC is an explicit, documented choice,
-- not an accidental server timezone — revisit if/when real per-tenant
-- policy timezone configuration exists.
CREATE TABLE tenant_daily_usage (
    tenant_id UUID NOT NULL,
    business_date DATE NOT NULL,
    currency CHAR(3) NOT NULL,
    accepted_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, business_date, currency)
);

-- +goose Down
DROP TABLE tenant_daily_usage;
