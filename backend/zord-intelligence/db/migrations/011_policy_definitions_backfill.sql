-- Phase 5 backfill: seed policy_definitions/policy_activations from every
-- existing policy_registry row. Run AFTER 010.
--
-- No chunking needed here (unlike migration 009's projection_state backfill) —
-- policy_registry holds ~20 seeded policies (see REFACTOR_IMPLEMENTATION_GUIDE.md
-- §F), not a hot millions-of-rows table. Chunked-backfill discipline
-- (commandment #4) exists to protect live high-volume tables; applying it here
-- would be pure overhead for a table this small.
--
-- Idempotent: ON CONFLICT / NOT EXISTS guards make this safely re-runnable.

INSERT INTO policy_definitions
    (tenant_id, policy_key, policy_version, policy_source, policy_family,
     scope_type, trigger_type, trigger_value, dsl, policy_digest,
     severity, requires_manual_approval, created_at)
SELECT
    pr.tenant_id,
    pr.policy_id,
    pr.version,
    'zpi_seed_legacy',
    pr.policy_family,
    pr.scope_type,
    pr.trigger_type,
    pr.trigger_value,
    pr.dsl,
    encode(sha256(convert_to(
        pr.policy_id || '|' || pr.version::text || '|' || pr.scope_type || '|' ||
        pr.trigger_type || '|' || pr.trigger_value || '|' || pr.dsl,
        'UTF8'
    )), 'hex'),
    pr.severity,
    pr.requires_manual_approval,
    pr.created_at
FROM policy_registry pr
ON CONFLICT (tenant_id, policy_key, policy_version, policy_source) DO NOTHING;

-- One activation row per existing policy, reflecting its current enabled
-- state at backfill time. Joined back via the (policy_key, policy_version,
-- 'zpi_seed_legacy') identity just inserted above.
INSERT INTO policy_activations
    (tenant_id, policy_registry_id, enabled, effective_from, activated_by, created_at)
SELECT
    pr.tenant_id,
    pd.policy_registry_id,
    pr.enabled,
    pr.updated_at,
    'backfill_migration_011',
    now()
FROM policy_registry pr
JOIN policy_definitions pd
  ON pd.policy_key = pr.policy_id
 AND pd.policy_version = pr.version
 AND pd.policy_source = 'zpi_seed_legacy'
 AND (pd.tenant_id = pr.tenant_id OR (pd.tenant_id IS NULL AND pr.tenant_id IS NULL))
WHERE NOT EXISTS (
    SELECT 1 FROM policy_activations pa WHERE pa.policy_registry_id = pd.policy_registry_id
);

-- ── Verification (run manually after backfill) ───────────────────────────────
-- 1. Every policy_registry row has exactly one matching definition (expect 0):
--    SELECT pr.policy_id FROM policy_registry pr
--    LEFT JOIN policy_definitions pd
--      ON pd.policy_key = pr.policy_id AND pd.policy_version = pr.version
--     AND pd.policy_source = 'zpi_seed_legacy'
--    WHERE pd.policy_registry_id IS NULL;
--
-- 2. Every definition has exactly one activation row (expect 0):
--    SELECT pd.policy_registry_id FROM policy_definitions pd
--    LEFT JOIN policy_activations pa ON pa.policy_registry_id = pd.policy_registry_id
--    WHERE pa.policy_activation_id IS NULL;
--
-- 3. enabled state matches the source row (expect 0):
--    SELECT pr.policy_id FROM policy_registry pr
--    JOIN policy_definitions pd ON pd.policy_key = pr.policy_id AND pd.policy_version = pr.version
--                               AND pd.policy_source = 'zpi_seed_legacy'
--    JOIN policy_activations pa ON pa.policy_registry_id = pd.policy_registry_id
--    WHERE pa.enabled != pr.enabled;
