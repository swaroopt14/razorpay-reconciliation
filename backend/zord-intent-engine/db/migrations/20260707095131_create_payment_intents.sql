-- +goose Up
CREATE TABLE payment_intents (
    intent_id UUID PRIMARY KEY,
    trace_id UUID NOT NULL,
    envelope_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    idempotency_key TEXT,
    salient_hash TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    intent_type TEXT NOT NULL,
    canonical_version TEXT NOT NULL,
    schema_version TEXT,
    amount NUMERIC NOT NULL,
    currency CHAR(3) NOT NULL,
    intended_execution_at TIMESTAMPTZ,
    constraints JSONB,
    beneficiary_type TEXT,
    pii_tokens JSONB,
    beneficiary JSONB,
    status TEXT NOT NULL,
    confidence_score NUMERIC(5,2),
    canonical_hash TEXT NOT NULL,
    canonical_snapshot_ref TEXT NOT NULL,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,
    governance_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_payout_ref TEXT,
    provider_hint TEXT,
    request_fingerprint TEXT,
    routing_hints_json JSONB,
    governance_state TEXT NOT NULL DEFAULT 'VALID',
    business_state TEXT,
    duplicate_risk_flag BOOLEAN,
    mapping_profile_id TEXT,
    mapping_profile_version TEXT,
    source_system TEXT,
    business_idempotency_key TEXT,
    beneficiary_fingerprint TEXT,
    proof_readiness_score NUMERIC(5,2),
    matchability_score NUMERIC(5,2),
    intent_quality_score NUMERIC(5,2),
    mapping_confidence_score NUMERIC(5,2),
    schema_completeness_score NUMERIC(5,2),
    governance_reason_codes_json JSONB NOT NULL DEFAULT '{}',
    duplicate_reason_code TEXT,
    client_batch_ref TEXT,
    required_fields_status BOOLEAN,
    tokenization_status BOOLEAN,
    governance_decision TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    batchid TEXT,
    source_row_num INT,
    aggregate_confidence_score NUMERIC(5,2),
    reference_quality_score NUMERIC(6,2),
    duplicate_risk_score NUMERIC(6,2),
    score_version TEXT DEFAULT 'service2_score_v2.0',
    score_validity_status TEXT DEFAULT 'NOT_SCORED',
    score_breakdown_json JSONB DEFAULT '{}',
    score_reason_codes_json JSONB DEFAULT '[]',
    scored_at TIMESTAMPTZ,
    payment_instruction_received TIMESTAMPTZ,
    canonical_intent_created TIMESTAMPTZ
);

CREATE INDEX idx_payment_intents_tenant_envelope
    ON payment_intents (tenant_id, envelope_id);
CREATE INDEX idx_payment_intents_business_idempotency_key
    ON payment_intents (tenant_id, business_idempotency_key);
CREATE INDEX idx_payment_intents_batchid
    ON payment_intents (batchid) WHERE batchid IS NOT NULL;
CREATE INDEX idx_pi_tenant_canonical_created
    ON payment_intents (tenant_id, created_at DESC)
    WHERE canonical_hash IS NOT NULL AND canonical_hash <> '';

-- +goose Down
DROP INDEX idx_pi_tenant_canonical_created;
DROP INDEX idx_payment_intents_batchid;
DROP INDEX idx_payment_intents_business_idempotency_key;
DROP INDEX idx_payment_intents_tenant_envelope;
DROP TABLE payment_intents;
