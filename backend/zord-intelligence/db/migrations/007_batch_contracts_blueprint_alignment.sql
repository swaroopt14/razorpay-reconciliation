-- Blueprint alignment pass (2026-07-14).
--
-- Closes the naming/structural gaps found re-verifying batch_contracts_core
-- and its summary tables against docs/ZPI_Service7_Production_Grade_Refactor_Blueprint...md
-- line-by-line:
--   1. Rename the identity column to batch_contract_id everywhere (blueprint
--      names it that consistently as both the core PK and every summary
--      table's FK column; we had used id/batch_uuid).
--   2. Rename batch_contracts_core.currency -> batch_currency (blueprint's name).
--   3. Add batch_contracts_core.source_system (blueprint has it on core; we
--      only had a same-idea field, batch_source_system, sitting in
--      batch_reconciliation_summary instead).
--   4. Rename last_updated_at/created_at -> computed_at on the summary tables
--      (blueprint's name).
--   5. Add tenant_id to every summary table (blueprint denormalizes it there
--      so each table is tenant-queryable without joining back to core).
--   6. Tighten intent_count_coverage/intent_value_coverage to NUMERIC(7,6)
--      (blueprint's precision; we'd carried the old table's wider NUMERIC(10,6)).
--   7. Drop match_confidence and observed_value_allocation_coverage from
--      batch_reconciliation_summary — true duplicates of matched_attachment_confidence
--      and observed_value_coverage (same value, populated from the same Go
--      variable at write time; clarification doc §12 gives match_confidence ->
--      matched_attachment_confidence as its own example rename). Every OTHER
--      "extra" field beyond the blueprint's spec (total_count, success_count,
--      batch_finality_status, predicted_leakage_*, etc.) is KEPT deliberately —
--      those are P0 fields the live v1 API serves today that the blueprint's
--      clean schema simply never defined a home for; deleting them would leave
--      that data nowhere to live before a future phase addresses it.
--
-- batch_contracts (the old table) is untouched by all of this — it remains
-- the sole read source for the v1 API throughout.

-- ── Step 1: rename identity/FK columns ───────────────────────────────────────
ALTER TABLE batch_contracts_core RENAME COLUMN id TO batch_contract_id;
ALTER TABLE batch_reconciliation_summary RENAME COLUMN batch_uuid TO batch_contract_id;
ALTER TABLE batch_risk_summary RENAME COLUMN batch_uuid TO batch_contract_id;
ALTER TABLE batch_dispute_readiness_summary RENAME COLUMN batch_uuid TO batch_contract_id;
ALTER TABLE batch_closure_summary RENAME COLUMN batch_uuid TO batch_contract_id;

-- ── Step 2: rename core currency field, add source_system ───────────────────
ALTER TABLE batch_contracts_core RENAME COLUMN currency TO batch_currency;
ALTER TABLE batch_contracts_core ADD COLUMN IF NOT EXISTS source_system TEXT;

-- ── Step 3: rename timestamp columns to computed_at ──────────────────────────
ALTER TABLE batch_reconciliation_summary RENAME COLUMN last_updated_at TO computed_at;
ALTER TABLE batch_risk_summary RENAME COLUMN last_updated_at TO computed_at;
ALTER TABLE batch_dispute_readiness_summary RENAME COLUMN created_at TO computed_at;
ALTER TABLE batch_closure_summary RENAME COLUMN created_at TO computed_at;

-- ── Step 4: add + backfill tenant_id on every summary table ─────────────────
ALTER TABLE batch_reconciliation_summary ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE batch_risk_summary ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE batch_dispute_readiness_summary ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE batch_closure_summary ADD COLUMN IF NOT EXISTS tenant_id TEXT;

DO $$
DECLARE
    cur_id UUID;
BEGIN
    LOOP
        UPDATE batch_reconciliation_summary rs
        SET tenant_id = core.tenant_id
        FROM batch_contracts_core core
        WHERE core.batch_contract_id = rs.batch_contract_id
          AND rs.tenant_id IS NULL
          AND rs.batch_contract_id IN (
              SELECT batch_contract_id FROM batch_reconciliation_summary
              WHERE tenant_id IS NULL
              ORDER BY batch_contract_id
              LIMIT 5000
          );

        SELECT batch_contract_id INTO cur_id
        FROM (
            SELECT batch_contract_id FROM batch_reconciliation_summary WHERE tenant_id IS NULL
            ORDER BY batch_contract_id LIMIT 1
        ) t;
        EXIT WHEN cur_id IS NULL;
    END LOOP;
END $$;

UPDATE batch_risk_summary rk
SET tenant_id = core.tenant_id
FROM batch_contracts_core core
WHERE core.batch_contract_id = rk.batch_contract_id AND rk.tenant_id IS NULL;

UPDATE batch_dispute_readiness_summary d
SET tenant_id = core.tenant_id
FROM batch_contracts_core core
WHERE core.batch_contract_id = d.batch_contract_id AND d.tenant_id IS NULL;

UPDATE batch_closure_summary c
SET tenant_id = core.tenant_id
FROM batch_contracts_core core
WHERE core.batch_contract_id = c.batch_contract_id AND c.tenant_id IS NULL;

ALTER TABLE batch_reconciliation_summary ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE batch_risk_summary ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE batch_dispute_readiness_summary ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE batch_closure_summary ALTER COLUMN tenant_id SET NOT NULL;

-- ── Step 5: tighten coverage precision to blueprint's NUMERIC(7,6) ──────────
-- Safe narrowing: these are always 0-1 fractions, well inside NUMERIC(7,6)'s
-- range (max ~9.999999); only the old table's unnecessarily wide NUMERIC(10,6)
-- is being trimmed, no real value is anywhere near truncation.
ALTER TABLE batch_reconciliation_summary ALTER COLUMN intent_count_coverage TYPE NUMERIC(7,6);
ALTER TABLE batch_reconciliation_summary ALTER COLUMN intent_value_coverage TYPE NUMERIC(7,6);

-- ── Step 6: backfill the blueprint-named fields from their duplicates, then drop the duplicates ──
UPDATE batch_reconciliation_summary
SET matched_attachment_confidence = COALESCE(matched_attachment_confidence, match_confidence),
    observed_value_coverage       = COALESCE(observed_value_coverage, observed_value_allocation_coverage)
WHERE matched_attachment_confidence IS NULL OR observed_value_coverage IS NULL;

ALTER TABLE batch_reconciliation_summary DROP COLUMN match_confidence;
ALTER TABLE batch_reconciliation_summary DROP COLUMN observed_value_allocation_coverage;
