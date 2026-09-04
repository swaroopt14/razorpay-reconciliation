-- +goose Up
CREATE TABLE IF NOT EXISTS finance_close_runs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    batch_id TEXT NOT NULL DEFAULT '',
    recon_run_id UUID,
    status TEXT NOT NULL,
    records INT NOT NULL DEFAULT 0,
    matched INT NOT NULL DEFAULT 0,
    exceptions INT NOT NULL DEFAULT 0,
    match_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    investigated INT NOT NULL DEFAULT 0,
    resolved_by_investigation INT NOT NULL DEFAULT 0,
    still_unresolved INT NOT NULL DEFAULT 0,
    unresolved_exposure_minor BIGINT NOT NULL DEFAULT 0,
    false_resolutions INT NOT NULL DEFAULT 0,
    throughput_per_s DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    accuracy JSONB NOT NULL DEFAULT '{}'::jsonb,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finance_close_runs_tenant_idx
    ON finance_close_runs (tenant_id, connector_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS finance_close_runs_tenant_idx;
DROP TABLE IF EXISTS finance_close_runs;
