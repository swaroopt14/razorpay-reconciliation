-- +goose Up
CREATE TABLE evidence_pack_signatures (
	evidence_pack_id TEXT NOT NULL,
	signer_id TEXT NOT NULL,
	alg TEXT NOT NULL,
	key_id TEXT NOT NULL,
	signature_value TEXT NOT NULL,
	signed_payload_hash TEXT NOT NULL,
	canonicalization_version TEXT NOT NULL,
	signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	verification_status TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
	signed_payload TEXT,
	PRIMARY KEY (evidence_pack_id, signer_id, alg, key_id),
	CONSTRAINT fk_evidence_pack_signatures_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE CASCADE
);
CREATE INDEX evidence_pack_signatures_pack_idx ON evidence_pack_signatures(evidence_pack_id);

-- +goose Down
DROP INDEX evidence_pack_signatures_pack_idx;
DROP TABLE evidence_pack_signatures;
