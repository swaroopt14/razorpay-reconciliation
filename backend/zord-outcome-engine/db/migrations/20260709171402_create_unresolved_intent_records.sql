-- +goose Up
CREATE TABLE unresolved_intent_records (
	unresolved_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	attachment_job_id UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
	intent_id UUID NOT NULL,
	batch_id TEXT,
	expected_window_end TIMESTAMPTZ,
	reason_code TEXT NOT NULL,
	amount NUMERIC(20,2) NOT NULL,
	currency_code TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX unresolved_intent_records_tenant_idx ON unresolved_intent_records(tenant_id);
CREATE INDEX unresolved_intent_records_job_idx ON unresolved_intent_records(attachment_job_id);
CREATE INDEX unresolved_intent_records_intent_idx ON unresolved_intent_records(intent_id);
CREATE INDEX unresolved_intent_records_batch_idx ON unresolved_intent_records(batch_id) WHERE batch_id IS NOT NULL;

-- +goose Down
DROP INDEX unresolved_intent_records_batch_idx;
DROP INDEX unresolved_intent_records_intent_idx;
DROP INDEX unresolved_intent_records_job_idx;
DROP INDEX unresolved_intent_records_tenant_idx;
DROP TABLE unresolved_intent_records;
