-- +goose Up
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    tenant_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL,
    first_envelope_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'RESERVED',
    request_fingerprint TEXT,
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    resolution_type TEXT NOT NULL DEFAULT 'CREATED',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    response_snapshot_json TEXT,
    conflict_count INT DEFAULT 0,
    last_conflict_at TIMESTAMPTZ,
    principal_id_first_seen UUID,
    source_class_first_seen TEXT,
    PRIMARY KEY (tenant_id, idempotency_key),
    UNIQUE (tenant_id, idempotency_key)
);

-- +goose Down
DROP TABLE IF EXISTS "idempotency_keys";