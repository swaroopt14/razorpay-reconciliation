-- +goose Up
CREATE TABLE IF NOT EXISTS finance_evidence (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_reference TEXT NOT NULL DEFAULT '',
    source_hash TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    role TEXT NOT NULL,
    authority TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_evidence_identity_uidx
    ON finance_evidence (tenant_id, source_type, source_id, source_hash);

CREATE INDEX IF NOT EXISTS finance_evidence_entity_idx
    ON finance_evidence (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS finance_evidence_snapshots (
    id TEXT PRIMARY KEY,
    evidence_id TEXT NOT NULL REFERENCES finance_evidence(id),
    schema_version TEXT NOT NULL DEFAULT 'v1',
    snapshot JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_evidence_snapshots_evidence_uidx
    ON finance_evidence_snapshots (evidence_id);

CREATE TABLE IF NOT EXISTS finance_evidence_links (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    related_evidence_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_calculation_traces (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    formula TEXT NOT NULL,
    inputs JSONB NOT NULL,
    output BIGINT NOT NULL,
    actual BIGINT NOT NULL DEFAULT 0,
    variance BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    precision TEXT NOT NULL DEFAULT 'minor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_calculation_traces_entity_idx
    ON finance_calculation_traces (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS finance_decision_traces (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    decision_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    selected_candidate TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_decision_traces_entity_idx
    ON finance_decision_traces (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS finance_investigation_evidence (
    investigation_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (investigation_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS finance_audit_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    evidence_ids TEXT[] NOT NULL DEFAULT '{}',
    request_id TEXT NOT NULL DEFAULT '',
    correlation_id TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_audit_events_entity_idx
    ON finance_audit_events (tenant_id, entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS finance_evidence_packs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    investigation_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    document JSONB NOT NULL,
    pack_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_evidence_packs_investigation_uidx
    ON finance_evidence_packs (tenant_id, investigation_id);

-- +goose Down
DROP TABLE IF EXISTS finance_evidence_packs;
DROP TABLE IF EXISTS finance_audit_events;
DROP TABLE IF EXISTS finance_investigation_evidence;
DROP TABLE IF EXISTS finance_decision_traces;
DROP TABLE IF EXISTS finance_calculation_traces;
DROP TABLE IF EXISTS finance_evidence_links;
DROP TABLE IF EXISTS finance_evidence_snapshots;
DROP TABLE IF EXISTS finance_evidence;
