-- +goose Up
CREATE TABLE evidence_outbox_events (
	event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trace_id TEXT,
	envelope_id TEXT,
	tenant_id TEXT NOT NULL,
	contract_id TEXT,
	aggregate_type TEXT NOT NULL DEFAULT 'evidence_pack',
	aggregate_id TEXT NOT NULL,
	event_type TEXT NOT NULL,
	schema_version TEXT DEFAULT 'v1',
	payload JSONB NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING',
	retry_count INT NOT NULL DEFAULT 0,
	next_attempt_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	sent_at TIMESTAMPTZ,
	lease_id UUID,
	leased_by TEXT,
	lease_until TIMESTAMPTZ,
	evidence_pack_id TEXT,
	payload_hash TEXT,
	CONSTRAINT fk_outbox_events_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE SET NULL
);
CREATE INDEX idx_evidence_outbox_pending_lease ON evidence_outbox_events(status, lease_until, created_at);
CREATE INDEX idx_evidence_outbox_lease_id ON evidence_outbox_events(lease_id);
CREATE INDEX idx_evidence_outbox_status ON evidence_outbox_events(status);
CREATE INDEX idx_evidence_outbox_tenant_id ON evidence_outbox_events(tenant_id);
CREATE INDEX idx_evidence_outbox_pack_id ON evidence_outbox_events(evidence_pack_id) WHERE evidence_pack_id IS NOT NULL;

-- +goose Down
DROP INDEX idx_evidence_outbox_pack_id;
DROP INDEX idx_evidence_outbox_tenant_id;
DROP INDEX idx_evidence_outbox_status;
DROP INDEX idx_evidence_outbox_lease_id;
DROP INDEX idx_evidence_outbox_pending_lease;
DROP TABLE evidence_outbox_events;
