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
    completed_at TIMESTAMPTZ,
    -- 4.2.4: failed/stuck ingest-run states + the sweeper's heartbeat/error
    -- fields (see SweepStuckIngestRuns in db/ingest_run_sweeper.go).
    last_error_code TEXT,
    last_error_detail TEXT,
    last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_intent_ingest_runs_status CHECK (status IN (
        'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED_RETRYABLE', 'FAILED_FINAL'
    ))
);
CREATE INDEX idx_intent_ingest_runs_status_heartbeat
    ON intent_ingest_runs (status, last_heartbeat_at);

-- +goose Down
DROP TABLE intent_ingest_runs;
