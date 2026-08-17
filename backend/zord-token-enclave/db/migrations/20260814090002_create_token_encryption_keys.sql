-- +goose Up
-- token_encryption_keys: exact carry-over of the CREATE TABLE IF NOT
-- EXISTS this service ran in Go at startup (TOK-06). The partial unique
-- index enforces exactly one ACTIVE key per tenant at any time -- RotateKey
-- (internal/repository/token_repo.go) relies on this: it marks the current
-- ACTIVE key RETIRING and inserts the new ACTIVE key in the same
-- transaction, so this constraint is never violated mid-rotation.
CREATE TABLE IF NOT EXISTS token_encryption_keys (
    key_id           VARCHAR      PRIMARY KEY,
    tenant_id        UUID         NOT NULL,

    key_version      INT          NOT NULL,
    algorithm        VARCHAR      DEFAULT 'AES-256-GCM',

    encrypted_key    BYTEA        NOT NULL,

    status           VARCHAR      CHECK (status IN ('ACTIVE', 'RETIRING', 'RETIRED')),

    active_from      TIMESTAMPTZ,
    retire_from      TIMESTAMPTZ,
    fully_retired_at TIMESTAMPTZ,

    created_by       VARCHAR,
    created_at       TIMESTAMPTZ  DEFAULT now()
);

-- Enforce one ACTIVE key per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_key_per_tenant
ON token_encryption_keys(tenant_id)
WHERE status = 'ACTIVE';

-- +goose Down
DROP TABLE IF EXISTS token_encryption_keys;
