-- +goose Up
CREATE TABLE attachment_candidates (
	candidate_id UUID PRIMARY KEY,
	attachment_job_id UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
	tenant_id UUID NOT NULL,
	settlement_observation_id UUID NOT NULL,
	intent_id UUID NOT NULL,
	candidate_rank INT NOT NULL DEFAULT 0,
	exact_ref_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	client_ref_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	provider_ref_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	bank_ref_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	batch_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	amount_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	currency_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	time_window_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	source_system_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	zord_signature_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	composite_match_flag BOOLEAN NOT NULL DEFAULT FALSE,
	score_total NUMERIC(8,4) NOT NULL DEFAULT 0,
	score_breakdown_json JSONB NOT NULL,
	confidence_bucket TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX attachment_candidates_observation_idx ON attachment_candidates(settlement_observation_id);
CREATE INDEX attachment_candidates_intent_idx ON attachment_candidates(intent_id);
CREATE INDEX attachment_candidates_job_idx ON attachment_candidates(attachment_job_id);

-- +goose Down
DROP INDEX attachment_candidates_job_idx;
DROP INDEX attachment_candidates_intent_idx;
DROP INDEX attachment_candidates_observation_idx;
DROP TABLE attachment_candidates;
