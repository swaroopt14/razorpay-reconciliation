-- +goose Up
CREATE TABLE evidence_items (
	evidence_pack_id TEXT NOT NULL,
	position_index INT NOT NULL,
	item_type TEXT NOT NULL,
	item_ref TEXT NOT NULL,
	item_hash TEXT,
	leaf_hash TEXT NOT NULL,
	schema_version TEXT NOT NULL,
	PRIMARY KEY(evidence_pack_id, position_index),
	CONSTRAINT fk_evidence_items_pack FOREIGN KEY (evidence_pack_id) REFERENCES evidence_packs(evidence_pack_id) ON DELETE CASCADE
);
CREATE INDEX evidence_items_pack_idx ON evidence_items(evidence_pack_id);

-- +goose Down
DROP INDEX evidence_items_pack_idx;
DROP TABLE evidence_items;
