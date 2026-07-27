-- Phase 5 refactor: policy hardening — immutable policy_definitions history +
-- policy_activations enable/disable history, additive alongside the existing
-- mutable policy_registry table.
--
-- policy_registry REMAINS the single source of truth for the hot read paths
-- (GetByTrigger/GetByID/ListAll/GetAllCronPolicies) — zero application
-- read-path changes, zero blast radius on the policy-evaluation hot path.
-- policy_definitions/policy_activations are dual-written alongside it
-- (policy_repo.go Insert/SetEnabled) and give:
--   - a genuine immutable version history (never UPDATEd, only INSERTed)
--   - a policy_digest for action_contracts to reference (blueprint §5/§6)
--   - a real activation audit trail (who/when enabled/disabled, not just a flag)
--
-- WHY NOT PHYSICALLY SPLIT policy_registry APART?
-- Clarification doc §3 rates policy_registry "In-place OR split into
-- definition/activation — No need for v2". The current single-table design
-- isn't broken (no PK collision, no mixed-tenant drift risk like
-- batch_contracts had before Phase 2) — only its lack of immutable version
-- history. Splitting physically would force a rewrite of every
-- GetByTrigger/GetByID/ListAll call site for zero added safety. Additive
-- dual-write gets the immutability guarantee at a fraction of the blast
-- radius, matching the same "keep the old table as legacy read model" idiom
-- already used for processed_events→event_receipts (Phase 1) and
-- batch_contracts→batch_contracts_core (Phase 2).
--
-- Plain CREATE INDEX (not CONCURRENTLY) is correct here — these are brand
-- new, empty tables, not live hot tables (same precedent as
-- refactor_shadow_diffs in migration 005).

CREATE TABLE IF NOT EXISTS policy_definitions (
    policy_registry_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                TEXT,                    -- NULL = global policy, mirrors policy_registry.tenant_id
    policy_key               TEXT         NOT NULL,   -- = policy_registry.policy_id (human-readable rule name)
    policy_version           INT          NOT NULL,
    policy_source            TEXT         NOT NULL DEFAULT 'zpi_seed',
    -- Who/what supplied this version: 'zpi_seed' (init.sql seed data),
    -- 'zpi_seed_legacy' (backfilled from a pre-Phase-5 policy_registry row),
    -- 'ops_api' (created via POST /v1/intelligence/policies), etc.
    policy_source_ref        TEXT,
    policy_source_version    TEXT,
    policy_family            TEXT,
    scope_type               TEXT         NOT NULL,
    trigger_type             TEXT         NOT NULL,
    trigger_value            TEXT         NOT NULL,
    dsl                      TEXT         NOT NULL,
    policy_digest            TEXT         NOT NULL,
    -- sha256 hex of (policy_key|policy_version|scope_type|trigger_type|trigger_value|dsl).
    -- Referenced by action_contracts.policy_digest so an action's audit trail
    -- proves exactly which rule text fired it. Computed identically in Go
    -- (policy_repo.computePolicyDigest) and in migration 011's backfill.
    severity                 TEXT,
    requires_manual_approval BOOLEAN      NOT NULL DEFAULT false,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, policy_key, policy_version, policy_source)
);

CREATE INDEX IF NOT EXISTS idx_policy_def_trigger
    ON policy_definitions (policy_family, trigger_type, trigger_value, policy_source, policy_version);

CREATE INDEX IF NOT EXISTS idx_policy_def_key
    ON policy_definitions (tenant_id, policy_key, policy_version DESC);

CREATE TABLE IF NOT EXISTS policy_activations (
    policy_activation_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            TEXT,
    policy_registry_id   UUID         NOT NULL REFERENCES policy_definitions(policy_registry_id),
    enabled              BOOLEAN      NOT NULL DEFAULT false,
    effective_from       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    effective_to         TIMESTAMPTZ,
    activated_by         TEXT,
    -- Free text, deliberately not a verified identity — auth/RBAC is
    -- explicitly out of scope for this entire refactor (all phases, per
    -- explicit user instruction 2026-07-16). Populate with whatever caller
    -- context is available (e.g. "ops_api") without pretending it's verified.
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_activations_lookup
    ON policy_activations (tenant_id, policy_registry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_activations_enabled
    ON policy_activations (policy_registry_id, enabled, effective_from, effective_to)
    WHERE enabled = true;
