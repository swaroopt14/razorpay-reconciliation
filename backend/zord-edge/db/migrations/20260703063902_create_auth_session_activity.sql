-- +goose Up
CREATE TABLE IF NOT EXISTS auth_session_activity (
    session_id UUID PRIMARY KEY,
    last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS auth_session_activity;