-- +goose Up
CREATE TABLE poll_schedule(
	contract_id UUID PRIMARY KEY,
	dispatch_id UUID NOT NULL,
	next_poll_at TIMESTAMPTZ NOT NULL,
	poll_stage INT NOT NULL,
	last_poll_at TIMESTAMPTZ,
	poll_failures INT NOT NULL DEFAULT 0,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL
);

-- +goose Down
DROP TABLE poll_schedule;
