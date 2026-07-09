-- +goose Up
CREATE TABLE attachment_decisions (
	attachment_decision_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	settlement_observation_id UUID,
	intent_id UUID,
	attachment_job_id UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
	decision_type TEXT NOT NULL,
	decision_reason_code TEXT NOT NULL,
	decision_reason_detail_json JSONB,
	matching_ruleset_version TEXT NOT NULL,
	winning_score NUMERIC(8,4) NOT NULL DEFAULT 0,
	runner_up_score NUMERIC(8,4),
	score_margin NUMERIC(8,4),
	relative_score_margin NUMERIC(8,4),
	confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	ambiguity_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	match_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	supporting_carriers_json JSONB,
	candidate_set_hash TEXT NOT NULL,
	candidate_set_snapshot_ref TEXT,
	candidate_set_size INT NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX attachment_decisions_intent_uq ON attachment_decisions(intent_id, attachment_job_id);
CREATE UNIQUE INDEX attachment_decisions_observation_job_uq ON attachment_decisions(settlement_observation_id, attachment_job_id) WHERE settlement_observation_id IS NOT NULL;
CREATE INDEX attachment_decisions_observation_idx ON attachment_decisions(settlement_observation_id) WHERE settlement_observation_id IS NOT NULL;
CREATE INDEX attachment_decisions_intent_idx ON attachment_decisions(intent_id) WHERE intent_id IS NOT NULL;
CREATE INDEX attachment_decisions_type_idx ON attachment_decisions(decision_type);
CREATE INDEX attachment_decisions_obs_tenant_strong_match_idx ON attachment_decisions(tenant_id, settlement_observation_id) WHERE settlement_observation_id IS NOT NULL AND decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE');

-- +goose Down
DROP INDEX attachment_decisions_obs_tenant_strong_match_idx;
DROP INDEX attachment_decisions_type_idx;
DROP INDEX attachment_decisions_intent_idx;
DROP INDEX attachment_decisions_observation_idx;
DROP INDEX attachment_decisions_observation_job_uq;
DROP INDEX attachment_decisions_intent_uq;
DROP TABLE attachment_decisions;
