-- Phase 2 gap-fix pass (2026-07-13): closes items found cross-checking the
-- Phase 2 implementation against docs/ZPI_Service7_Production_Grade_Refactor_Blueprint...md
-- and docs/service_7_refactoring_clarifications.md. See REFACTOR_IMPLEMENTATION_GUIDE.md
-- §I for context. All additive/in-place ALTERs — no data-destructive changes.

-- ── Gap 2: currency must be on every amount summary table, not just core ────
-- clarification §15: "Every amount summary table must include currency CHAR(3) NOT NULL"
ALTER TABLE batch_reconciliation_summary
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE batch_risk_summary
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR';

-- ── Gap 5 (naming): batch_dispute_summary → batch_dispute_readiness_summary ──
-- Blueprint §2.3 names this table batch_dispute_readiness_summary. Safe
-- rename: table is an empty skeleton, no Go code references it yet.
ALTER TABLE batch_dispute_summary RENAME TO batch_dispute_readiness_summary;

-- ── Gap 4: lifecycle status columns on batch_contracts_core ─────────────────
-- Blueprint §Phase1 batch_contracts_core has these as first-class columns,
-- decoupled from the single legacy batch_finality_status enum. Columns only —
-- no computed transition logic yet (same "skeleton first" treatment already
-- approved for dispute/closure summaries in decision I-Q2). Populating real
-- transitions needs product/business-rule definition, not a guess by this pass.
ALTER TABLE batch_contracts_core
    ADD COLUMN IF NOT EXISTS processing_status     TEXT NOT NULL DEFAULT 'PROCESSING',
    ADD COLUMN IF NOT EXISTS reconciliation_status  TEXT NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS review_status          TEXT NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS closure_status         TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS last_updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_batch_core_tenant_status
    ON batch_contracts_core (tenant_id, reconciliation_status, closure_status, last_updated_at DESC);

-- ── Gap 3: blueprint target v2 field names + lineage columns ────────────────
-- Additive alongside the existing 1:1-mirrored columns (those stay — they're
-- actively dual-written and used). These new columns hold the blueprint's
-- corrected semantics for a future v2 API (clarification §12). Columns with
-- a clean, honest mapping from existing dual-write data are populated by
-- Go code going forward (see batch_contract_repo.go); columns with NO current
-- source of truth (matched_pair_variance_minor, matched_observed_amount_minor,
-- matched_intended_amount_minor, matched_attachment_ambiguity,
-- short_settled_amount_minor) are added but intentionally left NULL — populating
-- them correctly needs new computation logic this pass does not invent.
ALTER TABLE batch_reconciliation_summary
    ADD COLUMN IF NOT EXISTS matched_intended_amount_minor  NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS total_observed_amount_minor    NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS matched_observed_amount_minor  NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS matched_pair_variance_minor    NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS observed_value_coverage        NUMERIC(7,6),
    ADD COLUMN IF NOT EXISTS matched_attachment_confidence  NUMERIC(6,5),
    ADD COLUMN IF NOT EXISTS matched_attachment_ambiguity   NUMERIC(6,5),
    ADD COLUMN IF NOT EXISTS source_service                 TEXT NOT NULL DEFAULT 'zord-outcome-engine',
    ADD COLUMN IF NOT EXISTS source_version                 TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS source_payload_hash            TEXT;

ALTER TABLE batch_risk_summary
    ADD COLUMN IF NOT EXISTS short_settled_amount_minor     NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS projection_source              TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS projection_source_version      TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS projection_version             INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS value_hash                     TEXT;

-- ── Gap 1a: projection_consistency_violations (clarification §11) ──────────
CREATE TABLE IF NOT EXISTS projection_consistency_violations (
    violation_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            TEXT         NOT NULL,
    projection_family    TEXT         NOT NULL,
    metric_key           TEXT         NOT NULL,
    expected_value       NUMERIC,
    actual_value         NUMERIC,
    difference           NUMERIC,
    window_start         TIMESTAMPTZ,
    window_end           TIMESTAMPTZ,
    detected_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status                TEXT         NOT NULL DEFAULT 'OPEN'
);

CREATE INDEX IF NOT EXISTS idx_consistency_violations_open
    ON projection_consistency_violations (tenant_id, detected_at DESC)
    WHERE status = 'OPEN';

-- ── Gap 1b: refactor_shadow_diffs (clarification §14) ───────────────────────
CREATE TABLE IF NOT EXISTS refactor_shadow_diffs (
    diff_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT         NOT NULL,
    scope_type         TEXT         NOT NULL,
    scope_ref          TEXT         NOT NULL,
    diff_family        TEXT         NOT NULL,
    old_payload_hash   TEXT,
    new_payload_hash   TEXT,
    diff_json          JSONB,
    severity           TEXT         NOT NULL,
    detected_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shadow_diffs_unresolved
    ON refactor_shadow_diffs (tenant_id, detected_at DESC)
    WHERE resolved_at IS NULL;
