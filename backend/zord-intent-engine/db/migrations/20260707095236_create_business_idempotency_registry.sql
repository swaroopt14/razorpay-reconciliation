-- +goose Up
CREATE TABLE business_idempotency_registry (
    tenant_id UUID NOT NULL,
    business_idempotency_key TEXT NOT NULL,
    intent_id UUID NOT NULL,
    beneficiary_fingerprint TEXT NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency_code CHAR(3) NOT NULL,
    time_bucket TEXT NOT NULL,
    duplicate_reason_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, business_idempotency_key)
);

CREATE INDEX idx_idempotency_registry_intent_id ON business_idempotency_registry(intent_id);

-- +goose Down
DROP INDEX idx_idempotency_registry_intent_id;
DROP TABLE business_idempotency_registry;
