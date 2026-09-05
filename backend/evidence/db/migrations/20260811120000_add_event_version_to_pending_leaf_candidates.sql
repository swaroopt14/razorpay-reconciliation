-- +goose Up
ALTER TABLE pending_leaf_candidates ADD COLUMN event_version TEXT NOT NULL DEFAULT 'v1';

-- +goose Down
ALTER TABLE pending_leaf_candidates DROP COLUMN event_version;
