-- +goose Up
CREATE TABLE provider_payment_observations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_mode TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    order_id TEXT,
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    captured BOOLEAN NOT NULL DEFAULT FALSE,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    tax_minor BIGINT NOT NULL DEFAULT 0,
    provider_created_at TIMESTAMPTZ,
    payload_hash TEXT NOT NULL,
    source TEXT NOT NULL,
    last_response_receipt_id UUID,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, payment_id)
);

CREATE INDEX provider_payment_obs_window_idx
    ON provider_payment_observations (tenant_id, connector_id, provider_created_at);

-- +goose Down
DROP INDEX IF EXISTS provider_payment_obs_window_idx;
DROP TABLE IF EXISTS provider_payment_observations;
