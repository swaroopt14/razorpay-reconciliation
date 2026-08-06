-- +goose Up
CREATE TABLE IF NOT EXISTS "artifacts"(
artifact_id UUID NOT NULL ,
artifact_version_id UUID NOT NULL,
tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
file_hash TEXT NOT NULL,
file_name TEXT NOT NULL,
file_size_bytes BIGINT NOT NULL,
row_count_estimate TEXT,
object_ref TEXT NOT NULL,
batch_id TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT now()
);

-- +goose Down
DROP TABLE IF NOT EXISTS "artifacts";