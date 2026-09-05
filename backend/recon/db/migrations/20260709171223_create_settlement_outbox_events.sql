-- +goose Up
CREATE TABLE settlement_outbox_events(
	outbox_event_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	entity_family TEXT NOT NULL,
	entity_id UUID NOT NULL,
	event_type TEXT NOT NULL,
	payload_json JSONB NOT NULL,
	status TEXT NOT NULL,
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	published_at TIMESTAMPTZ,
	lease_id UUID,
	leased_by TEXT,
	lease_until TIMESTAMPTZ
);
CREATE INDEX settlement_outbox_events_status_idx ON settlement_outbox_events(status, next_retry_at);
CREATE INDEX settlement_outbox_run_idx ON settlement_outbox_events(ingest_run_id);

-- +goose Down
DROP INDEX settlement_outbox_run_idx;
DROP INDEX settlement_outbox_events_status_idx;
DROP TABLE settlement_outbox_events;
