-- +goose Up
CREATE TABLE fused_outcomes(
	contract_id UUID PRIMARY KEY,
	current_state TEXT NOT NULL,
	finality_certificate_id UUID,
	final_state TEXT,
	finality_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	finality_basis TEXT,
	rule_version TEXT NOT NULL,
	divergence_flags JSONB,
	last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE fused_outcomes;
