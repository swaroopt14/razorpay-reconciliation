-- +goose Up
-- Ledger item #18: PII tokenization contract is under-documented — store
-- which fields were actually tokenized and by what method, alongside the
-- existing tokenization_status bool. Nullable/additive only; payment_intents
-- only (not outbox), consistent with keeping the outbox write path minimal.
ALTER TABLE payment_intents ADD COLUMN tokenization_metadata JSONB NULL;

-- +goose Down
ALTER TABLE payment_intents DROP COLUMN tokenization_metadata;
