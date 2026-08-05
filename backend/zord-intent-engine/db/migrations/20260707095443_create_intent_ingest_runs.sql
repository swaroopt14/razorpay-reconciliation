-- +goose Up
CREATE TABLE intent_ingest_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL UNIQUE,
    tenant_id UUID NOT NULL,
    mapping_id TEXT,
    profile_id TEXT,
    file_name TEXT,
    file_hash TEXT,
    total_rows INT DEFAULT 0,
    accepted_rows INT DEFAULT 0,
    failed_rows INT DEFAULT 0,
    duplicate_rows INT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- +goose Down
DROP TABLE intent_ingest_runs;
