-- +goose Up
CREATE TABLE payment_evidence_leaves (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    payment_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    raw_payload_hash TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_mode TEXT NOT NULL DEFAULT 'test',
    trace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, payment_id, source, raw_payload_hash)
);

CREATE INDEX payment_evidence_leaves_payment_idx
    ON payment_evidence_leaves (tenant_id, connector_id, payment_id);

-- +goose Down
DROP INDEX IF EXISTS payment_evidence_leaves_payment_idx;
DROP TABLE IF EXISTS payment_evidence_leaves;
