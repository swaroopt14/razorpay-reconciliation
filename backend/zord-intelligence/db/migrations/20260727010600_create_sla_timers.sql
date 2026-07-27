-- +goose Up
CREATE TABLE sla_timers (
	id           BIGSERIAL    PRIMARY KEY,
	intent_id    TEXT         NOT NULL,
	tenant_id    TEXT         NOT NULL,
	corridor_id  TEXT         NOT NULL,
	sla_deadline TIMESTAMPTZ  NOT NULL,
	status       TEXT         NOT NULL DEFAULT 'ACTIVE',
	CHECK (status IN ('ACTIVE', 'RESOLVED', 'BREACHED')),
	resolved_at  TIMESTAMPTZ,
	notified_at  TIMESTAMPTZ,
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
	CONSTRAINT uq_sla_intent UNIQUE (tenant_id, intent_id)
);

CREATE INDEX idx_sla_active_deadline
	ON sla_timers (tenant_id, sla_deadline ASC)
	WHERE status = 'ACTIVE';

-- +goose Down
DROP INDEX idx_sla_active_deadline;
DROP TABLE sla_timers;
