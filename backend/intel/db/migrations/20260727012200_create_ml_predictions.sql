-- +goose Up
CREATE TABLE ml_predictions (
	prediction_id      TEXT        PRIMARY KEY,
	tenant_id          TEXT        NOT NULL,
	model_id           TEXT        NOT NULL,
	scope_type         TEXT        NOT NULL
		CHECK (scope_type IN ('INTENT','BATCH','PROVIDER','CORRIDOR','SOURCE_SYSTEM','TENANT')),
	scope_ref          TEXT        NOT NULL,
	prediction_family  TEXT        NOT NULL
		CHECK (prediction_family IN ('LEAKAGE','AMBIGUITY','DEFENSIBILITY','PATTERN','RECOMMENDATION')),
	prediction_value   TEXT        NOT NULL,
	prediction_score   FLOAT       NOT NULL,
	confidence         FLOAT       NOT NULL DEFAULT 1.0,
	feature_row_id     TEXT,
	explanation_json   JSONB,
	snapshot_id        TEXT,
	created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ml_predictions_tenant_family
	ON ml_predictions (tenant_id, prediction_family, created_at DESC);

CREATE INDEX idx_ml_predictions_scope
	ON ml_predictions (tenant_id, scope_type, scope_ref, prediction_family, created_at DESC);

-- +goose Down
DROP INDEX idx_ml_predictions_scope;
DROP INDEX idx_ml_predictions_tenant_family;
DROP TABLE ml_predictions;
