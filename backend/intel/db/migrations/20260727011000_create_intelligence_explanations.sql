-- +goose Up
CREATE TABLE intelligence_explanations (
	explanation_id   TEXT         PRIMARY KEY,
	tenant_id        TEXT         NOT NULL,
	snapshot_id      TEXT         NOT NULL
	                              REFERENCES intelligence_snapshots(snapshot_id)
	                              ON DELETE CASCADE,
	explanation_type TEXT         NOT NULL,
	CHECK (explanation_type IN (
		'RCA_SUMMARY',
		'LEAKAGE_NARRATIVE',
		'AMBIGUITY_SUMMARY',
		'ACTION_JUSTIFICATION',
		'DEFENSIBILITY_REPORT',
		'BATCH_RISK_EXPLANATION'
	)),
	input_refs_json  JSONB        NOT NULL DEFAULT '[]'::jsonb,
	explanation_text TEXT         NOT NULL,
	model_version    TEXT         NOT NULL DEFAULT 'deterministic_v1',
	created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_expl_snapshot
	ON intelligence_explanations (snapshot_id, created_at DESC);

CREATE INDEX idx_expl_tenant_type
	ON intelligence_explanations (tenant_id, explanation_type, created_at DESC);

-- +goose Down
DROP INDEX idx_expl_tenant_type;
DROP INDEX idx_expl_snapshot;
DROP TABLE intelligence_explanations;
