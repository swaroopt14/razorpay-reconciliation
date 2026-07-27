-- Phase 3 refactor: projection_state → scoped, source-aware computed cache.
-- Blueprint §6 Phase 3 (in-place migration per clarification §3; production-safe
-- discipline per clarification §8).
--
-- WHAT THIS ADDS (all additive, no table rewrite, no behavior change):
--   1. Scope/source/retention metadata columns (nullable-first; backfill in 009).
--   2. A BEFORE INSERT OR UPDATE trigger maintaining value_hash /
--      source_refs_hash (sha256 of the canonical jsonb text). A trigger is the
--      only non-duplicative way to keep a hash of value_json current — every
--      one of the ~60 writer statements mutates value_json through large
--      nested jsonb_set expressions that cannot be referenced twice in SQL.
--   3. The blueprint's future unique index uq_projection_v2 plus three query/
--      retention indexes. The OLD unique constraint uq_projection
--      (tenant_id, projection_key, window_start, projection_version) REMAINS
--      the identity every ON CONFLICT targets — uq_projection_v2 is inert
--      until the Phase 10 cutover (the old, tighter uniqueness plus the fact
--      that all new columns are pure functions of projection_key/window makes
--      a v2 violation impossible).
--
-- ⚠ RUN OUTSIDE A TRANSACTION BLOCK. The index builds use CREATE INDEX
--   CONCURRENTLY (mandatory on live tables per clarification §8 rule 4),
--   which Postgres forbids inside a transaction. Every statement here is
--   individually idempotent (IF NOT EXISTS / OR REPLACE), so a partial run
--   can simply be re-run.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_projection_state_hashes ON projection_state;
--   DROP FUNCTION IF EXISTS zpi_projection_state_hashes();
--   DROP INDEX IF EXISTS uq_projection_v2, idx_projection_scope_family_metric,
--                        idx_projection_family_window, idx_projection_retention_expiry;
--   ALTER TABLE projection_state
--     DROP COLUMN IF EXISTS scope_type, DROP COLUMN IF EXISTS scope_ref,
--     DROP COLUMN IF EXISTS metric_key, DROP COLUMN IF EXISTS window_type,
--     DROP COLUMN IF EXISTS projection_source, DROP COLUMN IF EXISTS projection_source_version,
--     DROP COLUMN IF EXISTS value_hash, DROP COLUMN IF EXISTS source_refs_hash,
--     DROP COLUMN IF EXISTS retention_class, DROP COLUMN IF EXISTS expires_at;

-- ── 1. Metadata columns ──────────────────────────────────────────────────────
-- Values and their derivation rules are specified in 009 (backfill) and
-- mirrored by the Go writers going forward. Summary of the contract:
--   scope_type   TENANT|BATCH|INTENT|CORRIDOR|PSP|SOURCE|BANK
--   scope_ref    tenant_id / batch_contracts_core.batch_contract_id (BATCH) /
--                corridor key / provider key / source system / bank id.
--                '__unbatched__' is the explicit bucket for events that carry
--                no batch reference (replaces the former "leakage.batch."
--                junk-key behavior) so tenant = Σ batch stays additive.
--   metric_key   the metric portion of projection_key (e.g. 'total',
--                'success_rate', 'provider_quality').
--   window_type  ROLLING_24H (daily buckets) | BATCH_LIFETIME (2020→2099 row).
--   projection_source          upstream event family that computed the row
--                (attachment_decision, settlement_observation, variance_record,
--                 intent_created, batch_summary, governance_decision,
--                 evidence_pack, manual_review_dlq, finality_certificate,
--                 dispatch_attempt, outcome_normalized, statement_match,
--                 dlq_event, sla_timer, rca_clustering, pattern_snapshot ...);
--                'aggregate' where several families share one accumulator row
--                would be nondeterministic — the FIRST writer's family sticks
--                (ON CONFLICT never updates it); true per-source row splitting
--                is Phase 10 work gated on read-side aggregation.
--   projection_source_version  envelope event_version ('legacy' until
--                upstream ships real versions — team decision A.2).
--   retention_class DERIVED_CACHE (default) | TEMP_FRAGMENT (rca.frag.*).
--   expires_at   window_end + 90 days for ROLLING_24H rows,
--                computed_at + 10 minutes for TEMP_FRAGMENT rows,
--                NULL for BATCH_LIFETIME rows (batch closure decides, Phase 9+).
--                No cleanup worker consumes this yet — that is Phase 9.
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS scope_type TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS scope_ref TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS metric_key TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS window_type TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS projection_source TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS projection_source_version TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS value_hash TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS source_refs_hash TEXT;
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS retention_class TEXT DEFAULT 'DERIVED_CACHE';
ALTER TABLE projection_state ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── 2. Hash maintenance trigger ──────────────────────────────────────────────
-- Fires on every INSERT/UPDATE (projection writes always touch value_json;
-- an unconditional trigger also lets the 009 backfill UPDATEs populate the
-- hashes for free). jsonb::text is deterministic in Postgres (jsonb is stored
-- normalized), so the hash is stable for identical values.
CREATE OR REPLACE FUNCTION zpi_projection_state_hashes() RETURNS trigger AS $$
BEGIN
    NEW.value_hash := encode(sha256(convert_to(NEW.value_json::text, 'UTF8')), 'hex');
    IF NEW.source_refs_json IS NOT NULL THEN
        NEW.source_refs_hash := encode(sha256(convert_to(NEW.source_refs_json::text, 'UTF8')), 'hex');
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projection_state_hashes ON projection_state;
CREATE TRIGGER trg_projection_state_hashes
    BEFORE INSERT OR UPDATE ON projection_state
    FOR EACH ROW EXECUTE FUNCTION zpi_projection_state_hashes();

-- ── 3. Indexes (CONCURRENTLY — live-table safe, must run outside a tx) ──────
-- The blueprint's preferred future unique identity. Kept alongside (NOT
-- replacing) uq_projection until Phase 10.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_projection_v2
    ON projection_state (
        tenant_id, scope_type, scope_ref, projection_family, metric_key,
        window_type, window_start, projection_source, projection_version
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_scope_family_metric
    ON projection_state (tenant_id, scope_type, scope_ref, projection_family, metric_key);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_family_window
    ON projection_state (tenant_id, projection_family, window_end DESC);

-- Retention sweep path for the Phase 9 cleanup worker.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_retention_expiry
    ON projection_state (retention_class, expires_at)
    WHERE expires_at IS NOT NULL;
