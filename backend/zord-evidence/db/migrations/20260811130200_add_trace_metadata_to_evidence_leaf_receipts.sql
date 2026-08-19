-- +goose Up
ALTER TABLE evidence_leaf_receipts ADD COLUMN trace_id TEXT;
ALTER TABLE evidence_leaf_receipts ADD COLUMN schema_version TEXT NOT NULL DEFAULT '';
ALTER TABLE evidence_leaf_receipts ADD COLUMN event_version TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE evidence_leaf_receipts DROP COLUMN event_version;
ALTER TABLE evidence_leaf_receipts DROP COLUMN schema_version;
ALTER TABLE evidence_leaf_receipts DROP COLUMN trace_id;
