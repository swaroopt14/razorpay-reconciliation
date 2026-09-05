-- +goose Up
CREATE TABLE intent_ingest_rows (
    row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,
    tenant_id UUID NOT NULL,
    mapping_id TEXT NOT NULL DEFAULT '',
    profile_id TEXT,
    row_index INT NOT NULL DEFAULT 0,
    idempotency_key TEXT,
    status TEXT NOT NULL DEFAULT 'ACCEPTED',
    error_detail TEXT,
    source_system TEXT,
    file_name TEXT,
    file_hash TEXT,
    raw_row_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_iir_tenant_batch
    ON intent_ingest_rows (tenant_id, batch_id);
CREATE INDEX idx_iir_mapping_id
    ON intent_ingest_rows (mapping_id);

-- +goose Down
DROP INDEX idx_iir_mapping_id;
DROP INDEX idx_iir_tenant_batch;
DROP TABLE intent_ingest_rows;
