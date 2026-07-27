-- +goose Up
CREATE TABLE projection_state (
	id                 BIGSERIAL    PRIMARY KEY,
	tenant_id          TEXT         NOT NULL,
	projection_key     TEXT         NOT NULL,
	window_start       TIMESTAMPTZ  NOT NULL,
	window_end         TIMESTAMPTZ  NOT NULL,
	value_json         JSONB        NOT NULL,
	computed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
	projection_version INT          NOT NULL DEFAULT 1,
	projection_family  TEXT,
	entity_scope_type  TEXT,
	entity_scope_ref   TEXT,
	source_refs_json   JSONB,
	freshness_ts       TIMESTAMPTZ,
	scope_type         TEXT,
	scope_ref          TEXT,
	metric_key         TEXT,
	window_type        TEXT,
	projection_source  TEXT,
	projection_source_version TEXT,
	value_hash         TEXT,
	source_refs_hash   TEXT,
	retention_class    TEXT DEFAULT 'DERIVED_CACHE',
	expires_at         TIMESTAMPTZ,
	CONSTRAINT uq_projection
		UNIQUE (tenant_id, projection_key, window_start, projection_version)
);

CREATE INDEX idx_proj_tenant_key
	ON projection_state (tenant_id, projection_key, window_end DESC);

CREATE INDEX idx_proj_family_scope
	ON projection_state (tenant_id, projection_family, entity_scope_type, entity_scope_ref)
	WHERE projection_family IS NOT NULL;

CREATE UNIQUE INDEX uq_projection_v2
	ON projection_state (
		tenant_id, scope_type, scope_ref, projection_family, metric_key,
		window_type, window_start, projection_source, projection_version
	);

CREATE INDEX idx_projection_scope_family_metric
	ON projection_state (tenant_id, scope_type, scope_ref, projection_family, metric_key);

CREATE INDEX idx_projection_family_window
	ON projection_state (tenant_id, projection_family, window_end DESC);

CREATE INDEX idx_projection_retention_expiry
	ON projection_state (retention_class, expires_at)
	WHERE expires_at IS NOT NULL;

CREATE INDEX idx_proj_key_computed
	ON projection_state (tenant_id, projection_key, computed_at DESC);

CREATE INDEX idx_proj_family_computed
	ON projection_state (tenant_id, projection_family, computed_at DESC)
	WHERE projection_family IS NOT NULL;

CREATE INDEX idx_projection_state_rca_frag
	ON projection_state (tenant_id, projection_key text_pattern_ops)
	WHERE projection_key LIKE 'rca.frag.%';

CREATE OR REPLACE FUNCTION zpi_projection_state_hashes() RETURNS trigger AS $$
BEGIN
	NEW.value_hash := encode(sha256(convert_to(NEW.value_json::text, 'UTF8')), 'hex');
	IF NEW.source_refs_json IS NOT NULL THEN
		NEW.source_refs_hash := encode(sha256(convert_to(NEW.source_refs_json::text, 'UTF8')), 'hex');
	END IF;
	RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projection_state_hashes
	BEFORE INSERT OR UPDATE ON projection_state
	FOR EACH ROW EXECUTE FUNCTION zpi_projection_state_hashes();

-- +goose Down
DROP TRIGGER IF EXISTS trg_projection_state_hashes ON projection_state;
DROP FUNCTION IF EXISTS zpi_projection_state_hashes();
DROP INDEX idx_projection_state_rca_frag;
DROP INDEX idx_proj_family_computed;
DROP INDEX idx_proj_key_computed;
DROP INDEX idx_projection_retention_expiry;
DROP INDEX idx_projection_family_window;
DROP INDEX idx_projection_scope_family_metric;
DROP INDEX uq_projection_v2;
DROP INDEX idx_proj_family_scope;
DROP INDEX idx_proj_tenant_key;
DROP TABLE projection_state;
