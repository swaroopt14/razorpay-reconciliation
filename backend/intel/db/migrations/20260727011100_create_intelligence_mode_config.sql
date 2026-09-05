-- +goose Up
CREATE TABLE intelligence_mode_config (
	id           BIGSERIAL    PRIMARY KEY,
	mode         TEXT         NOT NULL,
	CHECK (mode IN ('GRADE_A', 'GRADE_B')),
	is_current   BOOLEAN      NOT NULL DEFAULT true,
	started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	ended_at     TIMESTAMPTZ,
	initiated_by TEXT         NOT NULL DEFAULT 'system',
	notes        TEXT,
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_mode_config_current
	ON intelligence_mode_config (is_current, started_at DESC)
	WHERE is_current = true;

CREATE INDEX idx_mode_config_history
	ON intelligence_mode_config (started_at DESC);

INSERT INTO intelligence_mode_config (mode, is_current, initiated_by, notes)
SELECT 'GRADE_A', true, 'system', 'Default mode — Attachment Intelligence Mode on initial deployment'
WHERE NOT EXISTS (SELECT 1 FROM intelligence_mode_config WHERE is_current = true);

-- +goose Down
DROP INDEX idx_mode_config_history;
DROP INDEX idx_mode_config_current;
DROP TABLE intelligence_mode_config;
