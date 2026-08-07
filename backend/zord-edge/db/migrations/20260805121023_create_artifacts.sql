-- +goose Up
CREATE TABLE IF NOT EXISTS "artifacts"(
artifact_version_id UUID PRIMARY KEY,
artifact_id UUID NOT NULL ,
file_envelope_id UUID ,
tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
file_hash TEXT NOT NULL,
file_name TEXT NOT NULL,
file_size_bytes BIGINT NOT NULL,
row_count_estimate INT,
object_ref TEXT ,
batch_id TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'PROCESSING',
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT unq_artifact_tenat_batch UNIQUE (tenant_id,batch_id)
);

CREATE INDEX idx_artifacts_artifact_id ON artifacts (artifact_id);
CREATE INDEX idx_artifacts_tenant_hash ON artifacts (tenant_id, file_hash);

-- +goose Down
DROP INDEX IF EXISTS idx_artifacts_tenant_hash;
DROP INDEX IF EXISTS idx_artifacts_artifact_id;
DROP TABLE IF EXISTS artifacts;