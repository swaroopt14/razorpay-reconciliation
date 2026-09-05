-- +goose Up
CREATE TABLE processed_finality (
	tenant_id      TEXT        NOT NULL,
	certificate_id TEXT        NOT NULL,
	processed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (tenant_id, certificate_id)
);

CREATE INDEX idx_processed_finality_at
	ON processed_finality (processed_at DESC);

-- +goose Down
DROP INDEX idx_processed_finality_at;
DROP TABLE processed_finality;
