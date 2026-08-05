-- +goose Up
CREATE TABLE evidence_verification_failures (
	verification_failure_id TEXT PRIMARY KEY,
	verification_run_id TEXT NOT NULL REFERENCES evidence_verification_runs(verification_run_id),
	evidence_pack_id TEXT NOT NULL,
	layer TEXT NOT NULL,
	status TEXT NOT NULL,
	reason TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_verification_failures_run ON evidence_verification_failures(verification_run_id);
CREATE INDEX idx_verification_failures_pack ON evidence_verification_failures(evidence_pack_id, created_at DESC);

-- +goose Down
DROP INDEX idx_verification_failures_pack;
DROP INDEX idx_verification_failures_run;
DROP TABLE evidence_verification_failures;
