-- +goose Up
CREATE TABLE IF NOT EXISTS provider_payout_observation_events (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    payout_id TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_status TEXT,
    source_event_id TEXT,
    source_hash TEXT,
    payload_hash TEXT,
    amount_minor BIGINT,
    currency TEXT,
    utr TEXT,
    mode TEXT,
    purpose TEXT,
    status_reason TEXT,
    raw_reference TEXT,
    observation_identity_hash TEXT,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_payout_observation_events_identity_hash_uidx
    ON provider_payout_observation_events (observation_identity_hash);

CREATE INDEX IF NOT EXISTS provider_payout_observation_events_payout_idx
    ON provider_payout_observation_events (tenant_id, connector_id, payout_id);

CREATE TABLE IF NOT EXISTS canonical_payouts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    payout_id TEXT NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    provider_status TEXT NOT NULL,
    utr TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL DEFAULT '',
    status_reason TEXT NOT NULL DEFAULT '',
    provider_created_at TIMESTAMPTZ,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sources TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS canonical_payouts_uidx
    ON canonical_payouts (tenant_id, connector_id, provider, payout_id);

CREATE INDEX IF NOT EXISTS canonical_payouts_status_idx
    ON canonical_payouts (tenant_id, connector_id, provider_status);

-- +goose Down
DROP INDEX IF EXISTS canonical_payouts_status_idx;
DROP INDEX IF EXISTS canonical_payouts_uidx;
DROP TABLE IF EXISTS canonical_payouts;
DROP INDEX IF EXISTS provider_payout_observation_events_payout_idx;
DROP INDEX IF EXISTS provider_payout_observation_events_identity_hash_uidx;
DROP TABLE IF EXISTS provider_payout_observation_events;
