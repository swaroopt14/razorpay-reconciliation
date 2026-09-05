-- +goose Up
-- intent_ingest_runs.batch_id was globally UNIQUE, but batch_id is client-supplied
-- and only meaningful per tenant. Two tenants uploading a batch with the same name
-- would collide on the same run row. Re-scope uniqueness to (tenant_id, batch_id).
ALTER TABLE intent_ingest_runs DROP CONSTRAINT IF EXISTS intent_ingest_runs_batch_id_key;
ALTER TABLE intent_ingest_runs ADD CONSTRAINT intent_ingest_runs_tenant_batch_unique UNIQUE (tenant_id, batch_id);

-- +goose Down
ALTER TABLE intent_ingest_runs DROP CONSTRAINT IF EXISTS intent_ingest_runs_tenant_batch_unique;
ALTER TABLE intent_ingest_runs ADD CONSTRAINT intent_ingest_runs_batch_id_key UNIQUE (batch_id);
