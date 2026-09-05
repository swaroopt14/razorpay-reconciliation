-- +goose Up
CREATE TABLE variance_records (
	variance_record_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	attachment_decision_id UUID NOT NULL REFERENCES attachment_decisions(attachment_decision_id),
	intent_id UUID NOT NULL,
	settlement_observation_id UUID NOT NULL,
	amount_variance NUMERIC(20,2) NOT NULL DEFAULT 0,
	deduction_variance NUMERIC(20,2),
	fee_variance NUMERIC(20,2),
	currency_match_flag BOOLEAN NOT NULL DEFAULT TRUE,
	status_variance_flag BOOLEAN NOT NULL DEFAULT FALSE,
	value_date_mismatch_flag BOOLEAN NOT NULL DEFAULT FALSE,
	settlement_delay_days INT NOT NULL DEFAULT 0,
	cross_period_flag BOOLEAN NOT NULL DEFAULT FALSE,
	provider_ref_missing_flag BOOLEAN NOT NULL DEFAULT FALSE,
	bank_ref_missing_flag BOOLEAN NOT NULL DEFAULT FALSE,
	evidence_gap_flag BOOLEAN NOT NULL DEFAULT FALSE,
	variance_type TEXT NOT NULL DEFAULT 'NO_VARIANCE',
	variance_severity TEXT NOT NULL,
	variance_reason_codes_json JSONB,
	is_whitelisted BOOLEAN NOT NULL DEFAULT FALSE,
	whitelist_policy_id TEXT,
	whitelist_policy_version TEXT,
	whitelist_reason_code TEXT,
	whitelist_explanation TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX variance_records_decision_idx ON variance_records(attachment_decision_id);
CREATE INDEX variance_records_intent_idx ON variance_records(intent_id);
CREATE INDEX variance_records_severity_idx ON variance_records(variance_severity);
CREATE INDEX variance_records_whitelisted_idx ON variance_records(is_whitelisted);

-- +goose Down
DROP INDEX variance_records_whitelisted_idx;
DROP INDEX variance_records_severity_idx;
DROP INDEX variance_records_intent_idx;
DROP INDEX variance_records_decision_idx;
DROP TABLE variance_records;
