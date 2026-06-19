-- Evidence Packs — full schema matching evidence_repo.go
CREATE TABLE IF NOT EXISTS evidence_packs (
    evidence_pack_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    intent_id TEXT,
    contract_id TEXT,
    batch_id TEXT,
    client_payout_ref TEXT,
    amount NUMERIC(20,2),
    currency TEXT,
    mode TEXT,
    pack_status TEXT DEFAULT 'ACTIVE',
    merkle_root TEXT,
    ruleset_version TEXT,
    schema_versions_json JSONB,
    signature_alg TEXT,
    signature_value TEXT,
    object_ref TEXT,
    supersedes_pack_id TEXT,
    pack_completeness_score NUMERIC(5,4),
    leaf_count INT DEFAULT 0,
    required_leaf_count INT DEFAULT 0,
    settlement_leaf_present_flag BOOLEAN DEFAULT false,
    attachment_decision_leaf_present_flag BOOLEAN DEFAULT false,
    payment_instruction_received TIMESTAMPTZ,
    canonical_intent_created TIMESTAMPTZ,
    mapping_profile_used TEXT,
    required_fields_status TEXT,
    tokenization_status TEXT,
    governance_decision TEXT,
    settlement_record_received TIMESTAMPTZ,
    canonical_settlement_created TIMESTAMPTZ,
    bank_reference TEXT,
    client_reference TEXT,
    attachment_decision TEXT,
    match_confidence NUMERIC(5,4),
    value_date_check BOOLEAN,
    amount_match BOOLEAN,
    zord_signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_packs_tenant_contract_idx ON evidence_packs(tenant_id, contract_id);
CREATE INDEX IF NOT EXISTS evidence_packs_tenant_intent_idx ON evidence_packs(tenant_id, intent_id);
CREATE INDEX IF NOT EXISTS evidence_packs_batch_idx ON evidence_packs(tenant_id, batch_id);

-- Evidence Items
CREATE TABLE IF NOT EXISTS evidence_items (
    evidence_pack_id UUID NOT NULL,
    position_index INT NOT NULL,
    item_type TEXT NOT NULL,
    item_ref TEXT NOT NULL,
    item_hash TEXT,
    leaf_hash TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    PRIMARY KEY(evidence_pack_id, position_index)
);

CREATE INDEX IF NOT EXISTS evidence_items_pack_idx ON evidence_items(evidence_pack_id);

-- Evidence Signatures
CREATE TABLE IF NOT EXISTS evidence_signatures (
    evidence_pack_id UUID NOT NULL,
    signer TEXT NOT NULL,
    alg TEXT NOT NULL,
    signature TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(evidence_pack_id, signer, alg)
);

-- Evidence Outbox Events (for relay polling)
CREATE TABLE IF NOT EXISTS evidence_outbox_events (
    id SERIAL PRIMARY KEY,
    trace_id TEXT,
    envelope_id TEXT,
    tenant_id TEXT NOT NULL,
    contract_id TEXT,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence Archives (§14.3)
CREATE TABLE IF NOT EXISTS evidence_archives (
    archive_id UUID PRIMARY KEY,
    evidence_pack_id UUID NOT NULL,
    tenant_id TEXT NOT NULL,
    object_ref TEXT NOT NULL,
    encryption_key_id TEXT,
    archive_hash TEXT NOT NULL,
    archive_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merkle Inclusion Proofs (§14.4)
CREATE TABLE IF NOT EXISTS merkle_inclusion_proofs (
    evidence_pack_id UUID NOT NULL,
    leaf_hash TEXT NOT NULL,
    proof_path_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(evidence_pack_id, leaf_hash)
);

-- Evidence Replay Jobs (§14.5)
CREATE TABLE IF NOT EXISTS evidence_replay_jobs (
    replay_job_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source_evidence_pack_id UUID NOT NULL,
    intent_id TEXT,
    contract_id TEXT,
    ruleset_version TEXT NOT NULL,
    mapping_versions_json JSONB,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    new_evidence_pack_id UUID,
    equivalence_result TEXT,
    difference_summary_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
