-- +goose Up
CREATE TABLE IF NOT EXISTS "connectors" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    provider TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    secret_ref TEXT,
    secret TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_provider_connector UNIQUE (provider, connector_id),
    CONSTRAINT unique_tenant_connector UNIQUE (tenant_id, provider, connector_id)
);

-- +goose Down
DROP TABLE IF EXISTS "connectors";