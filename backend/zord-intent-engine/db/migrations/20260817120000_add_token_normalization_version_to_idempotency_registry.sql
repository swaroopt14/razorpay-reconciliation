-- +goose Up
-- TOK-08 (zord-token-enclave audit ticket, "Use field-kind-specific
-- normalization and versioned token semantics"): schema-only, zero
-- behavior change. Adds a nullable column to record which token
-- normalization version produced the beneficiary_fingerprint stored in
-- each row -- a safe, forward-compatible hook for a FUTURE ticket, not
-- wired into any read/write code path by this migration.
--
-- Why this table needs it: computeBeneficiaryFingerprint (intent_service.go)
-- hashes the raw enclave TOKEN VALUES for account_number/ifsc/vpa into
-- beneficiary_fingerprint, looked up here for exact-string-equality to
-- detect duplicate payment intents (SAME_BENEFICIARY_AMOUNT_TIME). If
-- zord-token-enclave's token normalization ever changes what those three
-- kinds compute for already-seen real data (e.g. a future rotation to a
-- new normalization version), every future fingerprint for that
-- beneficiary changes too, and this table's lookup silently stops
-- matching existing rows -- a live, silent duplicate-detection
-- regression, not a crash. This column exists so a future rotation-
-- activation ticket has a way to tag (and eventually reconcile/migrate)
-- rows by which normalization version produced them, instead of that
-- gap being invisible.
--
-- No DEFAULT is forced retroactively via this ALTER -- existing rows get
-- NULL, since this migration makes no claim about which version actually
-- produced them (zord-token-enclave's TOK-08 only just introduced real
-- versioning; anything before that point is undocumented by definition).
ALTER TABLE business_idempotency_registry
    ADD COLUMN IF NOT EXISTS token_normalization_version TEXT;

-- +goose Down
ALTER TABLE business_idempotency_registry
    DROP COLUMN IF EXISTS token_normalization_version;
