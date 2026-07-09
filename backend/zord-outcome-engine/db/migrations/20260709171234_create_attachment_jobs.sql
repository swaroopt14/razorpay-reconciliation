-- +goose Up
CREATE TABLE attachment_jobs (
	attachment_job_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	job_scope_type TEXT NOT NULL,
	scope_ref TEXT NOT NULL,
	matching_ruleset_version TEXT NOT NULL,
	status TEXT NOT NULL,
	candidate_count_total INT NOT NULL DEFAULT 0,
	exact_match_count INT NOT NULL DEFAULT 0,
	high_confidence_count INT NOT NULL DEFAULT 0,
	ambiguous_count INT NOT NULL DEFAULT 0,
	unresolved_count INT NOT NULL DEFAULT 0,
	conflicted_count INT NOT NULL DEFAULT 0,
	started_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	stale_after TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX attachment_jobs_tenant_idx ON attachment_jobs(tenant_id);
CREATE INDEX attachment_jobs_status_idx ON attachment_jobs(status);
CREATE INDEX attachment_jobs_stale_idx ON attachment_jobs(status, stale_after) WHERE status = 'RUNNING';

-- +goose Down
DROP INDEX attachment_jobs_stale_idx;
DROP INDEX attachment_jobs_status_idx;
DROP INDEX attachment_jobs_tenant_idx;
DROP TABLE attachment_jobs;
