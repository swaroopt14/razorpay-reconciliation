-- +goose Up
CREATE TABLE normalized_ingest_records (
    nir_id UUID PRIMARY KEY,
    envelope_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    detected_format TEXT,
    profile_id TEXT,
    profile_version TEXT,
    fields_json JSONB,
    field_confidence_summary JSONB,
    unmapped_json JSONB,
    mapping_uncertain_flag BOOLEAN,
    required_field_gap_count INT,
    low_confidence_field_count INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nirs_tenant_id ON normalized_ingest_records(tenant_id);
CREATE INDEX idx_nirs_envelope_id ON normalized_ingest_records(envelope_id);

-- +goose Down
DROP INDEX idx_nirs_envelope_id;
DROP INDEX idx_nirs_tenant_id;
DROP TABLE normalized_ingest_records;
