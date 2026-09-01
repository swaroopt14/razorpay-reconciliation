-- +goose Up
CREATE TABLE bank_statement_uploads (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    account_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    row_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('queued', 'succeeded', 'failed')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bank_statement_uploads_tenant_idx
    ON bank_statement_uploads (tenant_id, connector_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS bank_statement_uploads_tenant_idx;
DROP TABLE IF EXISTS bank_statement_uploads;
