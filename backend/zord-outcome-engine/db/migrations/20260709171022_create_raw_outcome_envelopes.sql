-- +goose Up
CREATE TABLE raw_outcome_envelopes(
	raw_outcome_envelope_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	source_class TEXT NOT NULL,
	received_at TIMESTAMPTZ NOT NULL,
	raw_bytes_sha256 BYTEA NOT NULL,
	object_store_ref TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX raw_outcome_envelopes_tenant_sha256_uq ON raw_outcome_envelopes(tenant_id, raw_bytes_sha256);

-- +goose Down
DROP INDEX raw_outcome_envelopes_tenant_sha256_uq;
DROP TABLE raw_outcome_envelopes;
