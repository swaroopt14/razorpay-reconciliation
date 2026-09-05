-- +goose Up
ALTER TABLE evidence_items ADD COLUMN trace_id TEXT NOT NULL DEFAULT '';
ALTER TABLE evidence_items ADD COLUMN source_event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE evidence_items ADD COLUMN event_version TEXT NOT NULL DEFAULT 'v1';

-- +goose Down
ALTER TABLE evidence_items DROP COLUMN event_version;
ALTER TABLE evidence_items DROP COLUMN source_event_id;
ALTER TABLE evidence_items DROP COLUMN trace_id;
