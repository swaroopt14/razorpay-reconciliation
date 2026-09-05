-- +goose Up
CREATE TABLE IF NOT EXISTS synthetic_ground_truth (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    batch_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    family TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL,
    expected_reason TEXT NOT NULL DEFAULT '',
    expected_exception BOOLEAN NOT NULL DEFAULT FALSE,
    expected_variance BIGINT NOT NULL DEFAULT 0,
    expected_bank_credit BOOLEAN NOT NULL DEFAULT FALSE,
    amount_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS synthetic_ground_truth_batch_idx
    ON synthetic_ground_truth (tenant_id, connector_id, batch_id);

-- +goose Down
DROP INDEX IF EXISTS synthetic_ground_truth_batch_idx;
DROP TABLE IF EXISTS synthetic_ground_truth;
