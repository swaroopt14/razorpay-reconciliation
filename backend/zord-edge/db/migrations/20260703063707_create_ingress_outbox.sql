-- +goose Up
CREATE TABLE IF NOT EXISTS "ingress_outbox" (
    outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID NOT NULL,
    envelope_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
     artifact_id UUID NOT NULL,
    artifact_version_id TEXT NOT NULL,
    object_ref TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    ingress_channel TEXT NOT NULL,
    source TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    encrypted_payload BYTEA NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/json',
    kms_key_version TEXT NOT NULL DEFAULT 'v1',
    encryption_key_id TEXT NOT NULL DEFAULT '',
    payload_hash TEXT NOT NULL,
    envelope_hash TEXT NOT NULL,
    envelope_signature BYTEA NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    lease_id UUID,
    leased_by TEXT,
    event_type TEXT NOT NULL,
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    failure_reason_code TEXT,
    batchid TEXT,
    file_content_hash TEXT,
    source_row_ref TEXT,
    source_system TEXT NOT NULL DEFAULT '',
    raw_row_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease
    ON ingress_outbox (status, lease_until, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_lease_id
    ON ingress_outbox (lease_id);

-- +goose Down
DROP INDEX IF EXISTS idx_outbox_lease_id;
DROP INDEX IF EXISTS idx_outbox_pending_lease;
DROP TABLE IF EXISTS "ingress_outbox";
