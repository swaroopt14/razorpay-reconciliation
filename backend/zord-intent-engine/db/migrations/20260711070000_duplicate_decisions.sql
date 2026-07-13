-- +goose Up

-- Durable, per-intent duplicate-detection decision — see refactor blueprint
-- ledger item #12. Recorded for every intent that reaches payment_intents
-- (including NO_DUPLICATE_SIGNAL), so "why wasn't this flagged" is provable
-- too, not just "why was it flagged".
CREATE TABLE duplicate_decisions (
    duplicate_decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    intent_id UUID NOT NULL REFERENCES payment_intents(intent_id) ON DELETE RESTRICT,
    decision TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    duplicate_score NUMERIC(6,2) NOT NULL,
    compared_intent_id UUID,
    duplicate_group_id TEXT,
    comparison_facts_hash TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_duplicate_decisions_intent
    ON duplicate_decisions (intent_id);
CREATE INDEX idx_duplicate_decisions_tenant_decision
    ON duplicate_decisions (tenant_id, decision);

-- Strict duplicate detection (idempotency_key / client_payout_ref reuse) was
-- dead code — these branches existed in the scoring logic but nothing ever
-- populated them. Enforcing them means querying payment_intents by these
-- fields per intent, so they need tenant-scoped indexes.
CREATE INDEX idx_payment_intents_tenant_idempotency_key
    ON payment_intents (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX idx_payment_intents_tenant_client_payout_ref
    ON payment_intents (tenant_id, client_payout_ref)
    WHERE client_payout_ref IS NOT NULL AND client_payout_ref <> '';

-- +goose Down
DROP INDEX IF EXISTS idx_payment_intents_tenant_client_payout_ref;
DROP INDEX IF EXISTS idx_payment_intents_tenant_idempotency_key;
DROP INDEX IF EXISTS idx_duplicate_decisions_tenant_decision;
DROP INDEX IF EXISTS idx_duplicate_decisions_intent;
DROP TABLE IF EXISTS duplicate_decisions;
