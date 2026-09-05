-- +goose Up
CREATE TABLE IF NOT EXISTS "ingress_envelopes" (
    trace_id UUID NOT NULL,
    envelope_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    artifact_id UUID NOT NULL,
    artifact_version_id TEXT NOT NULL,
    ingress_channel TEXT NOT NULL,
    source_class TEXT NOT NULL,
    source_system TEXT NOT NULL,
    content_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_size INT NOT NULL,
    payload_hash TEXT NOT NULL,
    envelope_hash TEXT NOT NULL,
    envelope_signature TEXT NOT NULL,
    vault_object_ref TEXT,
    request_headers_hash TEXT,
    schema_hint TEXT,
    mapping_profile_hint TEXT,
    object_encryption_alg TEXT,
    kms_key_version TEXT,
    parser_classification TEXT,
    transport_request_id TEXT,
    client_reference_hint TEXT,
    source_system_hint TEXT,
    ingress_api_version TEXT,
    retention_policy_class TEXT,
    webhook_provider_id TEXT,
    connector_binding_id TEXT,
    encryption_key_id TEXT,
    object_store_version TEXT,
    idempotency_reservation_status TEXT,
    principal_id UUID,
    auth_method TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    file_name TEXT,
    file_size_bytes BIGINT,
    file_content_hash TEXT,
    row_count_estimate INT,
    file_upload_channel TEXT,
    source_row_ref TEXT,
    batchid TEXT,
    raw_row_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_raw_env_tenant_time
    ON ingress_envelopes (tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_env_status
    ON ingress_envelopes (status, received_at);

CREATE INDEX IF NOT EXISTS idx_ingress_envelopes_batchid
    ON ingress_envelopes (tenant_id, batchid) WHERE batchid IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_ingress_envelopes_batchid;
DROP INDEX IF EXISTS idx_raw_env_status;
DROP INDEX IF EXISTS idx_raw_env_tenant_time;
DROP TABLE IF EXISTS "ingress_envelopes";
