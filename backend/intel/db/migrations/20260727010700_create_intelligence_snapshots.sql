-- +goose Up
CREATE TABLE intelligence_snapshots (
	snapshot_id         TEXT         PRIMARY KEY,
	tenant_id           TEXT         NOT NULL,
	snapshot_type       TEXT         NOT NULL,
	CHECK (snapshot_type IN (
		'LEAKAGE',
		'AMBIGUITY',
		'DEFENSIBILITY',
		'RCA',
		'RCA_CLUSTER',
		'PATTERN',
		'RECOMMENDATION'
	)),
	scope_type          TEXT         NOT NULL,
	CHECK (scope_type IN ('TENANT', 'BATCH', 'CORRIDOR', 'PSP', 'SOURCE', 'INTENT')),
	scope_ref           TEXT,
	window_start        TIMESTAMPTZ  NOT NULL,
	window_end          TIMESTAMPTZ  NOT NULL,
	projection_refs_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
	snapshot_json       JSONB        NOT NULL,
	model_version       TEXT,
	created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_snap_tenant_type_window
	ON intelligence_snapshots (tenant_id, snapshot_type, window_end DESC);

CREATE INDEX idx_snap_scope
	ON intelligence_snapshots (tenant_id, scope_type, scope_ref, window_end DESC)
	WHERE scope_ref IS NOT NULL;

CREATE INDEX idx_snap_tenant_type_recent
	ON intelligence_snapshots (tenant_id, snapshot_type, created_at DESC)
	WHERE snapshot_type IN ('LEAKAGE', 'AMBIGUITY', 'DEFENSIBILITY', 'RCA', 'PATTERN', 'RECOMMENDATION');

CREATE INDEX idx_snap_latest_by_type
	ON intelligence_snapshots (tenant_id, snapshot_type, scope_type, created_at DESC);

CREATE INDEX idx_snapshots_latest
	ON intelligence_snapshots (tenant_id, snapshot_type, created_at DESC);

CREATE INDEX idx_intelligence_snapshots_rca_cluster
	ON intelligence_snapshots (tenant_id, snapshot_type, scope_type, scope_ref, created_at DESC)
	WHERE snapshot_type = 'RCA_CLUSTER';

-- +goose Down
DROP INDEX idx_intelligence_snapshots_rca_cluster;
DROP INDEX idx_snapshots_latest;
DROP INDEX idx_snap_latest_by_type;
DROP INDEX idx_snap_tenant_type_recent;
DROP INDEX idx_snap_scope;
DROP INDEX idx_snap_tenant_type_window;
DROP TABLE intelligence_snapshots;
