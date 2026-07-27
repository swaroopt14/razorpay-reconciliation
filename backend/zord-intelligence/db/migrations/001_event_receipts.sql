-- Migration 001: event_receipts — traceable idempotency ledger (Phase 1)
--
-- Replaces processed_events as the idempotency gate (clarification doc §2/§4).
-- Applied by the team's Kubernetes Job in production; init.sql carries the same
-- idempotent DDL for dev/fresh databases.
--
-- Rollback: DROP TABLE IF EXISTS event_receipts;
-- (Safe while dual-write is active — processed_events remains the fallback gate.)

CREATE TABLE IF NOT EXISTS event_receipts (
    tenant_id         TEXT NOT NULL,
    event_source      TEXT NOT NULL,
    -- Origin service/envelope source. 'legacy_processed_events' for backfilled rows.
    event_type        TEXT NOT NULL,          -- Kafka topic name
    event_version     TEXT NOT NULL DEFAULT 'legacy',
    event_id          TEXT NOT NULL,

    payload_hash      TEXT,                   -- sha256 hex over raw Kafka message bytes (computed by ZPI)
    scope_type        TEXT,
    scope_ref         TEXT,

    processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
    CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
    attempt_count     INT  NOT NULL DEFAULT 0,

    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at      TIMESTAMPTZ,
    error_code        TEXT,
    error_detail      TEXT,

    PRIMARY KEY (tenant_id, event_source, event_id)
);

-- Failed events queue: ops visibility + manual retry candidates (no DLQ topic in V1).
CREATE INDEX IF NOT EXISTS idx_event_receipts_failed
    ON event_receipts (tenant_id, received_at DESC)
    WHERE processing_status = 'FAILED';

-- Retention sweep path (Phase 9 cleanup worker).
CREATE INDEX IF NOT EXISTS idx_event_receipts_received
    ON event_receipts (received_at);
