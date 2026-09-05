-- +goose Up
-- key_rotation_jobs (TOK-07): explicit job state for cross-replica key
-- rotation coordination. Purely observational -- dashboards/incident review
-- only. This table must NEVER be used as a second mutex (checking for an
-- existing RUNNING row to decide whether to proceed): a crashed process
-- would leave its row stuck RUNNING forever, which is exactly the
-- uncoordinated-rotation bug TOK-07 exists to fix. The actual correctness
-- guarantee is the Postgres advisory lock (see internal/repository/
-- token_repo.go's RotateKey and rotation_lock.go's TryAcquireTenantRotationLock)
-- -- this table only records what happened, it never gates what happens next.
CREATE TABLE IF NOT EXISTS key_rotation_jobs (
    job_id       UUID        PRIMARY KEY,
    tenant_id    UUID        NOT NULL,
    job_type     TEXT        NOT NULL,              -- 'ROTATE' or 'MIGRATE'
    status       TEXT        NOT NULL DEFAULT 'RUNNING', -- RUNNING, DONE, FAILED, SKIPPED
    old_key_id   TEXT,
    new_key_id   TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    replica_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_jobs_tenant
ON key_rotation_jobs(tenant_id, started_at DESC);

-- +goose Down
DROP TABLE IF EXISTS key_rotation_jobs;
