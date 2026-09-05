-- +goose Up
CREATE TABLE batch_closure_summary (
	batch_contract_id UUID         PRIMARY KEY REFERENCES batch_contracts_core(batch_contract_id),
	tenant_id         TEXT         NOT NULL,
	computed_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE batch_closure_summary;
