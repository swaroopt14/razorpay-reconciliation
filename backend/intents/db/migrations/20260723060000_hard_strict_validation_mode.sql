-- +goose Up
-- R-09: STRICT's name promised hard rejection but the actual code
-- (intent_service.go's requiredFor/ApplyPolicy) only ever held a missing
-- profile-required field for review — identical to REVIEW mode, which was a
-- functionally redundant synonym. Renaming STRICT to REVIEW_STRICT makes the
-- existing behavior honestly named, and merging REVIEW into it removes the
-- redundant synonym. HARD_STRICT is new: an explicit per-tenant opt-in (set
-- via the admin mapping-profile API) that hard-rejects a missing required
-- field to DLQ (reason_code = HARD_STRICT_REQUIRED_FIELD_MISSING) instead of
-- holding it for review. No existing tenant's behavior changes — every row
-- currently 'STRICT' or 'REVIEW' is migrated to 'REVIEW_STRICT', which is
-- wired identically to old STRICT/REVIEW in application code.
ALTER TABLE mapping_profiles DROP CONSTRAINT IF EXISTS chk_mapping_profiles_validation_mode;

UPDATE mapping_profiles SET validation_mode = 'REVIEW_STRICT' WHERE validation_mode IN ('STRICT', 'REVIEW');

ALTER TABLE mapping_profiles ALTER COLUMN validation_mode SET DEFAULT 'REVIEW_STRICT';

ALTER TABLE mapping_profiles
    ADD CONSTRAINT chk_mapping_profiles_validation_mode
    CHECK (validation_mode IN ('REVIEW_STRICT', 'HARD_STRICT', 'OBSERVE'));

-- +goose Down
ALTER TABLE mapping_profiles DROP CONSTRAINT IF EXISTS chk_mapping_profiles_validation_mode;
UPDATE mapping_profiles SET validation_mode = 'STRICT' WHERE validation_mode IN ('REVIEW_STRICT', 'HARD_STRICT');
ALTER TABLE mapping_profiles ALTER COLUMN validation_mode SET DEFAULT 'STRICT';
ALTER TABLE mapping_profiles
    ADD CONSTRAINT chk_mapping_profiles_validation_mode
    CHECK (validation_mode IN ('STRICT', 'REVIEW', 'OBSERVE'));
