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

-- Corrective action report (2026-07-23) P0-06: at most one open-ended
-- (currently-effective) interval per policy at a time. idx_policy_activations_enabled
-- above only indexes enabled=true rows and enforces nothing; this partial
-- unique index is the actual constraint, covering both enabled and disabled
-- current states. policy_repo.go's insertActivation closes the prior open
-- row and inserts the new one in a single transaction to satisfy it.
CREATE UNIQUE INDEX uq_policy_activations_open
	ON policy_activations (policy_registry_id)
	WHERE effective_to IS NULL;

-- +goose Down
DROP INDEX uq_policy_activations_open;
DROP INDEX idx_policy_activations_enabled;
DROP INDEX idx_policy_activations_lookup;
DROP TABLE policy_activations;
