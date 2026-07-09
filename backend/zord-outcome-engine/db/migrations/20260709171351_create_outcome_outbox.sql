-- +goose Up
CREATE TABLE outcome_outbox (
	event_id UUID PRIMARY KEY,
	envelope_id UUID,
	trace_id UUID,
	tenant_id UUID NOT NULL,
	contract_id TEXT,
	aggregate_type TEXT NOT NULL,
	aggregate_id UUID NOT NULL,
	event_type TEXT NOT NULL,
	schema_version TEXT NOT NULL DEFAULT 'v1',
	payload JSONB NOT NULL,
	payload_hash BYTEA,
	status TEXT NOT NULL DEFAULT 'PENDING',
	retry_count INT NOT NULL DEFAULT 0,
	next_attempt_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	sent_at TIMESTAMPTZ,
	lease_id UUID,
	leased_by TEXT,
	lease_until TIMESTAMPTZ,
	batchid TEXT,
	settlement_record_received TIMESTAMPTZ,
	canonical_settlement_created TIMESTAMPTZ,
	bank_reference TEXT,
	client_reference TEXT,
	attachment_decision TEXT,
	match_confidence DOUBLE PRECISION,
	value_date_check BOOLEAN,
	amount_match BOOLEAN,
	bank_id TEXT,
	source_system TEXT,
	corridor_id TEXT
);
CREATE INDEX outcome_outbox_status_idx ON outcome_outbox(status, next_attempt_at);
CREATE INDEX outcome_outbox_tenant_idx ON outcome_outbox(tenant_id);

-- +goose Down
DROP INDEX outcome_outbox_tenant_idx;
DROP INDEX outcome_outbox_status_idx;
DROP TABLE outcome_outbox;
