-- +goose Up
CREATE TABLE backfill_cursors (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    resource_type TEXT NOT NULL,
    window_from TIMESTAMPTZ NOT NULL,
    window_to TIMESTAMPTZ NOT NULL,
    page_skip INT NOT NULL DEFAULT 0,
    page_count INT NOT NULL DEFAULT 100,
    pages_completed INT NOT NULL DEFAULT 0,
    last_provider_id TEXT,
    last_response_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'complete', 'paused', 'failed')),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, resource_type, window_from, window_to)
);

CREATE INDEX backfill_cursors_lease_idx
    ON backfill_cursors (lease_expires_at)
    WHERE status = 'active';

-- +goose Down
DROP INDEX IF EXISTS backfill_cursors_lease_idx;
DROP TABLE IF EXISTS backfill_cursors;
