-- +goose Up
CREATE TABLE evidence_export_log (
	export_id TEXT PRIMARY KEY,
	evidence_pack_id TEXT NOT NULL,
	tenant_id TEXT NOT NULL,
	intent_id TEXT,
	payment_reference TEXT,
	export_type TEXT NOT NULL,
	dispute_reason TEXT,
	requested_by TEXT,
	exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	file_hash TEXT,
	CONSTRAINT fk_export_log_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE RESTRICT
);
CREATE INDEX export_log_pack_idx ON evidence_export_log(evidence_pack_id);
CREATE INDEX export_log_tenant_idx ON evidence_export_log(tenant_id, exported_at DESC);

-- +goose Down
DROP INDEX export_log_tenant_idx;
DROP INDEX export_log_pack_idx;
DROP TABLE evidence_export_log;
