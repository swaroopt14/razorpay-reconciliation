-- +goose Up

-- profile_hash lets a payment_intent/NIR row snapshot exactly which mapping
-- profile content produced it, independent of profile_id/version (which an
-- admin could reuse without bumping). validation_mode controls how a
-- profile-required field that's missing affects the intent: STRICT/REVIEW
-- both flag for review today (governance_state = FLAGGED via the existing
-- required-field-gap mechanism); true hard-REJECT enforcement is Phase 4
-- (policy engine) work. OBSERVE records the field for visibility only and
-- never flags.
ALTER TABLE mapping_profiles
    ADD COLUMN profile_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN validation_mode TEXT NOT NULL DEFAULT 'STRICT';
ALTER TABLE mapping_profiles
    ADD CONSTRAINT chk_mapping_profiles_validation_mode
    CHECK (validation_mode IN ('STRICT', 'REVIEW', 'OBSERVE'));

ALTER TABLE normalized_ingest_records
    ADD COLUMN mapping_profile_hash TEXT;

ALTER TABLE payment_intents
    ADD COLUMN mapping_profile_hash TEXT;

ALTER TABLE outbox
    ADD COLUMN mapping_profile_hash TEXT;

-- +goose Down
ALTER TABLE outbox DROP COLUMN IF EXISTS mapping_profile_hash;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS mapping_profile_hash;
ALTER TABLE normalized_ingest_records DROP COLUMN IF EXISTS mapping_profile_hash;
ALTER TABLE mapping_profiles DROP CONSTRAINT IF EXISTS chk_mapping_profiles_validation_mode;
ALTER TABLE mapping_profiles DROP COLUMN IF EXISTS validation_mode;
ALTER TABLE mapping_profiles DROP COLUMN IF EXISTS profile_hash;
