-- +goose Up
-- token_map: PRIMARY KEY is (tenant_id, kind, token_id). This enforces that
-- the same token_id cannot exist for two different tenants or two different
-- kinds -- closes the cross-tenant linkability gap. Exact carry-over of the
-- CREATE TABLE IF NOT EXISTS this service ran in Go at startup (TOK-06) --
-- unchanged SQL means an environment that already has this table (from the
-- old runtime-creation code) ends up with an identical schema to a fresh
-- database that only ever ran this migration.
CREATE TABLE IF NOT EXISTS token_map (
    token_id          VARCHAR      NOT NULL,
    tenant_id         UUID         NOT NULL,
    kind              TEXT         NOT NULL,

    ciphertext        BYTEA        NOT NULL,
    nonce             BYTEA        NOT NULL,

    encryption_key_id VARCHAR      NOT NULL,

    key_version       INT          NOT NULL,
    status            TEXT         NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    PRIMARY KEY (tenant_id, kind, token_id)
);

-- Index for fast token lookup by token_id + tenant_id during detokenize
CREATE INDEX IF NOT EXISTS idx_token_map_lookup
ON token_map(token_id, tenant_id);

-- Index for key migration: find all tokens on a given key
CREATE INDEX IF NOT EXISTS idx_token_key
ON token_map(encryption_key_id);

-- +goose Down
DROP TABLE IF EXISTS token_map;
