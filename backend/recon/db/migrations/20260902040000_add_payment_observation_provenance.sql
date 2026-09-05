-- +goose Up
ALTER TABLE provider_payment_observations
    ADD COLUMN IF NOT EXISTS method TEXT,
    ADD COLUMN IF NOT EXISTS captured_at_provider TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS contact TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS webhook_missing BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE provider_payment_observations
SET sources = ARRAY[source]
WHERE (sources IS NULL OR cardinality(sources) = 0) AND source IS NOT NULL AND source <> '';

UPDATE provider_payment_observations
SET source = 'api_backfill'
WHERE source = 'razorpay_api';

UPDATE provider_payment_observations
SET sources = ARRAY['api_backfill']
WHERE sources = ARRAY['razorpay_api'];

UPDATE provider_payment_observations
SET webhook_missing = NOT ('webhook' = ANY (sources));

CREATE TABLE IF NOT EXISTS provider_payment_observation_events (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    payment_id TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_payment_observation_events_identity_idx
    ON provider_payment_observation_events (tenant_id, connector_id, payment_id, observed_at);

ALTER TABLE outcome_outbox
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS outcome_outbox_idempotency_uidx
    ON outcome_outbox (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS outcome_outbox_idempotency_uidx;
ALTER TABLE outcome_outbox DROP COLUMN IF EXISTS idempotency_key;

DROP INDEX IF EXISTS provider_payment_observation_events_identity_idx;
DROP TABLE IF EXISTS provider_payment_observation_events;

ALTER TABLE provider_payment_observations
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS first_seen_at,
    DROP COLUMN IF EXISTS webhook_missing,
    DROP COLUMN IF EXISTS sources,
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS contact,
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS captured_at_provider,
    DROP COLUMN IF EXISTS method;
