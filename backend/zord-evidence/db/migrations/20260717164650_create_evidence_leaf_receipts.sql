-- +goose Up
CREATE TABLE evidence_leaf_receipts (
	receipt_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	tenant_id TEXT NOT NULL,
	scope_type TEXT NOT NULL,
	scope_ref TEXT NOT NULL,
	leaf_type TEXT NOT NULL,
	leaf_hash TEXT NOT NULL,
	source_topic TEXT NOT NULL,
	source_event_id TEXT,
	amount_minor NUMERIC(20,2),
	currency TEXT,
	client_reference TEXT,
	bank_reference TEXT,
	receipt_status TEXT NOT NULL,
	discard_reason TEXT,
	received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_leaf_receipts_dedup_v3 ON evidence_leaf_receipts(source_event_id, tenant_id, leaf_type, scope_type, scope_ref);
CREATE INDEX idx_leaf_receipts_scope ON evidence_leaf_receipts(tenant_id, scope_type, scope_ref);
CREATE INDEX idx_leaf_receipts_conflicts ON evidence_leaf_receipts(tenant_id, scope_type, scope_ref, receipt_status) WHERE receipt_status = 'CONFLICT';

-- +goose Down
DROP INDEX idx_leaf_receipts_conflicts;
DROP INDEX idx_leaf_receipts_scope;
DROP INDEX idx_leaf_receipts_dedup_v3;
DROP TABLE evidence_leaf_receipts;
