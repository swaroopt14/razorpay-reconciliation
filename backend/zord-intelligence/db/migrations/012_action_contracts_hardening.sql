-- Phase 5 refactor: action_contracts hardening — in-place ALTER (clarification
-- §3: PK is acceptable, historical continuity matters, no v2 fork needed).
--
-- Adds: policy lineage (policy_registry_id/source/digest), a primary
-- scope_type/scope_ref classifier (scope_refs JSONB is kept unchanged — this
-- is an additive, queryable summary of it, same "honest fallback" idiom as
-- Phase 3's keyToProjectionMeta), trigger-event lineage, input/payload
-- integrity hashes, reserved mapping-profile columns (blueprint fields with
-- no current ZPI usage — left NULL until Service 7 gains carrier-mapping
-- awareness), and real signature metadata columns (clarification §5) to
-- replace the plain-sha256 placeholder.
--
-- All columns nullable-first (commandment: no NOT NULL before backfill).
--
-- Note: action_contracts.action_id is TEXT, not UUID — the blueprint's SQL
-- examples show UUID, but that is a documentation typo relative to this
-- codebase's actual PK type (already flagged in REFACTOR_IMPLEMENTATION_GUIDE.md
-- §B). policy_registry_id here IS a real UUID (FK to policy_definitions).

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS policy_registry_id UUID REFERENCES policy_definitions(policy_registry_id);
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS policy_source TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS policy_digest TEXT;

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS scope_type TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS scope_ref TEXT;

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS trigger_event_id TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS trigger_event_source TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS trigger_event_type TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS trigger_event_version TEXT;
-- trigger_event_id/source/type/version cannot be recovered for pre-Phase-5
-- rows: the old idempotency_key hash folds trigger_event_id in one-way, and
-- source/type/version were never captured as their own columns at all before
-- now. These stay NULL on old rows — genuinely unrecoverable, not a backfill
-- gap (see migration comment below and REFACTOR_IMPLEMENTATION_GUIDE.md §K).

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS input_facts_hash TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS payload_schema_version TEXT DEFAULT 'legacy';

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS mapping_profile_id TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS mapping_profile_version TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS mapping_profile_hash TEXT;
-- Reserved per blueprint §6 — no current ZPI concept of a "carrier mapping
-- profile" exists yet. Left NULL/unpopulated by every writer until a future
-- phase actually needs them; added now so that phase doesn't need another ALTER.

ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS signature_algorithm TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS signature_key_id TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS signature_payload_hash TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS canonicalization_version TEXT;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE action_contracts ADD COLUMN IF NOT EXISTS signature_verification_status TEXT DEFAULT 'UNVERIFIED';

CREATE INDEX IF NOT EXISTS idx_ac_scope_type_ref ON action_contracts (tenant_id, scope_type, scope_ref, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ac_policy_registry ON action_contracts (policy_registry_id);

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Small table (see migration 011's note on backfill sizing) — no chunking.

-- policy lineage: join back to the definitions backfilled in migration 011.
UPDATE action_contracts ac SET
    policy_registry_id = pd.policy_registry_id,
    policy_source       = pd.policy_source,
    policy_digest        = pd.policy_digest
FROM policy_definitions pd
WHERE ac.policy_registry_id IS NULL
  AND pd.policy_key = ac.policy_id
  AND pd.policy_version = ac.policy_version
  AND pd.policy_source = 'zpi_seed_legacy'
  AND (pd.tenant_id = ac.tenant_id OR (pd.tenant_id IS NULL AND ac.tenant_id IS NULL));

-- scope_type/scope_ref: honest fallback over scope_refs JSONB, same
-- precedence order used going forward by action_service.go's deriveScope
-- (BATCH > INTENT > CONTRACT > CORRIDOR > TENANT — see that function's
-- comment for the rationale: policy_registry.scope_type's own vocabulary
-- already treats 'contract' as narrower than 'corridor').
UPDATE action_contracts SET
    scope_type = CASE
        WHEN scope_refs->>'batch_id'    IS NOT NULL AND scope_refs->>'batch_id'    != '' THEN 'BATCH'
        WHEN scope_refs->>'intent_id'   IS NOT NULL AND scope_refs->>'intent_id'   != '' THEN 'INTENT'
        WHEN scope_refs->>'contract_id' IS NOT NULL AND scope_refs->>'contract_id' != '' THEN 'CONTRACT'
        WHEN scope_refs->>'corridor_id' IS NOT NULL AND scope_refs->>'corridor_id' != '' THEN 'CORRIDOR'
        ELSE 'TENANT'
    END,
    scope_ref = CASE
        WHEN scope_refs->>'batch_id'    IS NOT NULL AND scope_refs->>'batch_id'    != '' THEN scope_refs->>'batch_id'
        WHEN scope_refs->>'intent_id'   IS NOT NULL AND scope_refs->>'intent_id'   != '' THEN scope_refs->>'intent_id'
        WHEN scope_refs->>'contract_id' IS NOT NULL AND scope_refs->>'contract_id' != '' THEN scope_refs->>'contract_id'
        WHEN scope_refs->>'corridor_id' IS NOT NULL AND scope_refs->>'corridor_id' != '' THEN scope_refs->>'corridor_id'
        ELSE tenant_id
    END
WHERE scope_type IS NULL;

-- input_facts_hash / payload_hash: fully recoverable — both source JSON blobs
-- are already stored, so backfilling their hash is a pure function of
-- existing data (unlike trigger_event_* above).
UPDATE action_contracts SET
    input_facts_hash = encode(sha256(convert_to(input_refs_json::text, 'UTF8')), 'hex')
WHERE input_facts_hash IS NULL;

UPDATE action_contracts SET
    payload_hash = encode(sha256(convert_to(payload_json::text, 'UTF8')), 'hex')
WHERE payload_hash IS NULL;

-- ── Verification (run manually after backfill) ───────────────────────────────
-- 1. No action_contracts row left without a policy_registry_id (expect 0,
--    since migration 011 backfilled a definition for every distinct
--    policy_id+version that could ever have created an action):
--    SELECT count(*) FROM action_contracts WHERE policy_registry_id IS NULL;
--
-- 2. scope_type/scope_ref populated for every row (expect 0):
--    SELECT count(*) FROM action_contracts WHERE scope_type IS NULL OR scope_ref IS NULL;
--
-- 3. payload_hash / input_facts_hash populated for every row (expect 0):
--    SELECT count(*) FROM action_contracts WHERE payload_hash IS NULL OR input_facts_hash IS NULL;
