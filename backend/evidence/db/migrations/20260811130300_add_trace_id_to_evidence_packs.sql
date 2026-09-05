-- +goose Up
ALTER TABLE evidence_packs ADD COLUMN trace_id TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE evidence_packs DROP COLUMN trace_id;
