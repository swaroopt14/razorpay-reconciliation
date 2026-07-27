-- +goose Up
CREATE TABLE dlq_items (
    dlq_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    envelope_id UUID NOT NULL,
    stage TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    error_detail TEXT,
    replayable BOOLEAN NOT NULL,
    client_batch_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id TEXT,
    source_row_num INT,
    dlq_status TEXT NOT NULL DEFAULT 'DLQ_TERMINAL',
    intent_context JSONB,
    trace_id TEXT,
    lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ
);

CREATE INDEX idx_dlq_items_pending_lease
    ON dlq_items (dlq_status, lease_until, created_at);
CREATE INDEX idx_dlq_items_lease_id
    ON dlq_items (lease_id);
CREATE INDEX idx_dlq_items_batch_id
    ON dlq_items (batch_id) WHERE batch_id IS NOT NULL;

-- +goose Down
DROP INDEX idx_dlq_items_batch_id;
DROP INDEX idx_dlq_items_lease_id;
DROP INDEX idx_dlq_items_pending_lease;
DROP TABLE dlq_items;
