-- +goose Up
CREATE TABLE projection_consistency_violations (
	violation_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id         TEXT         NOT NULL,
	projection_family TEXT         NOT NULL,
	metric_key        TEXT         NOT NULL,
	expected_value    NUMERIC,
	actual_value      NUMERIC,
	difference        NUMERIC,
	window_start      TIMESTAMPTZ,
	window_end        TIMESTAMPTZ,
	detected_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	status            TEXT         NOT NULL DEFAULT 'OPEN'
);

CREATE INDEX idx_consistency_violations_open
	ON projection_consistency_violations (tenant_id, detected_at DESC)
	WHERE status = 'OPEN';

-- +goose Down
DROP INDEX idx_consistency_violations_open;
DROP TABLE projection_consistency_violations;
