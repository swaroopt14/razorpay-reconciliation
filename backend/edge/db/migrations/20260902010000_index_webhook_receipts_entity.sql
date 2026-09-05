-- +goose Up
CREATE INDEX IF NOT EXISTS idx_provider_webhook_receipts_entity
    ON provider_webhook_receipts (connector_id, provider_entity_id)
    WHERE provider_entity_id IS NOT NULL AND provider_entity_id <> '';

CREATE INDEX IF NOT EXISTS idx_provider_webhook_receipts_tenant_window
    ON provider_webhook_receipts (tenant_id, connector_id, received_at);

-- +goose Down
DROP INDEX IF EXISTS idx_provider_webhook_receipts_tenant_window;
DROP INDEX IF EXISTS idx_provider_webhook_receipts_entity;
