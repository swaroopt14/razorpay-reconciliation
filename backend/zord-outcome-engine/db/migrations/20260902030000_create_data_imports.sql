-- +goose Up
CREATE TABLE data_imports (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID,
    account_id TEXT,
    import_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    provider_mode TEXT NOT NULL DEFAULT 'test',
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text/csv',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    file_sha256 TEXT NOT NULL,
    storage_uri TEXT,
    payload BYTEA,
    currency TEXT,
    status TEXT NOT NULL,
    detected_columns JSONB,
    selected_mapping JSONB,
    rows_seen BIGINT NOT NULL DEFAULT 0,
    valid_rows BIGINT NOT NULL DEFAULT 0,
    invalid_rows BIGINT NOT NULL DEFAULT 0,
    duplicate_rows BIGINT NOT NULL DEFAULT 0,
    inserted_rows BIGINT NOT NULL DEFAULT 0,
    updated_rows BIGINT NOT NULL DEFAULT 0,
    rejected_rows BIGINT NOT NULL DEFAULT 0,
    error_summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    committed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, import_type, file_sha256)
);

CREATE INDEX data_imports_tenant_idx
    ON data_imports (tenant_id, import_type, created_at DESC);

CREATE TABLE import_row_results (
    id UUID PRIMARY KEY,
    import_id UUID NOT NULL REFERENCES data_imports(id),
    row_number BIGINT NOT NULL,
    row_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    canonical_record_id UUID,
    error_code TEXT,
    error_message TEXT,
    raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (import_id, row_number)
);

CREATE INDEX import_row_results_import_idx
    ON import_row_results (import_id, row_number);

-- +goose Down
DROP INDEX IF EXISTS import_row_results_import_idx;
DROP TABLE IF EXISTS import_row_results;
DROP INDEX IF EXISTS data_imports_tenant_idx;
DROP TABLE IF EXISTS data_imports;
