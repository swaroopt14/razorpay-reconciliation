-- +goose Up
CREATE TABLE dispatch_index(
	dispatch_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	intent_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL,
	attempt_count INT NOT NULL DEFAULT 0,
	provider_attempt_id TEXT,
	correlation_carriers JSONB,
	provider_ref_hashes TEXT[]
);

-- +goose Down
DROP TABLE dispatch_index;
