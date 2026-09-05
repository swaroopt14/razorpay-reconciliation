-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE intent_event_dead_letters (
    dead_letter_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            TEXT,
    event_type          TEXT,
    schema_version      TEXT,
    tenant_id           TEXT,
    trace_id            TEXT,
    raw_payload         JSONB,
    rejection_reason    TEXT NOT NULL,
    rejection_stage     TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intent_event_dead_letters_tenant
    ON intent_event_dead_letters (tenant_id);
CREATE INDEX idx_intent_event_dead_letters_created_at
    ON intent_event_dead_letters (created_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_intent_event_dead_letters_created_at;
DROP INDEX IF EXISTS idx_intent_event_dead_letters_tenant;
DROP TABLE IF EXISTS intent_event_dead_letters;
-- +goose StatementEnd
