-- Phase 2 backfill: populate batch_contracts_core + the new summary tables
-- from existing batch_contracts rows that predate the Phase 2 deploy.
--
-- Idempotent and re-runnable: every INSERT uses ON CONFLICT DO NOTHING, so
-- running this twice (or running it after the dual-write code in
-- batch_contract_repo.go has already shadow-written some of these same
-- batches) is safe — existing rows are left untouched.
--
-- Chunked per the "no giant backfills" rule (REFACTOR_IMPLEMENTATION_GUIDE.md
-- §H commandment #4): processes 5000 batch_id rows at a time via keyset
-- pagination on batch_id (text, sortable), rather than one unbounded
-- INSERT...SELECT that could lock/scan the whole table at once.
--
-- Run this AFTER 003_batch_contracts_core.sql has been applied.

-- ── Step 1: batch_contracts_core identity rows ───────────────────────────────
DO $$
DECLARE
    cur_batch_id TEXT := '';
BEGIN
    LOOP
        INSERT INTO batch_contracts_core (tenant_id, external_batch_id, source_reference)
        SELECT tenant_id, batch_id, source_reference
        FROM batch_contracts
        WHERE batch_id > cur_batch_id
        ORDER BY batch_id
        LIMIT 5000
        ON CONFLICT (tenant_id, external_batch_id) DO NOTHING;

        SELECT max(batch_id) INTO cur_batch_id
        FROM (
            SELECT batch_id FROM batch_contracts
            WHERE batch_id > cur_batch_id
            ORDER BY batch_id
            LIMIT 5000
        ) chunk;

        EXIT WHEN cur_batch_id IS NULL;
    END LOOP;
END $$;

-- ── Step 2: batch_reconciliation_summary ─────────────────────────────────────
DO $$
DECLARE
    cur_batch_id TEXT := '';
BEGIN
    LOOP
        INSERT INTO batch_reconciliation_summary (
            batch_uuid, total_count, success_count, failed_count, pending_count,
            reversed_count, partial_recon_count,
            total_intended_amount_minor, total_confirmed_amount_minor, original_settled_amount_minor, total_variance_minor,
            batch_finality_status, match_confidence,
            total_intent_count, matched_intent_count, ambiguous_count, unresolved_intent_count, conflicted_count, orphan_observation_count,
            original_intended_amount_minor, ambiguous_amount_minor, unresolved_intended_amount_minor, conflicted_amount_minor, orphan_observed_amount_minor, net_batch_delta_minor,
            intent_count_coverage, intent_value_coverage, observed_count_allocation_coverage, observed_value_allocation_coverage,
            intent_row_count, intent_total_amount_minor, intent_amount_square_sum, intent_min_amount_minor, intent_max_amount_minor,
            client_payout_ref_present_count, batch_currency, batch_source_system, batch_rail, batch_intent_type, batch_provider_key,
            first_intent_created_at, under_settlement_amount_minor,
            predicted_leakage_rate, predicted_leakage_minor, predicted_leakage_model_id, predicted_at,
            last_updated_at
        )
        SELECT
            core.id, bc.total_count, bc.success_count, bc.failed_count, bc.pending_count,
            bc.reversed_count, bc.partial_recon_count,
            bc.total_intended_amount_minor, bc.total_confirmed_amount_minor, bc.original_settled_amount_minor, bc.total_variance_minor,
            bc.batch_finality_status, bc.match_confidence,
            bc.total_intent_count, bc.matched_intent_count, bc.ambiguous_count, bc.unresolved_intent_count, bc.conflicted_count, bc.orphan_observation_count,
            bc.original_intended_amount_minor, bc.ambiguous_amount_minor, bc.unresolved_intended_amount_minor, bc.conflicted_amount_minor, bc.orphan_observed_amount_minor, bc.net_batch_delta_minor,
            bc.intent_count_coverage, bc.intent_value_coverage, bc.observed_count_allocation_coverage, bc.observed_value_allocation_coverage,
            bc.intent_row_count, bc.intent_total_amount_minor, bc.intent_amount_square_sum, bc.intent_min_amount_minor, bc.intent_max_amount_minor,
            bc.client_payout_ref_present_count, bc.batch_currency, bc.batch_source_system, bc.batch_rail, bc.batch_intent_type, bc.batch_provider_key,
            bc.first_intent_created_at, bc.under_settlement_amount_minor,
            bc.predicted_leakage_rate, bc.predicted_leakage_minor, bc.predicted_leakage_model_id, bc.predicted_at,
            bc.last_updated_at
        FROM batch_contracts bc
        JOIN batch_contracts_core core
          ON core.tenant_id = bc.tenant_id AND core.external_batch_id = bc.batch_id
        WHERE bc.batch_id > cur_batch_id
        ORDER BY bc.batch_id
        LIMIT 5000
        ON CONFLICT (batch_uuid) DO NOTHING;

        SELECT max(batch_id) INTO cur_batch_id
        FROM (
            SELECT batch_id FROM batch_contracts
            WHERE batch_id > cur_batch_id
            ORDER BY batch_id
            LIMIT 5000
        ) chunk;

        EXIT WHEN cur_batch_id IS NULL;
    END LOOP;
END $$;

-- ── Step 3: batch_risk_summary ────────────────────────────────────────────────
DO $$
DECLARE
    cur_batch_id TEXT := '';
BEGIN
    LOOP
        INSERT INTO batch_risk_summary (
            batch_uuid, ambiguity_score, defensibility_tier,
            unmatched_amount_minor, reversal_exposure_minor, orphan_amount_minor, duplicate_risk_exposure_minor,
            missing_ref_count, unexplained_variance_minor, whitelisted_deduction_minor,
            settlement_ref_count, bank_ref_present_count, decision_ref_count, client_ref_present_count,
            last_updated_at
        )
        SELECT
            core.id, bc.ambiguity_score, bc.defensibility_tier,
            bc.unmatched_amount_minor, bc.reversal_exposure_minor, bc.orphan_amount_minor, bc.duplicate_risk_exposure_minor,
            bc.missing_ref_count, bc.unexplained_variance_minor, bc.whitelisted_deduction_minor,
            bc.settlement_ref_count, bc.bank_ref_present_count, bc.decision_ref_count, bc.client_ref_present_count,
            bc.last_updated_at
        FROM batch_contracts bc
        JOIN batch_contracts_core core
          ON core.tenant_id = bc.tenant_id AND core.external_batch_id = bc.batch_id
        WHERE bc.batch_id > cur_batch_id
        ORDER BY bc.batch_id
        LIMIT 5000
        ON CONFLICT (batch_uuid) DO NOTHING;

        SELECT max(batch_id) INTO cur_batch_id
        FROM (
            SELECT batch_id FROM batch_contracts
            WHERE batch_id > cur_batch_id
            ORDER BY batch_id
            LIMIT 5000
        ) chunk;

        EXIT WHEN cur_batch_id IS NULL;
    END LOOP;
END $$;
