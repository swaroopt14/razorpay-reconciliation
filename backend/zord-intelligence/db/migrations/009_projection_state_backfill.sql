-- Phase 3 backfill: derive the new projection_state metadata columns for every
-- row that predates migration 008. Run AFTER 008.
--
-- Idempotent and re-runnable: only rows with NULL metadata are touched
-- (rows written by the Phase 3 Go code, or by a previous run of this file,
-- are skipped). Chunked 5000 rows per pass via keyset pagination on id
-- (commandment #4: no giant backfills).
--
-- DERIVATION CONTRACT (single source of truth — the Go writers in
-- internal/persistence must produce values identical to these rules for new
-- rows; projection_meta_test.go asserts both stay in sync):
--
--   projection_key                     family        scope_type/scope_ref                metric_key          window_type
--   ─────────────────────────────────  ────────────  ──────────────────────────────────  ──────────────────  ──────────────
--   leakage.total                      LEAKAGE       TENANT / tenant_id                  total               ROLLING_24H
--   leakage.batch.{b}                  LEAKAGE       BATCH  / core UUID for {b}          total               BATCH_LIFETIME
--   ambiguity.summary                  AMBIGUITY     TENANT / tenant_id                  summary             ROLLING_24H
--   ambiguity.batch.{b}                AMBIGUITY     BATCH  / core UUID for {b}          summary             BATCH_LIFETIME
--   defensibility.summary              DEFENSIBILITY TENANT / tenant_id                  summary             ROLLING_24H
--   defensibility.batch.{b}            DEFENSIBILITY BATCH  / core UUID for {b}          summary             BATCH_LIFETIME
--   corridor.{metric}.{c}              RELIABILITY   CORRIDOR / {c}                      {metric}            ROLLING_24H
--   tenant.evidence_readiness          DEFENSIBILITY TENANT / tenant_id                  evidence_readiness  ROLLING_24H
--   tenant.sla_breach_rate             SLA           TENANT / tenant_id                  sla_breach_rate     ROLLING_24H
--   dlq.count.{topic}                  RELIABILITY   SOURCE / {topic}                    dlq_count           ROLLING_24H
--   batch.health.{b}                   PATTERN       BATCH  / core UUID for {b}          health              ROLLING_24H
--   pattern.p2_p6                      PATTERN       TENANT / tenant_id                  p2_p6               ROLLING_24H
--   pattern.tenant_summary             PATTERN       TENANT / tenant_id                  tenant_summary      ROLLING_24H
--   pattern.batch_density.{b}          PATTERN       BATCH  / core UUID for {b}          batch_density       ROLLING_24H
--   pattern.source.{s}                 PATTERN       SOURCE / {s}                        source_quality      ROLLING_24H
--   pattern.ambiguity.source.{s}       PATTERN       SOURCE / {s}                        ambiguity_by_source ROLLING_24H
--   pattern.variance.source.{s}        PATTERN       SOURCE / {s}                        variance_by_source  ROLLING_24H
--   pattern.provider.{p}               PATTERN       PSP    / {p}                        provider_quality    ROLLING_24H
--   pattern.bank.{b}                   PATTERN       BANK   / {b}                        bank_quality        ROLLING_24H
--   rca.summary                        RCA           TENANT / tenant_id                  summary             ROLLING_24H
--   rca.frag.{batch}.{intent}          RCA           INTENT / {batch}.{intent}           frag                EPHEMERAL
--
--   BATCH scope_ref: blueprint §5.3 requires batch_contract_id. Resolved by
--   joining batch_contracts_core on (tenant_id, parsed external id) — 004
--   backfilled every known batch, so a miss should only occur for the legacy
--   empty-suffix junk rows ("leakage.batch." — pre-Phase-3 bug E1) whose
--   parsed external id is ''. Misses fall back to the parsed external id so
--   the column stays honest; verification query 2 counts them.
--
--   projection_source / projection_source_version: 'legacy' (real event-family
--   values start with the Phase 3 Go writers; per-source row splitting is
--   Phase 10).
--
--   retention_class: rca.frag.* → TEMP_FRAGMENT (mirrors the existing 10-min
--   TTL sweep); everything else keeps the DERIVED_CACHE column default.
--   expires_at: ROLLING_24H → window_end + 90 days; TEMP_FRAGMENT →
--   computed_at + 10 minutes; BATCH_LIFETIME → NULL (Phase 9+ decides).
--
--   value_hash / source_refs_hash need no explicit SET — the 008 trigger
--   fires on these UPDATEs and computes them.

DO $$
DECLARE
    cur_id  BIGINT := 0;
    last_id BIGINT;
BEGIN
    LOOP
        SELECT max(id) INTO last_id FROM (
            SELECT id FROM projection_state
            WHERE id > cur_id
            ORDER BY id
            LIMIT 5000
        ) chunk;
        EXIT WHEN last_id IS NULL;

        UPDATE projection_state ps SET
            projection_family = COALESCE(ps.projection_family, CASE
                WHEN ps.projection_key LIKE 'corridor.%'
                  OR ps.projection_key LIKE 'dlq.count.%'            THEN 'RELIABILITY'
                WHEN ps.projection_key LIKE 'leakage.%'              THEN 'LEAKAGE'
                WHEN ps.projection_key LIKE 'ambiguity.%'            THEN 'AMBIGUITY'
                WHEN ps.projection_key LIKE 'defensibility.%'
                  OR ps.projection_key =    'tenant.evidence_readiness' THEN 'DEFENSIBILITY'
                WHEN ps.projection_key LIKE 'rca.%'                  THEN 'RCA'
                WHEN ps.projection_key LIKE 'pattern.%'
                  OR ps.projection_key LIKE 'batch.health.%'         THEN 'PATTERN'
                WHEN ps.projection_key =    'tenant.sla_breach_rate' THEN 'SLA'
                ELSE 'UNKNOWN'
            END),

            scope_type = COALESCE(ps.scope_type, CASE
                WHEN ps.projection_key LIKE 'corridor.%'                 THEN 'CORRIDOR'
                WHEN ps.projection_key LIKE 'leakage.batch.%'
                  OR ps.projection_key LIKE 'ambiguity.batch.%'
                  OR ps.projection_key LIKE 'defensibility.batch.%'
                  OR ps.projection_key LIKE 'batch.health.%'
                  OR ps.projection_key LIKE 'pattern.batch_density.%'    THEN 'BATCH'
                WHEN ps.projection_key LIKE 'pattern.provider.%'         THEN 'PSP'
                WHEN ps.projection_key LIKE 'pattern.bank.%'             THEN 'BANK'
                WHEN ps.projection_key LIKE 'pattern.ambiguity.source.%'
                  OR ps.projection_key LIKE 'pattern.variance.source.%'
                  OR ps.projection_key LIKE 'pattern.source.%'
                  OR ps.projection_key LIKE 'dlq.count.%'                THEN 'SOURCE'
                WHEN ps.projection_key LIKE 'rca.frag.%'                 THEN 'INTENT'
                ELSE 'TENANT'
            END),

            scope_ref = COALESCE(ps.scope_ref, CASE
                WHEN ps.projection_key LIKE 'corridor.%' THEN
                    regexp_replace(ps.projection_key, '^corridor\.[^.]+\.', '')
                WHEN ps.projection_key LIKE 'leakage.batch.%'
                  OR ps.projection_key LIKE 'ambiguity.batch.%'
                  OR ps.projection_key LIKE 'defensibility.batch.%'
                  OR ps.projection_key LIKE 'batch.health.%'
                  OR ps.projection_key LIKE 'pattern.batch_density.%' THEN
                    COALESCE(
                        (SELECT c.batch_contract_id::text
                         FROM batch_contracts_core c
                         WHERE c.tenant_id = ps.tenant_id
                           AND c.external_batch_id = regexp_replace(ps.projection_key,
                               '^(?:(?:leakage|ambiguity|defensibility)\.batch\.|batch\.health\.|pattern\.batch_density\.)', '')),
                        regexp_replace(ps.projection_key,
                            '^(?:(?:leakage|ambiguity|defensibility)\.batch\.|batch\.health\.|pattern\.batch_density\.)', '')
                    )
                WHEN ps.projection_key LIKE 'pattern.provider.%' THEN
                    regexp_replace(ps.projection_key, '^pattern\.provider\.', '')
                WHEN ps.projection_key LIKE 'pattern.bank.%' THEN
                    regexp_replace(ps.projection_key, '^pattern\.bank\.', '')
                WHEN ps.projection_key LIKE 'pattern.ambiguity.source.%' THEN
                    regexp_replace(ps.projection_key, '^pattern\.ambiguity\.source\.', '')
                WHEN ps.projection_key LIKE 'pattern.variance.source.%' THEN
                    regexp_replace(ps.projection_key, '^pattern\.variance\.source\.', '')
                WHEN ps.projection_key LIKE 'pattern.source.%' THEN
                    regexp_replace(ps.projection_key, '^pattern\.source\.', '')
                WHEN ps.projection_key LIKE 'dlq.count.%' THEN
                    regexp_replace(ps.projection_key, '^dlq\.count\.', '')
                WHEN ps.projection_key LIKE 'rca.frag.%' THEN
                    regexp_replace(ps.projection_key, '^rca\.frag\.', '')
                ELSE ps.tenant_id
            END),

            metric_key = COALESCE(ps.metric_key, CASE
                WHEN ps.projection_key LIKE 'corridor.%'                 THEN split_part(ps.projection_key, '.', 2)
                WHEN ps.projection_key LIKE 'leakage.%'                  THEN 'total'
                WHEN ps.projection_key LIKE 'ambiguity.%'                THEN 'summary'
                WHEN ps.projection_key LIKE 'defensibility.%'            THEN 'summary'
                WHEN ps.projection_key =    'rca.summary'                THEN 'summary'
                WHEN ps.projection_key LIKE 'rca.frag.%'                 THEN 'frag'
                WHEN ps.projection_key LIKE 'batch.health.%'             THEN 'health'
                WHEN ps.projection_key =    'tenant.evidence_readiness'  THEN 'evidence_readiness'
                WHEN ps.projection_key =    'tenant.sla_breach_rate'     THEN 'sla_breach_rate'
                WHEN ps.projection_key LIKE 'dlq.count.%'                THEN 'dlq_count'
                WHEN ps.projection_key =    'pattern.p2_p6'              THEN 'p2_p6'
                WHEN ps.projection_key =    'pattern.tenant_summary'     THEN 'tenant_summary'
                WHEN ps.projection_key LIKE 'pattern.batch_density.%'    THEN 'batch_density'
                WHEN ps.projection_key LIKE 'pattern.ambiguity.source.%' THEN 'ambiguity_by_source'
                WHEN ps.projection_key LIKE 'pattern.variance.source.%'  THEN 'variance_by_source'
                WHEN ps.projection_key LIKE 'pattern.source.%'           THEN 'source_quality'
                WHEN ps.projection_key LIKE 'pattern.provider.%'         THEN 'provider_quality'
                WHEN ps.projection_key LIKE 'pattern.bank.%'             THEN 'bank_quality'
                ELSE split_part(ps.projection_key, '.', 2)
            END),

            window_type = COALESCE(ps.window_type, CASE
                WHEN ps.projection_key LIKE 'rca.frag.%' THEN 'EPHEMERAL'
                WHEN ps.window_start = TIMESTAMPTZ '2020-01-01 00:00:00+00'
                 AND ps.window_end   = TIMESTAMPTZ '2099-01-01 00:00:00+00' THEN 'BATCH_LIFETIME'
                ELSE 'ROLLING_24H'
            END),

            projection_source         = COALESCE(ps.projection_source, 'legacy'),
            projection_source_version = COALESCE(ps.projection_source_version, 'legacy'),

            retention_class = CASE
                WHEN ps.projection_key LIKE 'rca.frag.%' THEN 'TEMP_FRAGMENT'
                ELSE COALESCE(ps.retention_class, 'DERIVED_CACHE')
            END,

            expires_at = COALESCE(ps.expires_at, CASE
                WHEN ps.projection_key LIKE 'rca.frag.%' THEN ps.computed_at + interval '10 minutes'
                WHEN ps.window_start = TIMESTAMPTZ '2020-01-01 00:00:00+00'
                 AND ps.window_end   = TIMESTAMPTZ '2099-01-01 00:00:00+00' THEN NULL
                ELSE ps.window_end + interval '90 days'
            END)
        WHERE ps.id > cur_id AND ps.id <= last_id
          AND (ps.scope_type IS NULL OR ps.scope_ref IS NULL OR ps.metric_key IS NULL
               OR ps.window_type IS NULL OR ps.projection_source IS NULL);

        cur_id := last_id;
    END LOOP;
END $$;

-- ── Verification (run manually after backfill; expected results noted) ───────
-- 1. No metadata NULLs remain (expect 0):
--    SELECT count(*) FROM projection_state
--    WHERE scope_type IS NULL OR scope_ref IS NULL OR metric_key IS NULL
--       OR window_type IS NULL OR projection_source IS NULL OR value_hash IS NULL;
--
-- 2. BATCH rows whose scope_ref did not resolve to a batch_contracts_core UUID
--    (expect only pre-Phase-3 empty-suffix junk rows, i.e. scope_ref = '' —
--    bug E1; these are Phase 9 cleanup candidates, not backfill failures):
--    SELECT tenant_id, projection_key, scope_ref FROM projection_state
--    WHERE scope_type = 'BATCH'
--      AND scope_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- 3. uq_projection_v2 sanity — every row still uniquely identified (expect 0):
--    SELECT tenant_id, scope_type, scope_ref, projection_family, metric_key,
--           window_type, window_start, projection_source, projection_version, count(*)
--    FROM projection_state
--    GROUP BY 1,2,3,4,5,6,7,8,9 HAVING count(*) > 1;
