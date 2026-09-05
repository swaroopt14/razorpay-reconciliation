-- +goose Up
ALTER TABLE payment_intents ADD COLUMN source_row_ref TEXT;
ALTER TABLE payment_intents ADD COLUMN canonical_row_hash TEXT;

ALTER TABLE canonical_batches ADD COLUMN file_manifest_hash TEXT;
ALTER TABLE canonical_batches ADD COLUMN manifest_schema_version TEXT;
ALTER TABLE canonical_batches ADD COLUMN artifact_id TEXT;
ALTER TABLE canonical_batches ADD COLUMN artifact_version_id TEXT;
ALTER TABLE canonical_batches ADD COLUMN payload_type TEXT;

-- +goose Down
ALTER TABLE canonical_batches DROP COLUMN payload_type;
ALTER TABLE canonical_batches DROP COLUMN artifact_version_id;
ALTER TABLE canonical_batches DROP COLUMN artifact_id;
ALTER TABLE canonical_batches DROP COLUMN manifest_schema_version;
ALTER TABLE canonical_batches DROP COLUMN file_manifest_hash;

ALTER TABLE payment_intents DROP COLUMN canonical_row_hash;
ALTER TABLE payment_intents DROP COLUMN source_row_ref;
