-- +goose Up
CREATE TABLE settlement_parse_errors(
	error_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	source_row_ref TEXT,
	error_stage TEXT NOT NULL,
	reason_code TEXT NOT NULL,
	reason_detail_redacted TEXT,
	severity TEXT NOT NULL,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	client_batch_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX settlement_parse_errors_run_idx ON settlement_parse_errors(ingest_run_id);

-- +goose Down
DROP INDEX settlement_parse_errors_run_idx;
DROP TABLE settlement_parse_errors;
