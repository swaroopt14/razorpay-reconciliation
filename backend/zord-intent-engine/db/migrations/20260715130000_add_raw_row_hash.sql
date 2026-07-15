-- +goose Up
ALTER TABLE payment_intents ADD COLUMN raw_row_hash TEXT;
ALTER TABLE outbox ADD COLUMN raw_row_hash TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN raw_row_hash;
ALTER TABLE payment_intents DROP COLUMN raw_row_hash;
