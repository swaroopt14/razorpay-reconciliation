-- +goose Up
-- R-03: durable record of a Kafka message that exhausted its in-place retry
-- attempts (kafka/consumer.go), written BEFORE the source offset is marked.
-- idempotency_key is event_id when the payload parsed and carried one,
-- otherwise "topic:partition:offset" — either way it is stable across
-- redelivery of the exact same message, so a crash/restart between this
-- write succeeding and the offset actually committing (sarama's AutoCommit
-- flushes on its own schedule, not synchronously with MarkMessage) cannot
-- produce a second row for the same failure.
CREATE TABLE consumer_failure_receipts (
    failure_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    event_id TEXT,
    topic TEXT NOT NULL,
    partition INT NOT NULL,
    "offset" BIGINT NOT NULL,
    tenant_id TEXT,
    trace_id TEXT,
    request_id TEXT,
    payload BYTEA,
    payload_hash TEXT NOT NULL,
    headers_json JSONB,
    error_category TEXT NOT NULL,
    error_message TEXT NOT NULL,
    attempt_count INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DEAD_LETTERED'
        CHECK (status IN ('DEAD_LETTERED', 'REPLAYING', 'REPLAYED', 'RESOLVED', 'QUARANTINED')),
    first_attempt_at TIMESTAMPTZ NOT NULL,
    last_attempt_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);

CREATE INDEX idx_consumer_failure_receipts_status
    ON consumer_failure_receipts (status, created_at);
CREATE INDEX idx_consumer_failure_receipts_tenant
    ON consumer_failure_receipts (tenant_id) WHERE tenant_id IS NOT NULL;

-- +goose Down
DROP INDEX idx_consumer_failure_receipts_tenant;
DROP INDEX idx_consumer_failure_receipts_status;
DROP TABLE consumer_failure_receipts;
