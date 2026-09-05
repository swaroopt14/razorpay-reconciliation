-- +goose Up
ALTER TABLE provider_payment_observation_events
    ADD COLUMN IF NOT EXISTS provider_status TEXT,
    ADD COLUMN IF NOT EXISTS canonical_status TEXT,
    ADD COLUMN IF NOT EXISTS source_event_id TEXT,
    ADD COLUMN IF NOT EXISTS source_hash TEXT,
    ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
    ADD COLUMN IF NOT EXISTS currency TEXT,
    ADD COLUMN IF NOT EXISTS order_id TEXT,
    ADD COLUMN IF NOT EXISTS raw_reference TEXT,
    ADD COLUMN IF NOT EXISTS observation_identity_hash TEXT;

UPDATE provider_payment_observation_events
SET provider_status = COALESCE(provider_status, status),
    canonical_status = COALESCE(canonical_status, status),
    source_hash = COALESCE(source_hash, payload_hash)
WHERE provider_status IS NULL OR canonical_status IS NULL OR source_hash IS NULL;

UPDATE provider_payment_observation_events
SET observation_identity_hash = encode(sha256(convert_to(
    COALESCE(tenant_id::text,'') || '|' ||
    COALESCE(connector_id::text,'') || '|' ||
    'razorpay' || '|' ||
    COALESCE(payment_id,'') || '|' ||
    COALESCE(source,'') || '|' ||
    COALESCE(source_event_id,'') || '|' ||
    COALESCE(source_hash, payload_hash, '')
, 'UTF8')), 'hex')
WHERE observation_identity_hash IS NULL OR observation_identity_hash = '';

UPDATE provider_payment_observation_events e
SET observation_identity_hash = encode(sha256(convert_to(
    COALESCE(e.observation_identity_hash,'') || '|' || e.id::text
, 'UTF8')), 'hex')
WHERE e.id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY observation_identity_hash ORDER BY observed_at, id
        ) AS rn
        FROM provider_payment_observation_events
        WHERE observation_identity_hash IS NOT NULL
    ) d WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_payment_observation_events_identity_hash_uidx
    ON provider_payment_observation_events (observation_identity_hash);

CREATE INDEX IF NOT EXISTS provider_payment_observation_events_payment_idx
    ON provider_payment_observation_events (tenant_id, connector_id, payment_id);

CREATE INDEX IF NOT EXISTS provider_payment_observation_events_order_idx
    ON provider_payment_observation_events (tenant_id, order_id)
    WHERE order_id IS NOT NULL AND order_id <> '';

CREATE INDEX IF NOT EXISTS provider_payment_observation_events_source_event_idx
    ON provider_payment_observation_events (connector_id, source_event_id)
    WHERE source_event_id IS NOT NULL AND source_event_id <> '';

CREATE TABLE IF NOT EXISTS canonical_payments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    order_id TEXT,
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    method TEXT,
    provider_status TEXT NOT NULL,
    canonical_status TEXT NOT NULL,
    captured BOOLEAN NOT NULL DEFAULT FALSE,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    tax_minor BIGINT NOT NULL DEFAULT 0,
    provider_created_at TIMESTAMPTZ,
    captured_at TIMESTAMPTZ,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sources TEXT[] NOT NULL DEFAULT '{}',
    intent_id UUID,
    intent_link TEXT NOT NULL DEFAULT 'unlinked',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, connector_id, provider, payment_id)
);

CREATE INDEX IF NOT EXISTS canonical_payments_order_idx
    ON canonical_payments (tenant_id, order_id)
    WHERE order_id IS NOT NULL AND order_id <> '';

CREATE INDEX IF NOT EXISTS canonical_payments_status_idx
    ON canonical_payments (tenant_id, connector_id, canonical_status);

-- +goose Down
DROP INDEX IF EXISTS canonical_payments_status_idx;
DROP INDEX IF EXISTS canonical_payments_order_idx;
DROP TABLE IF EXISTS canonical_payments;

DROP INDEX IF EXISTS provider_payment_observation_events_source_event_idx;
DROP INDEX IF EXISTS provider_payment_observation_events_order_idx;
DROP INDEX IF EXISTS provider_payment_observation_events_payment_idx;
DROP INDEX IF EXISTS provider_payment_observation_events_identity_hash_uidx;

ALTER TABLE provider_payment_observation_events
    DROP COLUMN IF EXISTS observation_identity_hash,
    DROP COLUMN IF EXISTS raw_reference,
    DROP COLUMN IF EXISTS order_id,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS amount_minor,
    DROP COLUMN IF EXISTS source_hash,
    DROP COLUMN IF EXISTS source_event_id,
    DROP COLUMN IF EXISTS canonical_status,
    DROP COLUMN IF EXISTS provider_status;
