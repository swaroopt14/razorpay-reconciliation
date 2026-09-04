-- +goose Up
-- P0-1.4: Pack immutability and supersession fields
-- revision_reason   : human-readable reason why this pack supersedes a previous one
-- based_on_versions : JSONB snapshot of ruleset/mapping/schema versions the *original*
--                     pack was built from, carried on the new superseding pack for audit
-- superseded_by_pack_id : back-pointer written on the OLD pack when it is superseded,
--                         completing the bidirectional supersession chain
ALTER TABLE evidence_packs
    ADD COLUMN IF NOT EXISTS revision_reason       TEXT,
    ADD COLUMN IF NOT EXISTS based_on_versions     JSONB,
    ADD COLUMN IF NOT EXISTS superseded_by_pack_id TEXT;

-- Index to allow efficient lookup of "what superseded this pack?"
CREATE INDEX IF NOT EXISTS evidence_packs_superseded_by_idx
    ON evidence_packs(superseded_by_pack_id)
    WHERE superseded_by_pack_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS evidence_packs_superseded_by_idx;
ALTER TABLE evidence_packs
    DROP COLUMN IF EXISTS superseded_by_pack_id,
    DROP COLUMN IF EXISTS based_on_versions,
    DROP COLUMN IF EXISTS revision_reason;
