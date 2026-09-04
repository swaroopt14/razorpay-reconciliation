-- +goose Up
CREATE TABLE outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID NOT NULL,
    envelope_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ,
    aggregate_type TEXT NOT NULL DEFAULT 'intent',
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    schema_version TEXT,
    amount NUMERIC,
    currency CHAR(3),
    idempotency_key TEXT,
    salient_hash TEXT,
    intent_type TEXT,
    canonical_version TEXT,
    intended_execution_at TIMESTAMPTZ,
    constraints JSONB,
    beneficiary_type TEXT,
    pii_tokens JSONB,
    beneficiary JSONB,
    intent_status TEXT,
    confidence_score NUMERIC(5,2),
    canonical_hash TEXT,
    canonical_snapshot_ref TEXT,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,
    governance_hash TEXT,
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
    payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    batchid TEXT,
    source_row_num INT,
    aggregate_confidence_score NUMERIC(5,2),
    required_fields_status BOOLEAN,
    tokenization_status BOOLEAN,
    governance_decision TEXT,
    reference_quality_score NUMERIC(6,2),
    duplicate_risk_score NUMERIC(6,2),
    score_version TEXT DEFAULT 'service2_score_v2.0',
    score_validity_status TEXT DEFAULT 'NOT_SCORED',
    score_breakdown_json JSONB DEFAULT '{}',
    score_reason_codes_json JSONB DEFAULT '[]',
    scored_at TIMESTAMPTZ,
    batch_quality_score NUMERIC(6,2),
    avg_reference_quality NUMERIC(6,2),
    avg_duplicate_risk NUMERIC(6,2),
    low_matchability_count INT DEFAULT 0,
    duplicate_risk_count INT DEFAULT 0,
    payment_instruction_received TIMESTAMPTZ,
    canonical_intent_created TIMESTAMPTZ,
    CONSTRAINT fk_outbox_intent
        FOREIGN KEY (aggregate_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_outbox_status
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    CONSTRAINT chk_outbox_aggregate_type
        CHECK (aggregate_type = 'intent')
);

CREATE INDEX idx_outbox_pending_lease
    ON outbox (status, lease_until, created_at);
CREATE INDEX idx_outbox_lease_id
    ON outbox (lease_id);

-- +goose Down
DROP INDEX idx_outbox_lease_id;
DROP INDEX idx_outbox_pending_lease;
DROP TABLE outbox;
