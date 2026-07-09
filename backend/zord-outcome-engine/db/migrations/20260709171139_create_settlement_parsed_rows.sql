-- +goose Up
CREATE TABLE settlement_parsed_rows(
	parsed_row_id UUID PRIMARY KEY,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	tenant_id UUID NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_row_ref TEXT NOT NULL,
	raw_line_hash TEXT,
	raw_columns_json JSONB NOT NULL,
	parsed_candidates_json JSONB NOT NULL,
	parse_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	parse_quality_label TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	client_batch_id TEXT,
	status TEXT NOT NULL DEFAULT 'PARSED',
	failure_reason_code TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX settlement_parsed_rows_run_idx ON settlement_parsed_rows(ingest_run_id);

-- +goose Down
DROP INDEX settlement_parsed_rows_run_idx;
DROP TABLE settlement_parsed_rows;
