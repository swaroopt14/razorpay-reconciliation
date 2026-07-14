-- +goose Up
ALTER TABLE outbox ADD COLUMN source_row_ref TEXT;
ALTER TABLE outbox ADD COLUMN canonical_row_hash TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN canonical_row_hash;
ALTER TABLE outbox DROP COLUMN source_row_ref;
