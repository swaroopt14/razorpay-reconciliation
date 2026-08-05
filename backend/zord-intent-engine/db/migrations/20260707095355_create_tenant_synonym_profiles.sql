-- +goose Up
CREATE TABLE tenant_synonym_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    source_key TEXT NOT NULL,
    canonical_path TEXT NOT NULL,
    match_method TEXT NOT NULL DEFAULT 'exact',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, source_key)
);

-- +goose Down
DROP TABLE tenant_synonym_profiles;
