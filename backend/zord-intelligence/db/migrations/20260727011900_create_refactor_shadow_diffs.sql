-- +goose Up
CREATE TABLE refactor_shadow_diffs (
	diff_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id       TEXT         NOT NULL,
	scope_type      TEXT         NOT NULL,
	scope_ref       TEXT         NOT NULL,
	diff_family     TEXT         NOT NULL,
	old_payload_hash TEXT,
	new_payload_hash TEXT,
	diff_json       JSONB,
	severity        TEXT         NOT NULL,
	detected_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
	resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_shadow_diffs_unresolved
	ON refactor_shadow_diffs (tenant_id, detected_at DESC)
	WHERE resolved_at IS NULL;

-- +goose Down
DROP INDEX idx_shadow_diffs_unresolved;
DROP TABLE refactor_shadow_diffs;
