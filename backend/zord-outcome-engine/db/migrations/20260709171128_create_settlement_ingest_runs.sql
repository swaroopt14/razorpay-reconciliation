-- +goose Up
CREATE TABLE settlement_ingest_runs (
	ingest_run_id TEXT PRIMARY KEY,
	settlement_batch_id TEXT NOT NULL REFERENCES settlement_batches(settlement_batch_id),
	tenant_id UUID NOT NULL,
	psp TEXT NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	artifact_family TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	file_sha256 TEXT NOT NULL DEFAULT '',
	run_number INT NOT NULL DEFAULT 1,
	force_reprocess BOOLEAN NOT NULL DEFAULT FALSE,
	reprocess_reason TEXT,
	run_status TEXT NOT NULL DEFAULT 'PARSING',
	row_count_expected INT,
	row_count_parsed INT NOT NULL DEFAULT 0,
	row_count_canonicalized INT NOT NULL DEFAULT 0,
	row_count_failed INT NOT NULL DEFAULT 0,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	started_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	failure_reason_code TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX settlement_ingest_runs_batch_idx ON settlement_ingest_runs(settlement_batch_id);
CREATE INDEX settlement_ingest_runs_tenant_idx ON settlement_ingest_runs(tenant_id);
CREATE INDEX settlement_ingest_runs_status_idx ON settlement_ingest_runs(run_status);
CREATE INDEX settlement_ingest_runs_envelope_idx ON settlement_ingest_runs(settlement_envelope_id);

-- +goose Down
DROP INDEX settlement_ingest_runs_envelope_idx;
DROP INDEX settlement_ingest_runs_status_idx;
DROP INDEX settlement_ingest_runs_tenant_idx;
DROP INDEX settlement_ingest_runs_batch_idx;
DROP TABLE settlement_ingest_runs;
