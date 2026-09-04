-- +goose Up
CREATE TABLE evidence_replay_jobs (
	replay_job_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL,
	source_evidence_pack_id TEXT NOT NULL,
	intent_id TEXT,
	contract_id TEXT,
	ruleset_version TEXT NOT NULL,
	mapping_versions_json JSONB,
	requested_by TEXT,
	status TEXT NOT NULL DEFAULT 'PENDING',
	new_evidence_pack_id TEXT,
	equivalence_result TEXT,
	difference_summary_json JSONB,
	failure_reason TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_at TIMESTAMPTZ,
	CONSTRAINT fk_replay_jobs_source_pack FOREIGN KEY (source_evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE RESTRICT
);
CREATE INDEX evidence_replay_jobs_tenant_idx ON evidence_replay_jobs(tenant_id, source_evidence_pack_id);
CREATE INDEX evidence_replay_jobs_status_idx ON evidence_replay_jobs(status);

-- +goose Down
DROP INDEX evidence_replay_jobs_status_idx;
DROP INDEX evidence_replay_jobs_tenant_idx;
DROP TABLE evidence_replay_jobs;
