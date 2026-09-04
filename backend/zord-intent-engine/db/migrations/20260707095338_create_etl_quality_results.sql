-- +goose Up
CREATE TABLE etl_quality_results (
    quality_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES etl_ingest_runs(run_id),
    tenant_id UUID NOT NULL,
    scope_type TEXT NOT NULL DEFAULT 'INTENT',
    quality_score FLOAT8,
    parse_success_rate FLOAT8,
    required_field_gap_count INT DEFAULT 0,
    low_confidence_field_count INT DEFAULT 0,
    attachment_readiness_score FLOAT8,
    proof_readiness_score FLOAT8,
    status TEXT NOT NULL DEFAULT 'PASS',
    reason_codes_json JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- +goose Down
DROP TABLE etl_quality_results;
