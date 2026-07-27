-- Phase 2 gap-fix pass backfill (2026-07-13).
--
-- Most columns added in 005 have a NOT NULL DEFAULT (currency, lifecycle
-- status fields, source_service/source_version, projection_source/version) —
-- Postgres applies those to existing rows automatically as column metadata
-- when the column is added (no rewrite, no backfill needed).
--
-- Two columns have no DEFAULT and need an explicit one-time copy for rows
-- that existed before 005 (rows created afterward get these from
-- batch_contract_repo.go's dual-write going forward):
--   matched_attachment_confidence  ← match_confidence   (clarification §12's
--                                     own example rename)
--   observed_value_coverage        ← observed_value_allocation_coverage
--
-- Idempotent (WHERE ... IS NULL) and chunked per commandment #4.

DO $$
DECLARE
    cur_uuid UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
    LOOP
        UPDATE batch_reconciliation_summary
        SET matched_attachment_confidence = match_confidence,
            observed_value_coverage = observed_value_allocation_coverage
        WHERE batch_uuid IN (
            SELECT batch_uuid FROM batch_reconciliation_summary
            WHERE batch_uuid > cur_uuid
              AND (matched_attachment_confidence IS NULL OR observed_value_coverage IS NULL)
            ORDER BY batch_uuid
            LIMIT 5000
        );

        -- Postgres has no built-in MAX() aggregate for uuid (unlike text/int),
        -- so grab the last row of the same ascending chunk directly instead.
        -- If the chunk is empty, "SELECT ... INTO" sets cur_uuid to NULL on
        -- its own (PL/pgSQL semantics) — no explicit reset needed, and doing
        -- one would break the WHERE clause below, which needs the CURRENT
        -- cur_uuid to find the next chunk.
        SELECT batch_uuid INTO cur_uuid
        FROM (
            SELECT batch_uuid FROM batch_reconciliation_summary
            WHERE batch_uuid > cur_uuid
            ORDER BY batch_uuid
            LIMIT 5000
        ) chunk
        ORDER BY batch_uuid DESC
        LIMIT 1;

        EXIT WHEN cur_uuid IS NULL;
    END LOOP;
END $$;
