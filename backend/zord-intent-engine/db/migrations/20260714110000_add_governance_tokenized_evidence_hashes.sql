-- +goose Up
ALTER TABLE payment_intents ADD COLUMN input_facts_hash TEXT;
ALTER TABLE payment_intents ADD COLUMN tokenized_data_hash TEXT;
ALTER TABLE payment_intents ADD COLUMN raw_row_evidence_leaf_hash TEXT;
ALTER TABLE payment_intents ADD COLUMN canonical_row_evidence_leaf_hash TEXT;

ALTER TABLE outbox ADD COLUMN input_facts_hash TEXT;
ALTER TABLE outbox ADD COLUMN tokenized_data_hash TEXT;
ALTER TABLE outbox ADD COLUMN raw_row_evidence_leaf_hash TEXT;
ALTER TABLE outbox ADD COLUMN canonical_row_evidence_leaf_hash TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN canonical_row_evidence_leaf_hash;
ALTER TABLE outbox DROP COLUMN raw_row_evidence_leaf_hash;
ALTER TABLE outbox DROP COLUMN tokenized_data_hash;
ALTER TABLE outbox DROP COLUMN input_facts_hash;

ALTER TABLE payment_intents DROP COLUMN canonical_row_evidence_leaf_hash;
ALTER TABLE payment_intents DROP COLUMN raw_row_evidence_leaf_hash;
ALTER TABLE payment_intents DROP COLUMN tokenized_data_hash;
ALTER TABLE payment_intents DROP COLUMN input_facts_hash;
