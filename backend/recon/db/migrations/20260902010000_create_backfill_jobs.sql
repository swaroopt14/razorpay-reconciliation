-- +goose Up
CREATE TABLE backfill_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_mode TEXT NOT NULL CHECK (provider_mode IN ('test', 'live')),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('payments', 'settlements', 'refunds', 'all')),
    window_from TIMESTAMPTZ NOT NULL,
    window_to TIMESTAMPTZ NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('airflow', 'manual', 'repair', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
    requested_by UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    fetched_count BIGINT NOT NULL DEFAULT 0,
    inserted_count BIGINT NOT NULL DEFAULT 0,
    updated_count BIGINT NOT NULL DEFAULT 0,
    duplicate_count BIGINT NOT NULL DEFAULT 0,
    missing_webhook_count BIGINT NOT NULL DEFAULT 0,
    error_count BIGINT NOT NULL DEFAULT 0,
    last_error_code TEXT,
    last_error_message TEXT,
    trace_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT backfill_jobs_window_chk CHECK (window_to > window_from)
);

CREATE INDEX backfill_jobs_tenant_connector_idx
    ON backfill_jobs (tenant_id, connector_id, created_at DESC);

CREATE UNIQUE INDEX backfill_jobs_active_window_uq
    ON backfill_jobs (tenant_id, connector_id, resource_type, window_from, window_to)
    WHERE status IN ('queued', 'running');

-- +goose Down
DROP INDEX IF EXISTS backfill_jobs_active_window_uq;
DROP INDEX IF EXISTS backfill_jobs_tenant_connector_idx;
DROP TABLE IF EXISTS backfill_jobs;
