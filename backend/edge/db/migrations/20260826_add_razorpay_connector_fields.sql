-- +goose Up
ALTER TABLE connectors
    ADD COLUMN IF NOT EXISTS provider_mode TEXT NOT NULL DEFAULT 'test',
    ADD COLUMN IF NOT EXISTS api_key_ref TEXT,
    ADD COLUMN IF NOT EXISTS api_secret_ref TEXT,
    ADD COLUMN IF NOT EXISTS webhook_secret_ref TEXT,
    ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
    ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_health_status TEXT,
    ADD COLUMN IF NOT EXISTS last_health_error_code TEXT;

ALTER TABLE connectors
    ADD CONSTRAINT connectors_provider_mode_check
    CHECK (provider_mode IN ('test', 'live'));

CREATE UNIQUE INDEX IF NOT EXISTS connectors_tenant_provider_mode_uq
    ON connectors (tenant_id, provider, provider_mode);

-- +goose Down
DROP INDEX IF EXISTS connectors_tenant_provider_mode_uq;
ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_provider_mode_check;
ALTER TABLE connectors DROP COLUMN IF EXISTS provider_mode;
ALTER TABLE connectors DROP COLUMN IF EXISTS api_key_ref;
ALTER TABLE connectors DROP COLUMN IF EXISTS api_secret_ref;
ALTER TABLE connectors DROP COLUMN IF EXISTS webhook_secret_ref;
ALTER TABLE connectors DROP COLUMN IF EXISTS provider_account_id;
ALTER TABLE connectors DROP COLUMN IF EXISTS last_health_check_at;
ALTER TABLE connectors DROP COLUMN IF EXISTS last_health_status;
ALTER TABLE connectors DROP COLUMN IF EXISTS last_health_error_code;
