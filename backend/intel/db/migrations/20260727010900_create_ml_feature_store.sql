-- +goose Up
CREATE TABLE ml_feature_store (
	feature_row_id TEXT         PRIMARY KEY,
	tenant_id      TEXT         NOT NULL,
	scope_type     TEXT         NOT NULL,
	CHECK (scope_type IN ('INTENT', 'BATCH', 'CORRIDOR', 'TENANT', 'PSP')),
	scope_ref      TEXT         NOT NULL,
	feature_family TEXT         NOT NULL,
	CHECK (feature_family IN ('LEAKAGE', 'AMBIGUITY', 'RCA', 'PATTERN', 'SLA')),
	window_start   TIMESTAMPTZ  NOT NULL,
	window_end     TIMESTAMPTZ  NOT NULL,
	features_json  JSONB        NOT NULL,
	label_json     JSONB,
	model_version  TEXT,
	created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_feat_scope
	ON ml_feature_store (tenant_id, scope_type, scope_ref, feature_family, window_end DESC);

CREATE INDEX idx_feat_unlabeled
	ON ml_feature_store (tenant_id, feature_family, created_at DESC)
	WHERE label_json IS NULL;

-- +goose Down
DROP INDEX idx_feat_unlabeled;
DROP INDEX idx_feat_scope;
DROP TABLE ml_feature_store;
