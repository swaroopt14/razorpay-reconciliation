-- +goose Up
CREATE TABLE batch_contracts (
	batch_id                             TEXT         PRIMARY KEY,
	tenant_id                            TEXT         NOT NULL,
	source_reference                     TEXT,
	total_count                          INT          NOT NULL DEFAULT 0,
	success_count                        INT          NOT NULL DEFAULT 0,
	failed_count                         INT          NOT NULL DEFAULT 0,
	pending_count                        INT          NOT NULL DEFAULT 0,
	reversed_count                       INT          NOT NULL DEFAULT 0,
	partial_recon_count                  INT          NOT NULL DEFAULT 0,
	total_intended_amount_minor          NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_confirmed_amount_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,
	original_settled_amount_minor        NUMERIC(20,2) NOT NULL DEFAULT 0,
	total_variance_minor                 NUMERIC(20,2) NOT NULL DEFAULT 0,
	batch_finality_status                TEXT         NOT NULL DEFAULT 'PROCESSING',
	CHECK (batch_finality_status IN (
		'PROCESSING',
		'FULLY_RECONCILED',
		'PARTIALLY_RECONCILED',
		'FAILED',
		'REQUIRES_REVIEW',
		'CLOSED'
	)),
	ambiguity_score                      NUMERIC(4,3),
	match_confidence                     NUMERIC(4,3),
	defensibility_tier                   TEXT,
	CHECK (defensibility_tier IN ('STRONG', 'GOOD', 'WEAK', 'FRAGILE', NULL)),
	intent_row_count                     INT          NOT NULL DEFAULT 0,
	intent_total_amount_minor            NUMERIC(20,2) NOT NULL DEFAULT 0,
	intent_amount_square_sum             NUMERIC(30,2) NOT NULL DEFAULT 0,
	intent_min_amount_minor              NUMERIC(20,2),
	intent_max_amount_minor              NUMERIC(20,2),
	client_payout_ref_present_count      INT          NOT NULL DEFAULT 0,
	batch_currency                       TEXT,
	batch_source_system                  TEXT,
	batch_rail                           TEXT,
	batch_intent_type                    TEXT,
	batch_provider_key                   TEXT,
	first_intent_created_at              TIMESTAMPTZ,
	under_settlement_amount_minor        NUMERIC(20,2) NOT NULL DEFAULT 0,
	predicted_leakage_rate               NUMERIC(10,6),
	predicted_leakage_minor              NUMERIC(20,2),
	predicted_leakage_model_id           TEXT,
	predicted_at                         TIMESTAMPTZ,
	unmatched_amount_minor               NUMERIC(20,2) NOT NULL DEFAULT 0,
	reversal_exposure_minor              NUMERIC(20,2) NOT NULL DEFAULT 0,
	orphan_amount_minor                  NUMERIC(20,2) NOT NULL DEFAULT 0,
	duplicate_risk_exposure_minor        NUMERIC(20,2) NOT NULL DEFAULT 0,
	missing_ref_count                    INT          NOT NULL DEFAULT 0,
	unexplained_variance_minor           NUMERIC(20,2) NOT NULL DEFAULT 0,
	whitelisted_deduction_minor          NUMERIC(20,2) NOT NULL DEFAULT 0,
	settlement_ref_count                 INT          NOT NULL DEFAULT 0,
	bank_ref_present_count               INT          NOT NULL DEFAULT 0,
	decision_ref_count                   INT          NOT NULL DEFAULT 0,
	client_ref_present_count             INT          NOT NULL DEFAULT 0,
	total_intent_count                   INT          NOT NULL DEFAULT 0,
	matched_intent_count                 INT          NOT NULL DEFAULT 0,
	ambiguous_count                      INT          NOT NULL DEFAULT 0,
	unresolved_intent_count              INT          NOT NULL DEFAULT 0,
	conflicted_count                     INT          NOT NULL DEFAULT 0,
	orphan_observation_count             INT          NOT NULL DEFAULT 0,
	original_intended_amount_minor       NUMERIC(20,2) NOT NULL DEFAULT 0,
	ambiguous_amount_minor               NUMERIC(20,2) NOT NULL DEFAULT 0,
	unresolved_intended_amount_minor     NUMERIC(20,2) NOT NULL DEFAULT 0,
	conflicted_amount_minor              NUMERIC(20,2) NOT NULL DEFAULT 0,
	orphan_observed_amount_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,
	net_batch_delta_minor                NUMERIC(20,2) NOT NULL DEFAULT 0,
	intent_count_coverage                NUMERIC(10,6) NOT NULL DEFAULT 0,
	intent_value_coverage                NUMERIC(10,6) NOT NULL DEFAULT 0,
	observed_count_allocation_coverage   NUMERIC(10,6) NOT NULL DEFAULT 0,
	observed_value_allocation_coverage   NUMERIC(10,6) NOT NULL DEFAULT 0,
	last_updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
	created_at                           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_tenant_updated
	ON batch_contracts (tenant_id, last_updated_at DESC);

CREATE INDEX idx_batch_status
	ON batch_contracts (tenant_id, batch_finality_status)
	WHERE batch_finality_status IN ('REQUIRES_REVIEW', 'PARTIALLY_RECONCILED', 'FAILED');

CREATE INDEX idx_batch_ambiguity
	ON batch_contracts (tenant_id, ambiguity_score DESC)
	WHERE ambiguity_score IS NOT NULL;

CREATE INDEX idx_batch_tenant_amount
	ON batch_contracts (tenant_id, total_intended_amount_minor DESC NULLS LAST);

-- +goose Down
DROP INDEX idx_batch_tenant_amount;
DROP INDEX idx_batch_ambiguity;
DROP INDEX idx_batch_status;
DROP INDEX idx_batch_tenant_updated;
DROP TABLE batch_contracts;
