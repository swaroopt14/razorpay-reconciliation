-- +goose Up
-- Corrective follow-up to 20260812150000_add_canonical_payload_hash_to_outbox.sql.
--
-- goose tracks applied migrations by version_id only (see
-- goose_db_version) -- it has no content checksum, so it never re-runs a
-- migration whose version_id it has already recorded, even if the SQL file
-- itself was edited afterward. 20260812150000 was originally authored with
-- canonical_payload_hash as a PLAIN column, populated by Go computing
-- SHA-256 of the payload bytes BEFORE insert. That was found to be broken
-- during verification -- outbox.payload is JSONB, and Postgres reformats
-- stored JSON (whitespace, key order), so a hash computed from the
-- pre-insert bytes does not match a hash recomputed later from what's
-- actually stored and read back. The migration FILE was corrected in place
-- to instead make canonical_payload_hash a GENERATED ALWAYS AS (...)
-- STORED column, deriving the hash from the stored representation itself.
--
-- Any environment where 20260812150000 had already been applied BEFORE
-- that correction (goose_db_version already has that version_id recorded)
-- silently kept the old, stale plain-column schema and never picked up the
-- fix -- confirmed as the root cause of PAYLOAD_HASH_MISMATCH errors
-- appearing in zord-relay against real data despite the corrected code
-- being deployed. This migration is a new version_id (so goose will
-- actually run it everywhere) and is idempotent regardless of which state
-- an environment is currently in:
--   - canonical_payload_hash doesn't exist yet -> created fresh, GENERATED.
--   - canonical_payload_hash exists as a plain (non-generated) column ->
--     dropped and recreated as GENERATED.
--   - canonical_payload_hash already is a GENERATED column (a fresh
--     environment that only ever saw the corrected 20260812150000) -> no-op.
--
-- Operational note: the ADD COLUMN ... GENERATED ... STORED branch requires
-- a full table rewrite (computes the generated value for every existing
-- row) and takes an ACCESS EXCLUSIVE lock on outbox for its duration.
-- Prefer running this during a low-traffic window on any environment with
-- a large outbox table.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'outbox'
          AND column_name = 'canonical_payload_hash'
          AND is_generated = 'NEVER'
    ) THEN
        ALTER TABLE outbox DROP COLUMN canonical_payload_hash;
    END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE outbox
    ADD COLUMN IF NOT EXISTS canonical_payload_hash TEXT
    GENERATED ALWAYS AS (encode(sha256(payload::text::bytea), 'hex')) STORED
    NOT NULL;

-- +goose Down
-- Down intentionally does nothing -- reverting to the stale plain-column
-- schema this migration exists to fix would reintroduce the bug. If a
-- rollback is genuinely needed, drop the column manually with full
-- awareness of that tradeoff.
