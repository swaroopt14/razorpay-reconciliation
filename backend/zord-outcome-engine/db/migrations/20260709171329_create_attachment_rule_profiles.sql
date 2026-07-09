-- +goose Up
CREATE TABLE attachment_rule_profiles (
	profile_id TEXT NOT NULL,
	tenant_id UUID NOT NULL,
	version TEXT NOT NULL,
	exact_ref_priority_json JSONB,
	carrier_priority_json JSONB,
	time_window_policy_json JSONB,
	amount_tolerance_policy_json JSONB,
	batch_boundary_policy_json JSONB,
	manual_review_thresholds_json JSONB,
	ambiguity_margin_threshold NUMERIC(10,2) NOT NULL DEFAULT 0.15,
	requires_bank_ref_for_exact_flag BOOLEAN NOT NULL DEFAULT FALSE,
	status TEXT NOT NULL DEFAULT 'ACTIVE',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (profile_id, tenant_id, version)
);

-- +goose Down
DROP TABLE attachment_rule_profiles;
