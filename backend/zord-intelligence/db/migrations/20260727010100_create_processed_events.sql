-- +goose Up
CREATE TABLE processed_events (
	tenant_id    TEXT        NOT NULL,
	event_id     TEXT        NOT NULL,
	PRIMARY KEY (tenant_id, event_id),
	processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_processed_events_at
	ON processed_events (processed_at DESC);

-- +goose Down
DROP INDEX idx_processed_events_at;
DROP TABLE processed_events;
