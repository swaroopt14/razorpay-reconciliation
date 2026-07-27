-- +goose Up
CREATE TABLE policy_activations (
	policy_activation_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id            TEXT,
	policy_registry_id   UUID         NOT NULL REFERENCES policy_definitions(policy_registry_id),
	enabled              BOOLEAN      NOT NULL DEFAULT false,
	effective_from       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	effective_to         TIMESTAMPTZ,
	activated_by         TEXT,
	created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_activations_lookup
	ON policy_activations (tenant_id, policy_registry_id, created_at DESC);

CREATE INDEX idx_policy_activations_enabled
	ON policy_activations (policy_registry_id, enabled, effective_from, effective_to)
	WHERE enabled = true;

-- +goose Down
DROP INDEX idx_policy_activations_enabled;
DROP INDEX idx_policy_activations_lookup;
DROP TABLE policy_activations;
