-- +goose Up
-- Signed artifact companion to the existing metadata-only ml_model_registry.
CREATE TABLE ml_model_bundles (
	model_name                TEXT     NOT NULL,
	version                   TEXT     NOT NULL,
	artifact                  BYTEA    NOT NULL,
	digest                    CHAR(64) NOT NULL,
	training_dataset_lineage  JSONB    NOT NULL,
	metrics                   JSONB    NOT NULL,
	approver                  TEXT     NOT NULL,
	created_at                TEXT     NOT NULL,
	signature                 TEXT     NOT NULL,
	approved                  BOOLEAN  NOT NULL DEFAULT TRUE,
	PRIMARY KEY (model_name, version)
);

CREATE TABLE ml_model_candidates (
	model_name                TEXT     NOT NULL,
	version                   TEXT     NOT NULL,
	artifact                  BYTEA    NOT NULL,
	digest                    CHAR(64) NOT NULL,
	training_dataset_lineage  JSONB    NOT NULL,
	metrics                   JSONB    NOT NULL,
	source_event_id           TEXT     NOT NULL,
	created_at                TEXT     NOT NULL,
	PRIMARY KEY (model_name, version),
	UNIQUE (model_name, source_event_id)
);

CREATE TABLE ml_model_promotions (
	model_name   TEXT PRIMARY KEY,
	version      TEXT NOT NULL,
	promoted_by  TEXT NOT NULL,
	promoted_at  TEXT NOT NULL,
	FOREIGN KEY (model_name, version)
		REFERENCES ml_model_bundles(model_name, version)
);

CREATE TABLE ml_model_training_triggers (
	event_id               TEXT PRIMARY KEY,
	model_name             TEXT     NOT NULL,
	tenant_id              TEXT     NOT NULL,
	feature_family         TEXT     NOT NULL,
	training_scope         TEXT     NOT NULL
		CHECK (training_scope IN ('GLOBAL', 'TENANT')),
	policy_id              TEXT     NOT NULL,
	policy_snapshot_digest CHAR(64) NOT NULL,
	payload_digest         CHAR(64) NOT NULL,
	created_at             TEXT     NOT NULL
);

CREATE INDEX idx_ml_model_candidates_latest
	ON ml_model_candidates (model_name, created_at DESC);

-- +goose Down
DROP INDEX idx_ml_model_candidates_latest;
DROP TABLE ml_model_training_triggers;
DROP TABLE ml_model_promotions;
DROP TABLE ml_model_candidates;
DROP TABLE ml_model_bundles;
