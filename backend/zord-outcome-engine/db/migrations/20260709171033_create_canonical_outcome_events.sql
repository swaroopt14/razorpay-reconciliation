-- +goose Up
CREATE TABLE canonical_outcome_events(
	event_id UUID PRIMARY KEY,
	raw_outcome_envelope_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	contract_id UUID,
	intent_id UUID,
	dispatch_id UUID,
	trace_id UUID,
	connector_id UUID NOT NULL,
	corridor_id TEXT,
	source_class TEXT NOT NULL,
	status_candidate TEXT NOT NULL,
	provider_ref_hash TEXT,
	provider_event_id TEXT,
	utr TEXT,
	amount NUMERIC(20,2),
	currency TEXT,
	observed_at TIMESTAMPTZ,
	received_at TIMESTAMPTZ NOT NULL,
	correlation_confidence INT NOT NULL DEFAULT 0,
	dedupe_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX canonical_outcome_events_dedupe_key_uq ON canonical_outcome_events(dedupe_key);
CREATE INDEX canonical_outcome_events_contract_idx ON canonical_outcome_events(contract_id);
CREATE INDEX canonical_outcome_events_dispatch_idx ON canonical_outcome_events(dispatch_id);

-- +goose Down
DROP INDEX canonical_outcome_events_dispatch_idx;
DROP INDEX canonical_outcome_events_contract_idx;
DROP INDEX canonical_outcome_events_dedupe_key_uq;
DROP TABLE canonical_outcome_events;
