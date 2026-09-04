-- +goose Up
CREATE TABLE provider_settlement_line_observations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_mode TEXT NOT NULL,
    settlement_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    line_type TEXT NOT NULL,
    payment_id TEXT,
    order_id TEXT,
    amount_minor BIGINT NOT NULL DEFAULT 0,
    debit_minor BIGINT NOT NULL DEFAULT 0,
    credit_minor BIGINT NOT NULL DEFAULT 0,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    tax_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    settlement_utr TEXT,
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ,
    payload_hash TEXT NOT NULL,
    source TEXT NOT NULL,
    last_response_receipt_id UUID,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, settlement_id, entity_id)
);

CREATE INDEX provider_settlement_line_utr_idx
    ON provider_settlement_line_observations (tenant_id, connector_id, settlement_utr)
    WHERE settlement_utr IS NOT NULL AND settlement_utr <> '';

-- +goose Down
DROP INDEX IF EXISTS provider_settlement_line_utr_idx;
DROP TABLE IF EXISTS provider_settlement_line_observations;
