-- +goose Up

-- 4.2.7: the tenant daily-limit reservation (R-05) computes business_date via
-- persistence.BusinessDateUTC, which hardcodes UTC for every tenant — fine as
-- an interim policy, but not the per-tenant business-date timezone the plan
-- asks for. This table is additive and starts empty: every existing tenant
-- keeps resolving UTC (see ResolveBusinessDate's fallback) until someone
-- explicitly configures a row for them, so this migration changes no
-- existing behavior on its own.
CREATE TABLE tenant_business_date_config (
    tenant_id               UUID PRIMARY KEY,
    business_date_timezone  TEXT NOT NULL DEFAULT 'UTC',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE tenant_business_date_config;
