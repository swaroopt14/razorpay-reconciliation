-- +goose Up
CREATE TABLE batch_contracts_core (
	batch_contract_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id             TEXT         NOT NULL,
	external_batch_id     TEXT         NOT NULL,
	source_reference      TEXT,
	source_system         TEXT,
	batch_currency        CHAR(3)      NOT NULL DEFAULT 'INR',
	processing_status     TEXT NOT NULL DEFAULT 'PROCESSING',
	reconciliation_status TEXT NOT NULL DEFAULT 'UNKNOWN',
	review_status         TEXT NOT NULL DEFAULT 'NONE',
	closure_status        TEXT NOT NULL DEFAULT 'OPEN',
	created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
	last_updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	UNIQUE (tenant_id, external_batch_id)
);

CREATE INDEX idx_batch_contracts_core_tenant
	ON batch_contracts_core (tenant_id, created_at DESC);

CREATE INDEX idx_batch_core_tenant_status
	ON batch_contracts_core (tenant_id, reconciliation_status, closure_status, last_updated_at DESC);

-- +goose Down
DROP INDEX idx_batch_core_tenant_status;
DROP INDEX idx_batch_contracts_core_tenant;
DROP TABLE batch_contracts_core;
