-- +goose Up
ALTER TABLE payment_intents ADD COLUMN artifact_id TEXT;
ALTER TABLE payment_intents ADD COLUMN artifact_version_id TEXT;

ALTER TABLE outbox ADD COLUMN artifact_id TEXT;
ALTER TABLE outbox ADD COLUMN artifact_version_id TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN artifact_version_id;
ALTER TABLE outbox DROP COLUMN artifact_id;

ALTER TABLE payment_intents DROP COLUMN artifact_version_id;
ALTER TABLE payment_intents DROP COLUMN artifact_id;
