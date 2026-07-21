-- Bug fix (found live 2026-07-16, during Phase 1-5 end-to-end verification):
-- observed_value_coverage was added in migration 005 as a plain nullable
-- NUMERIC(7,6) with no default, unlike its three sibling coverage columns
-- (intent_count_coverage, intent_value_coverage,
-- observed_count_allocation_coverage), which are all NOT NULL DEFAULT 0.
--
-- batch_reconciliation_summary rows are created on first sight by whichever
-- Atomic* writer touches a batch first (5 different INSERT sites in
-- batch_contract_repo.go, same "row created incrementally" idiom as
-- projection_state) — none of which set observed_value_coverage until the
-- specific write path that computes it actually runs (typically triggered by
-- batch.summary.updated). For a batch that has only received
-- intent.created/settlement/variance events so far, the row exists but this
-- one column is genuinely NULL, while its siblings read 0 thanks to their
-- default.
--
-- This surfaced live as: shadow_diff_worker's CompareBatchOldVsNew scanning
-- this column into a non-pointer float64 (batch_shadow_diff.go's
-- batchShadowFields.ObservedValueAllocationCoverage) — "cannot scan NULL
-- into *float64" — for a real in-flight batch (aks16), the first batch ever
-- observed by shadow-diff before its summary event arrived.
--
-- Fix: align the column with its three siblings. Eliminates the NULL state
-- at the source — no Go code change needed, and no risk of missing one of
-- the 5 INSERT sites that could independently create this row.

ALTER TABLE batch_reconciliation_summary ALTER COLUMN observed_value_coverage SET DEFAULT 0;
UPDATE batch_reconciliation_summary SET observed_value_coverage = 0 WHERE observed_value_coverage IS NULL;
ALTER TABLE batch_reconciliation_summary ALTER COLUMN observed_value_coverage SET NOT NULL;
