-- +goose Up
CREATE TABLE canonical_batches (
    tenant_id UUID NOT NULL,
    batch_id TEXT NOT NULL,
    source_system TEXT,
    received_count INT NOT NULL DEFAULT 0,
    canonicalized_count INT NOT NULL DEFAULT 0,
    dlq_count INT NOT NULL DEFAULT 0,
    pending_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    low_matchability_count INT NOT NULL DEFAULT 0,
    low_proof_readiness_count INT NOT NULL DEFAULT 0,
    duplicate_risk_count INT NOT NULL DEFAULT 0,
    canonicalization_success_rate NUMERIC(6,2) DEFAULT 0,
    avg_schema_completeness_score NUMERIC(6,2) DEFAULT 0,
    avg_mapping_confidence_score NUMERIC(6,2) DEFAULT 0,
    avg_matchability_score NUMERIC(6,2) DEFAULT 0,
    avg_proof_readiness_score NUMERIC(6,2) DEFAULT 0,
    avg_intent_quality_score NUMERIC(6,2) DEFAULT 0,
    duplicate_risk_amount_minor BIGINT DEFAULT 0,
    batch_quality_score NUMERIC(6,2) DEFAULT 0,
    score_breakdown_json JSONB DEFAULT '{}',
    total_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, batch_id)
);

CREATE INDEX idx_canonical_batches_lease_id
    ON canonical_batches (lease_id);
CREATE INDEX idx_canonical_batches_pending_lease
    ON canonical_batches (dispatched_at, lease_until);

-- +goose Down
DROP INDEX idx_canonical_batches_pending_lease;
DROP INDEX idx_canonical_batches_lease_id;
DROP TABLE canonical_batches;
