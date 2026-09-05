-- +goose Up
CREATE TABLE evidence_packs (
	evidence_pack_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL,
	intent_id TEXT,
	contract_id TEXT,
	batch_id TEXT,
	client_payout_ref TEXT,
	amount NUMERIC,
	currency TEXT,
	mode TEXT NOT NULL,
	pack_status TEXT NOT NULL DEFAULT 'ACTIVE',
	merkle_root TEXT NOT NULL,
	ruleset_version TEXT NOT NULL,
	schema_versions_json JSONB,
	signature_alg TEXT NOT NULL,
	signature_value TEXT NOT NULL,
	object_ref TEXT NOT NULL,
	supersedes_pack_id TEXT,
	replay_equivalence_status TEXT,
	replay_notes TEXT,
	pack_completeness_score DOUBLE PRECISION NOT NULL DEFAULT 0,
	leaf_count INT NOT NULL DEFAULT 0,
	required_leaf_count INT NOT NULL DEFAULT 0,
	settlement_leaf_present_flag BOOLEAN NOT NULL DEFAULT FALSE,
	attachment_decision_leaf_present_flag BOOLEAN NOT NULL DEFAULT FALSE,
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
	proof_status TEXT NOT NULL DEFAULT 'DRAFT',
	proof_score INT NOT NULL DEFAULT 0,
	generated_by TEXT NOT NULL DEFAULT 'system',
	last_verified_at TIMESTAMPTZ,
	verification_status BOOLEAN NOT NULL DEFAULT FALSE,
	export_count INT NOT NULL DEFAULT 0,
	proof_components_json JSONB,
	cryptographic_signatures_json JSONB,
	proof_score_breakdown_json JSONB,
	zord_signature TEXT,
	merkle_scheme_version TEXT NOT NULL DEFAULT 'merkle_v1',
	artifact_id TEXT,
	artifact_version_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX evidence_packs_tenant_contract_idx ON evidence_packs(tenant_id, contract_id);
CREATE INDEX evidence_packs_tenant_intent_idx ON evidence_packs(tenant_id, intent_id);
CREATE INDEX evidence_packs_tenant_batch_idx ON evidence_packs(tenant_id, batch_id);
CREATE UNIQUE INDEX evidence_packs_batch_unique_idx ON evidence_packs(tenant_id, batch_id) WHERE intent_id IS NULL AND batch_id IS NOT NULL AND pack_status = 'ACTIVE';
CREATE INDEX evidence_packs_proof_status_idx ON evidence_packs(proof_status);
CREATE UNIQUE INDEX evidence_packs_active_intent_unique_idx ON evidence_packs(tenant_id, intent_id) WHERE pack_status = 'ACTIVE' AND intent_id IS NOT NULL;

-- +goose Down
DROP INDEX evidence_packs_active_intent_unique_idx;
DROP INDEX evidence_packs_proof_status_idx;
DROP INDEX evidence_packs_batch_unique_idx;
DROP INDEX evidence_packs_tenant_batch_idx;
DROP INDEX evidence_packs_tenant_intent_idx;
DROP INDEX evidence_packs_tenant_contract_idx;
DROP TABLE evidence_packs;
