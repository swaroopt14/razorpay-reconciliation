-- +goose Up
CREATE TABLE attachment_outbox_events (
	outbox_event_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID,
	attachment_job_id UUID NOT NULL,
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
CREATE INDEX attachment_outbox_status_idx ON attachment_outbox_events(status, next_retry_at);
CREATE INDEX attachment_outbox_job_idx ON attachment_outbox_events(attachment_job_id);

-- +goose Down
DROP INDEX attachment_outbox_job_idx;
DROP INDEX attachment_outbox_status_idx;
DROP TABLE attachment_outbox_events;
