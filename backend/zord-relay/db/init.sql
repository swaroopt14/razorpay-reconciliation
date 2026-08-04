-- dispatches: authoritative execution state table owned entirely by Service 4.
-- One row per (contract_id, attempt_count).
-- Service 2 is ACKed after Step 1 inserts this row — NOT after PSP ack.
-- All retry and failure decisions after Step 1 are owned here, not in Service 2.
CREATE TABLE IF NOT EXISTS dispatches (
    dispatch_id          TEXT        NOT NULL,
    contract_id          TEXT        NOT NULL,
    intent_id            TEXT        NOT NULL,
    tenant_id            TEXT        NOT NULL,
    trace_id             TEXT        NOT NULL,
    connector_id         TEXT        NOT NULL,
    corridor_id          TEXT,
    attempt_count        INTEGER     NOT NULL DEFAULT 1,
    status               TEXT        NOT NULL DEFAULT 'PENDING',
    provider_idempotency_key    TEXT NOT NULL DEFAULT '',
    correlation_carriers_json   JSONB NOT NULL DEFAULT '{}',
    payload_json                JSONB NOT NULL DEFAULT '{}',
    dispatch_governance_decision      TEXT,
    dispatch_governance_reason_codes  JSONB,
    retry_class                 TEXT,
    next_dispatch_attempt_at    TIMESTAMPTZ,
    provider_attempt_id         TEXT,
    provider_response_status    TEXT,
    provider_reference_last_seen TEXT,
    provider_request_fingerprint TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at              TIMESTAMPTZ,
    acked_at             TIMESTAMPTZ,
    PRIMARY KEY (dispatch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatches_contract_attempt
    ON dispatches (contract_id, attempt_count);

CREATE INDEX IF NOT EXISTS idx_dispatches_intent_id
    ON dispatches (intent_id);

CREATE INDEX IF NOT EXISTS idx_dispatches_pending_recovery
    ON dispatches (sent_at)
    WHERE status IN ('SENT', 'AWAITING_PROVIDER_SIGNAL');

CREATE INDEX IF NOT EXISTS idx_dispatches_retry
    ON dispatches (next_dispatch_attempt_at)
    WHERE status = 'FAILED_RETRYABLE'
      AND next_dispatch_attempt_at IS NOT NULL;

-- relay_outbox: Service 4 event durability. No PII ever stored here.
CREATE TABLE IF NOT EXISTS relay_outbox (
    event_id     TEXT        NOT NULL PRIMARY KEY,
    event_type   TEXT        NOT NULL,
    dispatch_id  TEXT        NOT NULL,
    contract_id  TEXT        NOT NULL,
    intent_id    TEXT        NOT NULL,
    tenant_id    TEXT        NOT NULL,
    trace_id     TEXT        NOT NULL,
    payload      JSONB       NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'PENDING',
    retry_count  INTEGER     NOT NULL DEFAULT 0,
    lease_id     TEXT,
    lease_until  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_relay_outbox_pending
    ON relay_outbox (created_at ASC)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_relay_outbox_dispatch_id
    ON relay_outbox (dispatch_id);

-- connector_health_state: tracks circuit breaker state per connector.
CREATE TABLE IF NOT EXISTS connector_health_state (
    connector_id          TEXT        NOT NULL PRIMARY KEY,
    circuit_state         TEXT        NOT NULL DEFAULT 'CLOSED',
    consecutive_failures  INTEGER     NOT NULL DEFAULT 0,
    opened_at             TIMESTAMPTZ,
    next_probe_at         TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- relay_payload_conflicts: audit trail for payload_hash verification failures.
-- Every time we lease an event whose payload recomputed hash does not match
-- the upstream-provided payload_hash, we write one row here. This is the
-- persistence requirement of P0 6.1.2 and feeds the operational alert.
CREATE TABLE IF NOT EXISTS relay_payload_conflicts (
    conflict_id          BIGSERIAL   NOT NULL PRIMARY KEY,
    service_name         TEXT        NOT NULL,
    event_id             TEXT        NOT NULL,
    event_type           TEXT,
    lease_id             TEXT,
    expected_hash        TEXT        NOT NULL,     -- upstream payload_hash
    computed_hash        TEXT        NOT NULL,     -- our SHA-256 over raw payload bytes
    payload_snippet      TEXT,                     -- first ~256 chars of payload for triage
    conflict_count       INTEGER     NOT NULL DEFAULT 1,  -- counts repeated NACK attempts for same event
    is_permanent         BOOLEAN     NOT NULL DEFAULT FALSE,  -- TRUE after MaxConflictRetries: we ACKed it out
    detected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at          TIMESTAMPTZ               -- NULL until ACKed or eventually succeeds
);

CREATE INDEX IF NOT EXISTS idx_relay_payload_conflicts_event
    ON relay_payload_conflicts (service_name, event_id);

CREATE INDEX IF NOT EXISTS idx_relay_payload_conflicts_detected
    ON relay_payload_conflicts (detected_at DESC);