-- +goose Up
-- +goose StatementBegin
-- OUT-04: consume-time ledger for intent.created.v1.
-- Same event_id + same payload_hash is a no-op.
-- Same event_id + different hash, or a mutation of an already-accepted
-- intent, is CONFLICTED and must not change canonical_intents.
CREATE TABLE event_receipts (
    event_id              TEXT PRIMARY KEY,
    tenant_id             TEXT NOT NULL,
    event_type            TEXT NOT NULL,
    schema_version        TEXT,
    payload_hash          TEXT NOT NULL,
    intent_id             TEXT,
    trace_id              TEXT,
    processing_status     TEXT NOT NULL DEFAULT 'PROCESSED'
        CHECK (processing_status IN ('PROCESSED', 'CONFLICTED')),
    incoming_payload_hash TEXT,
    conflict_reason       TEXT,
    received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_receipts_tenant
    ON event_receipts (tenant_id, received_at DESC);
CREATE INDEX idx_event_receipts_intent
    ON event_receipts (intent_id)
    WHERE intent_id IS NOT NULL;
CREATE INDEX idx_event_receipts_conflicted
    ON event_receipts (received_at DESC)
    WHERE processing_status = 'CONFLICTED';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_event_receipts_conflicted;
DROP INDEX IF EXISTS idx_event_receipts_intent;
DROP INDEX IF EXISTS idx_event_receipts_tenant;
DROP TABLE IF EXISTS event_receipts;
-- +goose StatementEnd
