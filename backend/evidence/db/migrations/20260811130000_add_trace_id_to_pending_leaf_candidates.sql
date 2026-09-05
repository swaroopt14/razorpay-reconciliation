-- +goose Up
ALTER TABLE pending_leaf_candidates ADD COLUMN trace_id TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE pending_leaf_candidates DROP COLUMN trace_id;
