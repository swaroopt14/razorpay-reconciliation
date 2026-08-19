-- +goose Up
CREATE TABLE ml_training_tenant_policies (
	policy_id                    TEXT        PRIMARY KEY,
	tenant_id                    TEXT        NOT NULL UNIQUE,
	tenant_models_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
	global_training_opt_in       BOOLEAN     NOT NULL DEFAULT FALSE,
	allowed_feature_families     TEXT[]      NOT NULL DEFAULT '{}',
	aggregate_features_only      BOOLEAN     NOT NULL DEFAULT TRUE,
	minimum_sample_count         INTEGER     NOT NULL DEFAULT 25
		CHECK (minimum_sample_count > 0),
	approved_by                  TEXT        NOT NULL,
	updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
	CHECK (NOT global_training_opt_in OR aggregate_features_only)
);

CREATE TABLE ml_training_manifests (
	manifest_id                  TEXT        PRIMARY KEY,
	model_name                   TEXT        NOT NULL,
	feature_family               TEXT        NOT NULL,
	training_scope               TEXT        NOT NULL
		CHECK (training_scope IN ('GLOBAL', 'TENANT')),
	tenant_id                    TEXT,
	included_policy_ids          JSONB       NOT NULL,
	included_tenant_count        INTEGER     NOT NULL CHECK (included_tenant_count > 0),
	training_row_count           INTEGER     NOT NULL CHECK (training_row_count > 0),
	minimum_sample_count         INTEGER     NOT NULL CHECK (minimum_sample_count > 0),
	aggregate_features_only      BOOLEAN     NOT NULL,
	feature_names                JSONB       NOT NULL,
	label_names                  JSONB       NOT NULL,
	policy_snapshot_digest       CHAR(64)    NOT NULL,
	window_start                 TIMESTAMPTZ,
	window_end                   TIMESTAMPTZ,
	created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
	CHECK (
		(training_scope = 'GLOBAL' AND tenant_id IS NULL)
		OR (training_scope = 'TENANT' AND tenant_id IS NOT NULL)
	)
);

CREATE INDEX idx_ml_training_manifests_model_created
	ON ml_training_manifests (model_name, created_at DESC);

-- +goose Down
DROP INDEX idx_ml_training_manifests_model_created;
DROP TABLE ml_training_manifests;
DROP TABLE ml_training_tenant_policies;
