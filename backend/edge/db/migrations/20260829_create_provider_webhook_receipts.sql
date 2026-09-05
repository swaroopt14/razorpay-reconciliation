-- +goose Up
CREATE TABLE IF NOT EXISTS provider_webhook_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_mode TEXT NOT NULL CHECK (provider_mode IN ('test', 'live')),
    event_id TEXT NOT NULL,
    event_type TEXT,
    provider_entity_type TEXT,
    provider_entity_id TEXT,
    raw_body_uri TEXT,
    raw_body_hash TEXT NOT NULL,
    raw_body_size_bytes BIGINT NOT NULL,
    signature_header TEXT,
    signature_valid BOOLEAN NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_created_at TIMESTAMPTZ,
    ingestion_status TEXT NOT NULL DEFAULT 'received',
    published_at TIMESTAMPTZ,
    first_seen_trace_id TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ,
    delivery_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connector_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_receipts_tenant
    ON provider_webhook_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_webhook_receipts_status
    ON provider_webhook_receipts (ingestion_status);
CREATE INDEX IF NOT EXISTS idx_provider_webhook_receipts_received
    ON provider_webhook_receipts (received_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_provider_webhook_receipts_received;
DROP INDEX IF EXISTS idx_provider_webhook_receipts_status;
DROP INDEX IF EXISTS idx_provider_webhook_receipts_tenant;
DROP TABLE IF EXISTS provider_webhook_receipts;
