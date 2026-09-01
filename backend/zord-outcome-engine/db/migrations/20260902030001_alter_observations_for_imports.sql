-- +goose Up
ALTER TABLE provider_settlement_line_observations
    ADD COLUMN IF NOT EXISTS import_id UUID,
    ADD COLUMN IF NOT EXISTS refund_id TEXT,
    ADD COLUMN IF NOT EXISTS raw_record JSONB;

ALTER TABLE bank_transaction_observations
    ADD COLUMN IF NOT EXISTS import_id UUID,
    ADD COLUMN IF NOT EXISTS source_row_number BIGINT,
    ADD COLUMN IF NOT EXISTS normalized_description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reference_number TEXT,
    ADD COLUMN IF NOT EXISTS raw_row JSONB;

-- +goose Down
ALTER TABLE bank_transaction_observations
    DROP COLUMN IF EXISTS raw_row,
    DROP COLUMN IF EXISTS reference_number,
    DROP COLUMN IF EXISTS normalized_description,
    DROP COLUMN IF EXISTS source_row_number,
    DROP COLUMN IF EXISTS import_id;

ALTER TABLE provider_settlement_line_observations
    DROP COLUMN IF EXISTS raw_record,
    DROP COLUMN IF EXISTS refund_id,
    DROP COLUMN IF EXISTS import_id;
