-- +goose Up
CREATE TABLE IF NOT EXISTS bank_ingest_runs (
    ingest_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID,
    account_id TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL DEFAULT '',
    file_sha256 TEXT NOT NULL,
    storage_uri TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    profile TEXT,
    currency TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_ingest_runs_hash_idx
    ON bank_ingest_runs (tenant_id, file_sha256, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS bank_ingest_runs_hash_idx;
DROP TABLE IF EXISTS bank_ingest_runs;
