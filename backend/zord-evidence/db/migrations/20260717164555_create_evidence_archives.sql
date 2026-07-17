-- +goose Up
CREATE TABLE evidence_archives (
	archive_id TEXT PRIMARY KEY,
	evidence_pack_id TEXT NOT NULL,
	tenant_id TEXT NOT NULL,
	object_ref TEXT NOT NULL,
	encryption_key_id TEXT,
	archive_ciphertext_hash TEXT NOT NULL DEFAULT '',
	plaintext_manifest_hash TEXT NOT NULL DEFAULT '',
	archive_size_bytes BIGINT NOT NULL DEFAULT 0,
	archive_version TEXT NOT NULL DEFAULT 'v1',
	archive_verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_evidence_archives_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE RESTRICT
);
CREATE INDEX evidence_archives_pack_idx ON evidence_archives(evidence_pack_id);

-- +goose Down
DROP INDEX evidence_archives_pack_idx;
DROP TABLE evidence_archives;
