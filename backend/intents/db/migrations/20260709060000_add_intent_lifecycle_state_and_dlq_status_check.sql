-- +goose Up

-- business_state has been dead (always 'NEW') since launch — see refactor blueprint
-- ledger item #16. intent_lifecycle_state replaces it as the real per-intent
-- lifecycle tracker. The full state vocabulary is defined now so no further
-- migration is needed as later phases (policy engine, duplicate decisions,
-- evidence leaves, dispatch readiness) start setting the states they own;
-- application code today only ever sets a subset of these values.
ALTER TABLE payment_intents
    ADD COLUMN intent_lifecycle_state TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE payment_intents
    ADD CONSTRAINT chk_payment_intents_lifecycle_state
    CHECK (intent_lifecycle_state IN (
        'RECEIVED', 'MAPPED', 'VALIDATED', 'POLICY_EVALUATED', 'TOKENIZED',
        'DUPLICATE_CHECKED', 'ACCEPTED', 'FLAGGED_FOR_REVIEW', 'REJECTED_TO_DLQ',
        'DUPLICATE_BLOCKED', 'READY_FOR_EVIDENCE', 'READY_FOR_DISPATCH'
    ));

ALTER TABLE outbox
    ADD COLUMN intent_lifecycle_state TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE outbox
    ADD CONSTRAINT chk_outbox_lifecycle_state
    CHECK (intent_lifecycle_state IN (
        'RECEIVED', 'MAPPED', 'VALIDATED', 'POLICY_EVALUATED', 'TOKENIZED',
        'DUPLICATE_CHECKED', 'ACCEPTED', 'FLAGGED_FOR_REVIEW', 'REJECTED_TO_DLQ',
        'DUPLICATE_BLOCKED', 'READY_FOR_EVIDENCE', 'READY_FOR_DISPATCH'
    ));

-- dlq_status is fully enumerable today: models.ClassifyDLQ() only ever returns
-- DLQStatusManualReview ("NEEDS_MANUAL_REVIEW") or DLQStatusTerminal ("DLQ_TERMINAL").
ALTER TABLE dlq_items
    ADD CONSTRAINT chk_dlq_items_status
    CHECK (dlq_status IN ('NEEDS_MANUAL_REVIEW', 'DLQ_TERMINAL'));

-- +goose Down
ALTER TABLE dlq_items DROP CONSTRAINT IF EXISTS chk_dlq_items_status;
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS chk_outbox_lifecycle_state;
ALTER TABLE outbox DROP COLUMN IF EXISTS intent_lifecycle_state;
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS chk_payment_intents_lifecycle_state;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS intent_lifecycle_state;
