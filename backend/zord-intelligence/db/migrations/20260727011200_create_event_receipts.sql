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
	processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
	CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
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

-- +goose Down
DROP INDEX idx_event_receipts_received;
DROP INDEX idx_event_receipts_failed;
DROP TABLE event_receipts;
