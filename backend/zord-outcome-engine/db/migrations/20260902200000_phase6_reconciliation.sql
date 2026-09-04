-- +goose Up
CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    account_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    payment_count INT NOT NULL DEFAULT 0,
    matched_count INT NOT NULL DEFAULT 0,
    exception_count INT NOT NULL DEFAULT 0,
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reconciliation_runs_tenant_idx
    ON reconciliation_runs (tenant_id, connector_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_results (
    id UUID PRIMARY KEY,
    run_id UUID,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    result TEXT NOT NULL,
    expected_amount_minor BIGINT NOT NULL DEFAULT 0,
    observed_amount_minor BIGINT NOT NULL DEFAULT 0,
    variance_amount_minor BIGINT NOT NULL DEFAULT 0,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    candidate_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
    bank_credit_proven BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_results_entity_uidx
    ON reconciliation_results (tenant_id, connector_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS reconciliation_results_result_idx
    ON reconciliation_results (tenant_id, connector_id, result);

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
    id UUID PRIMARY KEY,
    run_id UUID,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    reconciliation_result TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    expected_amount BIGINT NOT NULL DEFAULT 0,
    observed_amount BIGINT NOT NULL DEFAULT 0,
    variance_amount BIGINT NOT NULL DEFAULT 0,
    candidate_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reconciliation_exceptions_tenant_idx
    ON reconciliation_exceptions (tenant_id, connector_id, created_at DESC);

CREATE TABLE IF NOT EXISTS investigation_records (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    exception_id TEXT,
    entity_type TEXT NOT NULL DEFAULT 'payment',
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    root_cause TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    financial_impact BIGINT NOT NULL DEFAULT 0,
    evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigation_records_entity_idx
    ON investigation_records (tenant_id, connector_id, entity_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS investigation_records_entity_idx;
DROP TABLE IF EXISTS investigation_records;
DROP INDEX IF EXISTS reconciliation_exceptions_tenant_idx;
DROP TABLE IF EXISTS reconciliation_exceptions;
DROP INDEX IF EXISTS reconciliation_results_result_idx;
DROP INDEX IF EXISTS reconciliation_results_entity_uidx;
DROP TABLE IF EXISTS reconciliation_results;
DROP INDEX IF EXISTS reconciliation_runs_tenant_idx;
DROP TABLE IF EXISTS reconciliation_runs;
