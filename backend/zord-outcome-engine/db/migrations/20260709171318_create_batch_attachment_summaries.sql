-- +goose Up
CREATE TABLE batch_attachment_summaries (
	batch_attachment_summary_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	batch_id TEXT,
	source_reference TEXT NOT NULL,
	attachment_job_id UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
	total_intent_count INT NOT NULL DEFAULT 0,
	total_observation_count INT NOT NULL DEFAULT 0,
	matched_intent_count INT NOT NULL DEFAULT 0,
	matched_observation_count INT NOT NULL DEFAULT 0,
	exact_match_count INT NOT NULL DEFAULT 0,
	high_confidence_count INT NOT NULL DEFAULT 0,
	ambiguous_count INT NOT NULL DEFAULT 0,
	unresolved_count INT NOT NULL DEFAULT 0,
	conflicted_count INT NOT NULL DEFAULT 0,
	orphan_observation_count INT NOT NULL DEFAULT 0,
	original_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	original_settled_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_variance NUMERIC(20,2) NOT NULL DEFAULT 0,
	matched_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	matched_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	orphan_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	matched_pair_variance NUMERIC(20,2) NOT NULL DEFAULT 0,
	net_batch_delta NUMERIC(20,2) NOT NULL DEFAULT 0,
	unresolved_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	ambiguous_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	conflicted_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	ambiguous_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	conflicted_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	unresolved_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_fee_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_deduction_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
	net_unexplained_variance NUMERIC(20,2) NOT NULL DEFAULT 0,
	intent_count_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,
	intent_value_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,
	observed_count_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,
	observed_value_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,
	batch_attachment_status TEXT NOT NULL,
	avg_matched_attachment_quality NUMERIC(10,4) NOT NULL DEFAULT 0,
	avg_matched_attachment_ambiguity NUMERIC(10,4) NOT NULL DEFAULT 0,
	avg_matched_attachment_confidence NUMERIC(10,4) NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX batch_attachment_summaries_tenant_idx ON batch_attachment_summaries(tenant_id);
CREATE INDEX batch_attachment_summaries_job_idx ON batch_attachment_summaries(attachment_job_id);

-- +goose Down
DROP INDEX batch_attachment_summaries_job_idx;
DROP INDEX batch_attachment_summaries_tenant_idx;
DROP TABLE batch_attachment_summaries;
