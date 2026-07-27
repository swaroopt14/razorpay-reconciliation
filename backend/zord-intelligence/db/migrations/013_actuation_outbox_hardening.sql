-- Phase 5 refactor: actuation_outbox hardening — in-place ALTER (clarification
-- §3: PK acceptable, just add missing context fields). Run AFTER migration 012
-- (backfill here joins action_contracts for tenant_id/scope, which 012 must
-- have already populated).

ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS scope_type TEXT;
ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS scope_ref TEXT;
ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS payload_schema_version TEXT DEFAULT 'legacy';
ALTER TABLE actuation_outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
-- last_error: outbox_worker.deliver() already has the Kafka publish error in
-- hand (publishErr) but previously only logged it — MarkFailed now threads it
-- through so failures are visible from the DB, not just container log tails.

CREATE INDEX IF NOT EXISTS idx_outbox_tenant_scope ON actuation_outbox (tenant_id, scope_type, scope_ref, created_at DESC);

-- ── Backfill ──────────────────────────────────────────────────────────────
UPDATE actuation_outbox o SET
    tenant_id  = ac.tenant_id,
    scope_type = ac.scope_type,
    scope_ref  = ac.scope_ref
FROM action_contracts ac
WHERE o.tenant_id IS NULL
  AND ac.action_id = o.action_id;

UPDATE actuation_outbox SET
    payload_hash = encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
WHERE payload_hash IS NULL;

-- ── Verification (run manually after backfill) ───────────────────────────────
-- 1. Every outbox row has tenant_id/scope populated (expect 0 — every row has
--    a NOT NULL FK to action_contracts, which migration 012 fully backfilled):
--    SELECT count(*) FROM actuation_outbox WHERE tenant_id IS NULL OR scope_type IS NULL;
--
-- 2. payload_hash populated for every row (expect 0):
--    SELECT count(*) FROM actuation_outbox WHERE payload_hash IS NULL;
