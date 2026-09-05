-- +goose Up
CREATE TABLE recon_match_decisions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    left_source TEXT NOT NULL,
    left_id TEXT NOT NULL,
    right_source TEXT NOT NULL,
    right_id TEXT NOT NULL,
    match_type TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    decision_reason TEXT NOT NULL DEFAULT '',
    rule_version TEXT NOT NULL DEFAULT 'recon_rules_v1',
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recon_match_decisions_subject_idx
    ON recon_match_decisions (tenant_id, connector_id, subject_id, computed_at DESC);

-- +goose Down
DROP INDEX IF EXISTS recon_match_decisions_subject_idx;
DROP TABLE IF EXISTS recon_match_decisions;
