-- +goose Up

-- Links each row-level audit record back to its parent ingest run — see
-- refactor blueprint ledger item #21 (two audit systems, no shared ID).
-- Nullable: rows written before this migration have no run to point at, and
-- the webhook path never had ingest-run tracking to begin with.
ALTER TABLE intent_ingest_rows
    ADD COLUMN run_id UUID REFERENCES intent_ingest_runs(run_id) ON DELETE SET NULL;
CREATE INDEX idx_iir_run_id ON intent_ingest_rows (run_id);

-- Lets an ETL quality-scoring run trace back to the ingest batch it came
-- from (when the source intent had one — webhook-originated intents won't).
ALTER TABLE etl_ingest_runs
    ADD COLUMN batch_id TEXT;
CREATE INDEX idx_etl_ingest_runs_outbox_event
    ON etl_ingest_runs (outbox_event_id);
CREATE INDEX idx_etl_ingest_runs_tenant_batch
    ON etl_ingest_runs (tenant_id, batch_id)
    WHERE batch_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_etl_ingest_runs_tenant_batch;
DROP INDEX IF EXISTS idx_etl_ingest_runs_outbox_event;
ALTER TABLE etl_ingest_runs DROP COLUMN IF EXISTS batch_id;
DROP INDEX IF EXISTS idx_iir_run_id;
ALTER TABLE intent_ingest_rows DROP COLUMN IF EXISTS run_id;
