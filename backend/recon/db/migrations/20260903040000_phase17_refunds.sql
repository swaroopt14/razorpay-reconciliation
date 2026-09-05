-- +goose Up
CREATE TABLE IF NOT EXISTS provider_refund_observations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    refund_id TEXT NOT NULL,
    payment_id TEXT NOT NULL DEFAULT '',
    amount_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    provider_status TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'webhook',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, refund_id)
);

CREATE INDEX IF NOT EXISTS provider_refund_observations_payment_idx
    ON provider_refund_observations (tenant_id, connector_id, payment_id);

-- +goose Down
DROP INDEX IF EXISTS provider_refund_observations_payment_idx;
DROP TABLE IF EXISTS provider_refund_observations;
