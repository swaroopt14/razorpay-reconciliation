-- +goose Up
CREATE TABLE settlement_batches (
	settlement_batch_id TEXT PRIMARY KEY,
	tenant_id UUID NOT NULL,
	psp TEXT NOT NULL,
	client_batch_id TEXT NOT NULL,
	current_active_run_id TEXT,
	latest_run_number INT NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'ACTIVE',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX settlement_batches_tenant_psp_client_uq ON settlement_batches(tenant_id, psp, client_batch_id);
CREATE INDEX settlement_batches_tenant_idx ON settlement_batches(tenant_id);

-- +goose Down
DROP INDEX settlement_batches_tenant_idx;
DROP INDEX settlement_batches_tenant_psp_client_uq;
DROP TABLE settlement_batches;
