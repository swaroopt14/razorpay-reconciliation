-- +goose Up
CREATE TABLE canonical_settlement_batches(
	settlement_batch_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id_ref TEXT NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	source_batch_ref TEXT,
	client_batch_id TEXT NOT NULL,
	artifact_family TEXT NOT NULL,
	outcome_artifact_id UUID NOT NULL,
	outcome_artifact_version_id UUID NOT NULL,
	row_count INT NOT NULL DEFAULT 0,
	success_count_estimate INT NOT NULL DEFAULT 0,
	failed_count_estimate INT NOT NULL DEFAULT 0,
	pending_count_estimate INT NOT NULL DEFAULT 0,
	reversal_count_estimate INT NOT NULL DEFAULT 0,
	total_amount NUMERIC(20,2) NOT NULL,
	total_settled_amount NUMERIC(20,2) NOT NULL,
	currency_code TEXT NOT NULL,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	attachment_readiness_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX canonical_settlement_batches_run_client_idx ON canonical_settlement_batches(ingest_run_id, client_batch_id);

-- +goose Down
DROP INDEX canonical_settlement_batches_run_client_idx;
DROP TABLE canonical_settlement_batches;
