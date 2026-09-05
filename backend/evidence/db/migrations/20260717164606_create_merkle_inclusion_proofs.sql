-- +goose Up
CREATE TABLE merkle_inclusion_proofs (
	evidence_pack_id TEXT NOT NULL,
	leaf_index INT NOT NULL,
	leaf_hash TEXT NOT NULL,
	proof_path_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY(evidence_pack_id, leaf_index),
	CONSTRAINT fk_merkle_proofs_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE merkle_inclusion_proofs;
