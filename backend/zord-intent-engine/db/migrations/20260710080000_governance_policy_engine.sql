-- +goose Up

-- Durable, versioned record of why an intent was allowed/flagged. Only
-- intents that reach payment_intents get a row here (an intent hard-rejected
-- to DLQ before an intent_id exists structurally can't reference one).
CREATE TABLE intent_policy_decisions (
    policy_decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    intent_id UUID NOT NULL REFERENCES payment_intents(intent_id) ON DELETE RESTRICT,
    policy_source TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    policy_hash TEXT NOT NULL,
    policy_result TEXT NOT NULL,
    reason_codes_json JSONB NOT NULL DEFAULT '[]',
    input_facts_hash TEXT NOT NULL,
    input_facts_json JSONB,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, intent_id, policy_source, policy_version)
);

CREATE INDEX idx_intent_policy_decisions_intent
    ON intent_policy_decisions (intent_id);

-- Quick-reference snapshot columns on the canonical row itself, mirroring the
-- mapping_profile_hash pattern — full audit trail lives in
-- intent_policy_decisions, these are for cheap reads without a join.
ALTER TABLE payment_intents
    ADD COLUMN policy_source TEXT,
    ADD COLUMN policy_version TEXT,
    ADD COLUMN policy_hash TEXT;

ALTER TABLE outbox
    ADD COLUMN policy_source TEXT,
    ADD COLUMN policy_version TEXT,
    ADD COLUMN policy_hash TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN IF EXISTS policy_hash;
ALTER TABLE outbox DROP COLUMN IF EXISTS policy_version;
ALTER TABLE outbox DROP COLUMN IF EXISTS policy_source;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS policy_hash;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS policy_version;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS policy_source;
DROP INDEX IF EXISTS idx_intent_policy_decisions_intent;
DROP TABLE IF EXISTS intent_policy_decisions;
