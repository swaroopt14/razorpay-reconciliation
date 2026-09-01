-- +goose Up
CREATE TABLE bank_transaction_observations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    account_id TEXT NOT NULL,
    bank_transaction_id TEXT,
    transaction_date DATE,
    value_date DATE,
    description TEXT NOT NULL DEFAULT '',
    credit_minor BIGINT NOT NULL DEFAULT 0,
    debit_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    utr TEXT,
    source TEXT NOT NULL DEFAULT 'bank_csv',
    row_hash TEXT NOT NULL,
    upload_id UUID,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, account_id, row_hash)
);

CREATE INDEX bank_txn_utr_idx
    ON bank_transaction_observations (tenant_id, connector_id, utr)
    WHERE utr IS NOT NULL AND utr <> '';

-- +goose Down
DROP INDEX IF EXISTS bank_txn_utr_idx;
DROP TABLE IF EXISTS bank_transaction_observations;
