-- +goose Up
CREATE TABLE evidence_signatures (
	evidence_pack_id TEXT NOT NULL,
	signer TEXT NOT NULL,
	alg TEXT NOT NULL,
	signature TEXT NOT NULL,
	signed_at TIMESTAMPTZ NOT NULL,
	PRIMARY KEY(evidence_pack_id, signer, alg),
	CONSTRAINT fk_evidence_signatures_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE evidence_signatures;
