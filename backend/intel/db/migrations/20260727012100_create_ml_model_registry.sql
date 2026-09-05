-- +goose Up
CREATE TABLE ml_model_registry (
	model_id               TEXT        PRIMARY KEY,
	model_name             TEXT        NOT NULL,
	model_family           TEXT        NOT NULL
		CHECK (model_family IN ('LEAKAGE','AMBIGUITY','DEFENSIBILITY','PATTERN','RECOMMENDATION')),
	algorithm              TEXT        NOT NULL,
	target_label           TEXT        NOT NULL,
	feature_version        TEXT        NOT NULL DEFAULT 'v1',
	training_window_start  TIMESTAMPTZ,
	training_window_end    TIMESTAMPTZ,
	hyperparameters_json   JSONB,
	metrics_json           JSONB,
	status                 TEXT        NOT NULL DEFAULT 'CANDIDATE'
		CHECK (status IN ('CANDIDATE','SHADOW','ACTIVE','RETIRED')),
	created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	activated_at           TIMESTAMPTZ
);

CREATE INDEX idx_ml_model_family_status
	ON ml_model_registry (model_family, status, created_at DESC);

CREATE UNIQUE INDEX idx_ml_model_one_active_per_family
	ON ml_model_registry (model_family)
	WHERE status = 'ACTIVE';

-- +goose Down
DROP INDEX idx_ml_model_one_active_per_family;
DROP INDEX idx_ml_model_family_status;
DROP TABLE ml_model_registry;
