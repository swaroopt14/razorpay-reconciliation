-- +goose Up
CREATE TABLE pending_leaf_candidates (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id TEXT NOT NULL,
	intent_id TEXT,
	envelope_id TEXT,
	contract_id TEXT,
	batch_id TEXT,
	leaf_type TEXT NOT NULL,
	item_ref TEXT,
	hash TEXT NOT NULL,
	schema_version TEXT NOT NULL DEFAULT 'v1',
	source_topic TEXT NOT NULL,
	client_payout_ref TEXT,
	amount NUMERIC,
	currency TEXT,
	payment_instruction_received TIMESTAMPTZ,
	canonical_intent_created TIMESTAMPTZ,
	mapping_profile_used TEXT,
	required_fields_status BOOLEAN,
	tokenization_status BOOLEAN,
	governance_decision TEXT,
	settlement_record_received TIMESTAMPTZ,
	canonical_settlement_created TIMESTAMPTZ,
	bank_reference TEXT,
	client_reference TEXT,
	attachment_decision TEXT,
	match_confidence DOUBLE PRECISION,
	value_date_check BOOLEAN,
	amount_match BOOLEAN,
	source_event_id TEXT NOT NULL DEFAULT '',
	artifact_id TEXT,
	artifact_version_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX plc_intent_type_idx ON pending_leaf_candidates(tenant_id, intent_id, leaf_type) WHERE intent_id IS NOT NULL;
CREATE UNIQUE INDEX plc_envelope_type_idx ON pending_leaf_candidates(tenant_id, envelope_id, leaf_type) WHERE intent_id IS NULL AND batch_id IS NULL;
CREATE UNIQUE INDEX plc_batch_type_idx ON pending_leaf_candidates(tenant_id, batch_id, leaf_type) WHERE batch_id IS NOT NULL AND intent_id IS NULL;

-- +goose Down
DROP INDEX plc_batch_type_idx;
DROP INDEX plc_envelope_type_idx;
DROP INDEX plc_intent_type_idx;
DROP TABLE pending_leaf_candidates;
