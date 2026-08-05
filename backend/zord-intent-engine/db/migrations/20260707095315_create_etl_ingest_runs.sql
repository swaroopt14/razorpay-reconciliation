-- +goose Up
CREATE TABLE etl_ingest_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    envelope_id UUID NOT NULL,
    intent_id UUID,
    outbox_event_id TEXT NOT NULL,
    artifact_family TEXT NOT NULL DEFAULT 'PAYOUT_INTENT',
    source_system TEXT,
    mapping_profile_id TEXT,
    parser_version TEXT NOT NULL DEFAULT 'v1',
    run_generation INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    is_active BOOLEAN NOT NULL DEFAULT false,
    supersedes_run_id UUID,
    parse_success_rate FLOAT8,
    quality_score FLOAT8,
    proof_readiness_score FLOAT8,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- +goose Down
DROP TABLE etl_ingest_runs;
