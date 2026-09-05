-- +goose Up
CREATE TABLE policy_definitions (
	policy_registry_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id                TEXT,
	policy_key               TEXT         NOT NULL,
	policy_version           INT          NOT NULL,
	policy_source            TEXT         NOT NULL DEFAULT 'zpi_seed',
	policy_source_ref        TEXT,
	policy_source_version    TEXT,
	policy_family            TEXT,
	scope_type               TEXT         NOT NULL,
	trigger_type             TEXT         NOT NULL,
	trigger_value            TEXT         NOT NULL,
	dsl                      TEXT         NOT NULL,
	policy_digest            TEXT         NOT NULL,
	severity                 TEXT,
	requires_manual_approval BOOLEAN      NOT NULL DEFAULT false,
	created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
	-- Corrective action report (2026-07-23) P0-06: plain UNIQUE lets Postgres
	-- treat every NULL tenant_id (global policies) as distinct from every
	-- other, so two global definitions for the same key/version/source could
	-- silently coexist. NULLS NOT DISTINCT (PG15+; PG16 confirmed in use via
	-- docker-compose.yml) closes that gap.
	UNIQUE NULLS NOT DISTINCT (tenant_id, policy_key, policy_version, policy_source)
);

CREATE INDEX idx_policy_def_trigger
	ON policy_definitions (policy_family, trigger_type, trigger_value, policy_source, policy_version);

CREATE INDEX idx_policy_def_key
	ON policy_definitions (tenant_id, policy_key, policy_version DESC);

-- +goose Down
DROP INDEX idx_policy_def_key;
DROP INDEX idx_policy_def_trigger;
DROP TABLE policy_definitions;
