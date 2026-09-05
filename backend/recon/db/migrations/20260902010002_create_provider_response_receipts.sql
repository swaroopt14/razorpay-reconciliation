-- +goose Up
CREATE TABLE provider_response_receipts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    backfill_job_id UUID NOT NULL REFERENCES backfill_jobs(id),
    provider TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    request_path TEXT NOT NULL,
    request_query_hash TEXT NOT NULL,
    response_status INT NOT NULL,
    response_hash TEXT NOT NULL,
    response_body_uri TEXT,
    page_skip INT,
    page_count INT,
    provider_item_count INT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (backfill_job_id, request_path, request_query_hash)
);

CREATE INDEX provider_response_receipts_job_idx
    ON provider_response_receipts (backfill_job_id);

-- +goose Down
DROP INDEX IF EXISTS provider_response_receipts_job_idx;
DROP TABLE IF EXISTS provider_response_receipts;
