-- Phase 2 refactor: batch identity + summary split.
--
-- PROBLEM (verified live): batch_contracts.batch_id TEXT PRIMARY KEY is only
-- the client's own source-system batch label (e.g. "ak12") — NOT tenant-scoped.
-- Two different tenants choosing the same label silently merge/overwrite each
-- other's row via "ON CONFLICT (batch_id) DO UPDATE" in ~19 write methods.
--
-- FIX: a real, DB-enforced identity — UNIQUE(tenant_id, external_batch_id) —
-- plus splitting the 60+ column monolith into focused summary tables.
--
-- ROLLOUT: additive only. batch_contracts is UNTOUCHED by this migration and
-- keeps being written/read exactly as before. These tables are dual-written
-- alongside it (see batch_contract_repo.go) and are NOT yet read by any API
-- handler. Read cutover is gated behind Phase 4's automated shadow-diff job.
-- See REFACTOR_IMPLEMENTATION_GUIDE.md §I for the full spec and locked decisions.

CREATE TABLE IF NOT EXISTS batch_contracts_core (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT         NOT NULL,
    external_batch_id   TEXT         NOT NULL,
    -- The client's own source-system batch label. Today's "batch_id".

    source_reference    TEXT,
    -- File path or source system reference. NULL for API-submitted batches.

    currency            CHAR(3)      NOT NULL DEFAULT 'INR',
    -- Locked decision: INR only for now; one-currency-per-batch enforced at
    -- the application layer (batch_contract_repo.go), not by a CHECK here,
    -- since a future multi-currency phase would need to relax this without
    -- a schema change.

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, external_batch_id)
    -- The actual fix: the database now refuses to let two tenants collide.
);

CREATE INDEX IF NOT EXISTS idx_batch_contracts_core_tenant
    ON batch_contracts_core (tenant_id, created_at DESC);

-- ── Reconciliation summary ──────────────────────────────────────────────────
-- Operational counts, monetary totals, attachment-completeness coverage, and
-- the intent-time ML feature / leakage-prediction columns (decision I-Q1:
-- folded in here rather than a 5th table).
CREATE TABLE IF NOT EXISTS batch_reconciliation_summary (
    batch_uuid                  UUID         PRIMARY KEY REFERENCES batch_contracts_core(id),

    total_count                 INT          NOT NULL DEFAULT 0,
    success_count                INT          NOT NULL DEFAULT 0,
    failed_count                 INT          NOT NULL DEFAULT 0,
    pending_count                INT          NOT NULL DEFAULT 0,
    reversed_count               INT          NOT NULL DEFAULT 0,
    partial_recon_count          INT          NOT NULL DEFAULT 0,

    total_intended_amount_minor  NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_confirmed_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    original_settled_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_variance_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,

    batch_finality_status        TEXT         NOT NULL DEFAULT 'PROCESSING',
    CHECK (batch_finality_status IN (
        'PROCESSING', 'FULLY_RECONCILED', 'PARTIALLY_RECONCILED',
        'FAILED', 'REQUIRES_REVIEW', 'CLOSED'
    )),

    match_confidence              NUMERIC(4,3),

    -- ── Attachment completeness snapshot ───────────────────────────────────
    total_intent_count                 INT          NOT NULL DEFAULT 0,
    matched_intent_count               INT          NOT NULL DEFAULT 0,
    ambiguous_count                    INT          NOT NULL DEFAULT 0,
    unresolved_intent_count            INT          NOT NULL DEFAULT 0,
    conflicted_count                   INT          NOT NULL DEFAULT 0,
    orphan_observation_count           INT          NOT NULL DEFAULT 0,
    original_intended_amount_minor     NUMERIC(20,2) NOT NULL DEFAULT 0,
    ambiguous_amount_minor             NUMERIC(20,2) NOT NULL DEFAULT 0,
    unresolved_intended_amount_minor   NUMERIC(20,2) NOT NULL DEFAULT 0,
    conflicted_amount_minor            NUMERIC(20,2) NOT NULL DEFAULT 0,
    orphan_observed_amount_minor       NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_batch_delta_minor              NUMERIC(20,2) NOT NULL DEFAULT 0,
    intent_count_coverage              NUMERIC(10,6) NOT NULL DEFAULT 0,
    intent_value_coverage              NUMERIC(10,6) NOT NULL DEFAULT 0,
    observed_count_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,
    observed_value_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0,

    -- ── Intent-time ML feature state (Leakage Prediction) ──────────────────
    intent_row_count                INT          NOT NULL DEFAULT 0,
    intent_total_amount_minor       NUMERIC(20,2) NOT NULL DEFAULT 0,
    intent_amount_square_sum        NUMERIC(30,2) NOT NULL DEFAULT 0,
    intent_min_amount_minor         NUMERIC(20,2),
    intent_max_amount_minor         NUMERIC(20,2),
    client_payout_ref_present_count INT          NOT NULL DEFAULT 0,
    batch_currency                  TEXT,
    batch_source_system             TEXT,
    batch_rail                      TEXT,
    batch_intent_type               TEXT,
    batch_provider_key              TEXT,
    first_intent_created_at         TIMESTAMPTZ,
    under_settlement_amount_minor   NUMERIC(20,2) NOT NULL DEFAULT 0,
    predicted_leakage_rate          NUMERIC(10,6),
    predicted_leakage_minor         NUMERIC(20,2),
    predicted_leakage_model_id      TEXT,
    predicted_at                    TIMESTAMPTZ,

    last_updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Risk summary ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batch_risk_summary (
    batch_uuid                    UUID         PRIMARY KEY REFERENCES batch_contracts_core(id),

    ambiguity_score                NUMERIC(4,3),

    defensibility_tier             TEXT,
    CHECK (defensibility_tier IN ('STRONG', 'GOOD', 'WEAK', 'FRAGILE', NULL)),

    unmatched_amount_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,
    reversal_exposure_minor        NUMERIC(20,2) NOT NULL DEFAULT 0,
    orphan_amount_minor            NUMERIC(20,2) NOT NULL DEFAULT 0,
    duplicate_risk_exposure_minor  NUMERIC(20,2) NOT NULL DEFAULT 0,
    missing_ref_count              INT          NOT NULL DEFAULT 0,
    unexplained_variance_minor     NUMERIC(20,2) NOT NULL DEFAULT 0,
    whitelisted_deduction_minor    NUMERIC(20,2) NOT NULL DEFAULT 0,
    settlement_ref_count           INT          NOT NULL DEFAULT 0,
    bank_ref_present_count         INT          NOT NULL DEFAULT 0,
    decision_ref_count             INT          NOT NULL DEFAULT 0,
    client_ref_present_count       INT          NOT NULL DEFAULT 0,

    last_updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Dispute / closure summary skeletons (decision I-Q2) ─────────────────────
-- No real data source exists yet — Phase 8 (dispute readiness, needs a new
-- durable per-intent write path) and Phase 10 (cutover/closure semantics)
-- populate these via in-place ALTER TABLE ADD COLUMN, not new tables.
CREATE TABLE IF NOT EXISTS batch_dispute_summary (
    batch_uuid   UUID         PRIMARY KEY REFERENCES batch_contracts_core(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_closure_summary (
    batch_uuid   UUID         PRIMARY KEY REFERENCES batch_contracts_core(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
