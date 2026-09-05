-- +goose Up
CREATE TABLE payment_proof_subjects (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    payment_id TEXT NOT NULL,
    order_id TEXT,
    payment_state TEXT NOT NULL DEFAULT 'unknown',
    provider_settlement_state TEXT NOT NULL DEFAULT 'not_observed',
    bank_credit_state TEXT NOT NULL DEFAULT 'not_expected',
    reconciliation_state TEXT NOT NULL DEFAULT 'unresolved',
    proof_state TEXT NOT NULL DEFAULT 'unproven',
    settlement_id TEXT,
    bank_observation_id UUID,
    expected_net_minor BIGINT NOT NULL DEFAULT 0,
    bank_credit_minor BIGINT NOT NULL DEFAULT 0,
    difference_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    missing_webhook BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, payment_id)
);

CREATE INDEX payment_proof_subjects_state_idx
    ON payment_proof_subjects (tenant_id, connector_id, reconciliation_state);

-- +goose Down
DROP INDEX IF EXISTS payment_proof_subjects_state_idx;
DROP TABLE IF EXISTS payment_proof_subjects;
