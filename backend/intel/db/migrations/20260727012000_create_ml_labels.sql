-- +goose Up
CREATE TABLE ml_labels (
	label_id         TEXT        PRIMARY KEY,
	tenant_id        TEXT        NOT NULL,
	scope_type       TEXT        NOT NULL
		CHECK (scope_type IN ('INTENT','BATCH','PROVIDER','CORRIDOR','SOURCE_SYSTEM','TENANT')),
	scope_ref        TEXT        NOT NULL,
	label_family     TEXT        NOT NULL
		CHECK (label_family IN ('LEAKAGE','AMBIGUITY','FAILURE','DUPLICATE','SLA_BREACH','DEFENSIBILITY')),
	label_value      FLOAT       NOT NULL,
	label_confidence FLOAT       NOT NULL DEFAULT 1.0,
	label_source     TEXT        NOT NULL,
	source_refs_json JSONB,
	feature_row_id   TEXT,
	created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ml_labels_tenant_family
	ON ml_labels (tenant_id, label_family, created_at DESC);

CREATE INDEX idx_ml_labels_scope
	ON ml_labels (tenant_id, scope_type, scope_ref, label_family);

-- +goose Down
DROP INDEX idx_ml_labels_scope;
DROP INDEX idx_ml_labels_tenant_family;
DROP TABLE ml_labels;
