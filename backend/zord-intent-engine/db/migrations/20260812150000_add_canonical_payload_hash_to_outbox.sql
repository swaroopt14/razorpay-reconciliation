-- +goose Up
-- canonical_payload_hash is SHA-256 of the exact bytes Postgres stores and
-- returns for this row's `payload` column (the canonical, post-
-- transformation intent JSON) -- a deliberately separate field from
-- payload_hash, which is SHA-256 of the raw, pre-transformation ingest
-- payload and is already relied on internally by zord-intent-engine's own
-- ingest-time integrity check.
--
-- This MUST be a database-computed GENERATED column, not a value computed
-- in Go before insert: `payload` is JSONB, and Postgres reformats JSON on
-- storage (e.g. whitespace), so a hash computed from the pre-insert Go
-- []byte would not match a hash recomputed later from what Postgres
-- actually stores and serves back out (confirmed against a real Postgres
-- instance during development -- the two byte sequences differed). Deriving
-- the hash from payload::text inside the database guarantees it always
-- matches exactly what a reader (e.g. Relay, via the lease response) will
-- receive.
ALTER TABLE outbox
    ADD COLUMN canonical_payload_hash TEXT
    GENERATED ALWAYS AS (encode(sha256(payload::text::bytea), 'hex')) STORED
    NOT NULL;

-- +goose Down
ALTER TABLE outbox DROP COLUMN canonical_payload_hash;
