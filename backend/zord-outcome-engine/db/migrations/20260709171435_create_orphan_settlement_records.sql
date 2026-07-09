-- +goose Up
CREATE TABLE orphan_settlement_records (
	orphan_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	attachment_job_id UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
	settlement_observation_id UUID NOT NULL,
	batch_id TEXT,
	unresolved_reason TEXT NOT NULL,
	amount NUMERIC(20,2) NOT NULL,
	currency_code TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX orphan_settlement_records_tenant_idx ON orphan_settlement_records(tenant_id);
CREATE INDEX orphan_settlement_records_job_idx ON orphan_settlement_records(attachment_job_id);
CREATE INDEX orphan_settlement_records_obs_idx ON orphan_settlement_records(settlement_observation_id);
CREATE INDEX orphan_settlement_records_batch_idx ON orphan_settlement_records(batch_id) WHERE batch_id IS NOT NULL;

-- +goose Down
DROP INDEX orphan_settlement_records_batch_idx;
DROP INDEX orphan_settlement_records_obs_idx;
DROP INDEX orphan_settlement_records_job_idx;
DROP INDEX orphan_settlement_records_tenant_idx;
DROP TABLE orphan_settlement_records;
