-- +goose Up
CREATE TABLE mapping_profiles (
    profile_id TEXT PRIMARY KEY,
    profile_version TEXT NOT NULL DEFAULT '1.0.0',
    tenant_id UUID,
    tenant_name TEXT NOT NULL DEFAULT '',
    source_vendor TEXT NOT NULL DEFAULT '',
    source_system TEXT NOT NULL DEFAULT '',
    artifact_family TEXT NOT NULL DEFAULT 'LIVE_INTENT_JSON',
    file_format TEXT NOT NULL DEFAULT 'json',
    delimiter TEXT NOT NULL DEFAULT ',',
    header_row_index INT NOT NULL DEFAULT 0,
    mapping_strategy TEXT NOT NULL DEFAULT 'column_map',
    column_map JSONB NOT NULL DEFAULT '{}',
    amount_format TEXT NOT NULL DEFAULT 'DECIMAL',
    date_format TEXT NOT NULL DEFAULT '2006-01-02',
    default_currency TEXT NOT NULL DEFAULT 'INR',
    default_intent_type TEXT NOT NULL DEFAULT 'PAYOUT',
    source_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    strict_required_fields_json JSONB NOT NULL DEFAULT '[]',
    soft_inferable_fields_json JSONB NOT NULL DEFAULT '[]',
    field_kind_policy_json JSONB NOT NULL DEFAULT '{}',
    sensitive_field_policy_json JSONB NOT NULL DEFAULT '{}',
    output_entity_family TEXT NOT NULL DEFAULT 'INTENT',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT '',
    UNIQUE (tenant_id, source_system, artifact_family, profile_version)
);

CREATE INDEX idx_mapping_profiles_tenant_source
    ON mapping_profiles (tenant_id, source_system)
    WHERE status = 'active';

-- +goose Down
DROP INDEX idx_mapping_profiles_tenant_source;
DROP TABLE mapping_profiles;
