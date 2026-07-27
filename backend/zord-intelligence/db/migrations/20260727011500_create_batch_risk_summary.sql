-- +goose Up
CREATE TABLE batch_risk_summary (
	batch_contract_id               UUID         PRIMARY KEY REFERENCES batch_contracts_core(batch_contract_id),
	tenant_id                       TEXT         NOT NULL,
	ambiguity_score                 NUMERIC(4,3),
	defensibility_tier              TEXT,
	CHECK (defensibility_tier IN ('STRONG', 'GOOD', 'WEAK', 'FRAGILE', NULL)),
	unmatched_amount_minor          NUMERIC(20,2) NOT NULL DEFAULT 0,
	reversal_exposure_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,
	orphan_amount_minor             NUMERIC(20,2) NOT NULL DEFAULT 0,
	duplicate_risk_exposure_minor   NUMERIC(20,2) NOT NULL DEFAULT 0,
	missing_ref_count               INT          NOT NULL DEFAULT 0,
	unexplained_variance_minor      NUMERIC(20,2) NOT NULL DEFAULT 0,
	whitelisted_deduction_minor     NUMERIC(20,2) NOT NULL DEFAULT 0,
	settlement_ref_count            INT          NOT NULL DEFAULT 0,
	bank_ref_present_count          INT          NOT NULL DEFAULT 0,
	decision_ref_count              INT          NOT NULL DEFAULT 0,
	client_ref_present_count        INT          NOT NULL DEFAULT 0,
	currency                        CHAR(3)      NOT NULL DEFAULT 'INR',
	short_settled_amount_minor      NUMERIC(20,2),
	projection_source               TEXT NOT NULL DEFAULT 'legacy',
	projection_source_version       TEXT NOT NULL DEFAULT 'legacy',
	projection_version              INT  NOT NULL DEFAULT 1,
	value_hash                      TEXT,
	computed_at                     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE batch_risk_summary;
