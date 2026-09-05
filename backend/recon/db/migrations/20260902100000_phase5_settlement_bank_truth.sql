-- +goose Up
ALTER TABLE provider_settlement_line_observations
    ADD COLUMN IF NOT EXISTS adjustment_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_status TEXT,
    ADD COLUMN IF NOT EXISTS canonical_status TEXT,
    ADD COLUMN IF NOT EXISTS source_file TEXT,
    ADD COLUMN IF NOT EXISTS source_row BIGINT,
    ADD COLUMN IF NOT EXISTS raw_reference TEXT,
    ADD COLUMN IF NOT EXISTS payment_link TEXT NOT NULL DEFAULT 'unlinked';

ALTER TABLE bank_transaction_observations
    ADD COLUMN IF NOT EXISTS credit_debit TEXT,
    ADD COLUMN IF NOT EXISTS utr_raw TEXT,
    ADD COLUMN IF NOT EXISTS observation_identity_hash TEXT;

UPDATE bank_transaction_observations
SET credit_debit = CASE
    WHEN credit_minor > 0 AND debit_minor = 0 THEN 'CREDIT'
    WHEN debit_minor > 0 AND credit_minor = 0 THEN 'DEBIT'
    WHEN credit_minor > 0 THEN 'CREDIT'
    WHEN debit_minor > 0 THEN 'DEBIT'
    ELSE credit_debit
END
WHERE credit_debit IS NULL OR credit_debit = '';

UPDATE bank_transaction_observations
SET utr_raw = COALESCE(utr_raw, utr)
WHERE utr_raw IS NULL AND utr IS NOT NULL AND utr <> '';

CREATE UNIQUE INDEX IF NOT EXISTS bank_txn_identity_hash_uidx
    ON bank_transaction_observations (observation_identity_hash)
    WHERE observation_identity_hash IS NOT NULL AND observation_identity_hash <> '';

CREATE TABLE IF NOT EXISTS settlement_bank_match_decisions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    settlement_line_id TEXT,
    bank_observation_id TEXT,
    state TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    rule TEXT NOT NULL DEFAULT '',
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_bank_match_tenant_idx
    ON settlement_bank_match_decisions (tenant_id, connector_id, decided_at DESC);

-- +goose Down
DROP INDEX IF EXISTS settlement_bank_match_tenant_idx;
DROP TABLE IF EXISTS settlement_bank_match_decisions;
DROP INDEX IF EXISTS bank_txn_identity_hash_uidx;
ALTER TABLE bank_transaction_observations
    DROP COLUMN IF EXISTS observation_identity_hash,
    DROP COLUMN IF EXISTS utr_raw,
    DROP COLUMN IF EXISTS credit_debit;
ALTER TABLE provider_settlement_line_observations
    DROP COLUMN IF EXISTS payment_link,
    DROP COLUMN IF EXISTS raw_reference,
    DROP COLUMN IF EXISTS source_row,
    DROP COLUMN IF EXISTS source_file,
    DROP COLUMN IF EXISTS canonical_status,
    DROP COLUMN IF EXISTS provider_status,
    DROP COLUMN IF EXISTS adjustment_minor;
