-- +goose Up
CREATE TABLE evidence_verification_runs (
	verification_run_id TEXT PRIMARY KEY,
	evidence_pack_id TEXT NOT NULL REFERENCES evidence_packs(evidence_pack_id),
	tenant_id TEXT NOT NULL,
	overall_status TEXT NOT NULL,
	db_merkle_status TEXT NOT NULL,
	archive_status TEXT NOT NULL,
	signature_status TEXT NOT NULL,
	stored_root TEXT,
	computed_root TEXT,
	explanation TEXT,
	checked_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_verification_runs_pack ON evidence_verification_runs(evidence_pack_id, checked_at DESC);
CREATE INDEX idx_verification_runs_tenant ON evidence_verification_runs(tenant_id, checked_at DESC);

-- +goose Down
DROP INDEX idx_verification_runs_tenant;
DROP INDEX idx_verification_runs_pack;
DROP TABLE evidence_verification_runs;
