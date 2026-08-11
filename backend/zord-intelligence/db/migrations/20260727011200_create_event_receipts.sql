-- +goose Up
CREATE TABLE event_receipts (
	tenant_id         TEXT NOT NULL,
	event_source      TEXT NOT NULL,
	event_type        TEXT NOT NULL,
	event_version     TEXT NOT NULL DEFAULT 'legacy',
	event_id          TEXT NOT NULL,
	payload_hash      TEXT,
	scope_type        TEXT,
	scope_ref         TEXT,
	-- required event-contract field (docs/service_7_refactoring_clarifications.md
	-- §13); nullable/no default, no meaningful synthetic value for a missing one.
	trace_id          TEXT,
	processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
	-- CONFLICTED added for corrective-action-report P0-03: a payload-hash
	-- mismatch on a duplicate event_id is a terminal, ops-resolvable state,
	-- not a plain FAILED (retryable) or PROCESSED (fully normal) outcome.
	CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'CONFLICTED')),
	attempt_count     INT  NOT NULL DEFAULT 0,
	received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
	processed_at      TIMESTAMPTZ,
	error_code        TEXT,
	error_detail      TEXT,
	PRIMARY KEY (tenant_id, event_source, event_id)
);

CREATE INDEX idx_event_receipts_failed
	ON event_receipts (tenant_id, received_at DESC)
	WHERE processing_status = 'FAILED';

CREATE INDEX idx_event_receipts_received
	ON event_receipts (received_at);

-- INTEL-04: supports GET /v1/intelligence/trace/{trace_id}?tenant_id=X
-- (EventReceiptRepo.ListByTraceID), which filters on (tenant_id, trace_id)
-- and orders by received_at. Without this, that query would be a sequential
-- scan over the whole table.
CREATE INDEX idx_event_receipts_trace_id
	ON event_receipts (tenant_id, trace_id, received_at);

-- +goose Down
DROP INDEX idx_event_receipts_trace_id;
DROP INDEX idx_event_receipts_received;
DROP INDEX idx_event_receipts_failed;
DROP TABLE event_receipts;
