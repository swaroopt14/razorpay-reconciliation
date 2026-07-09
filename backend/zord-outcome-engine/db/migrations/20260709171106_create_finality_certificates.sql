-- +goose Up
CREATE TABLE finality_certificates(
	finality_certificate_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	final_state TEXT NOT NULL,
	confidence INT NOT NULL,
	input_hashes JSONB NOT NULL,
	rule_id TEXT NOT NULL,
	signature TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE finality_certificates;
