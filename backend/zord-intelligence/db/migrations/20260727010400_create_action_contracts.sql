-- +goose Up
CREATE TABLE action_contracts (
	action_id        TEXT         PRIMARY KEY,
	tenant_id        TEXT         NOT NULL,
	policy_id        TEXT         NOT NULL,
	policy_version   INT          NOT NULL,
	scope_refs       JSONB        NOT NULL,
	input_refs_json  JSONB        NOT NULL,
	decision         TEXT         NOT NULL,
	CHECK (decision IN (
		'ALLOW',
		'ESCALATE',
		'NOTIFY',
		'HOLD',
		'RETRY',
		'GENERATE_EVIDENCE',
		'OPEN_OPS_INCIDENT',
		'ADVISORY_RECOMMENDATION',
		'PREPARE_AND_SIGN_RECOMMENDED',
		'DISPATCH_MODE_RECOMMENDED',
		'REQUEST_SOURCE_PATCH',
		'REVIEW_AMBIGUOUS_BATCH',
		'REGENERATE_EVIDENCE',
		'REQUEST_STRONGER_CARRIER_CONTRACT'
	)),
	confidence       NUMERIC(4,3) NOT NULL,
	CHECK (confidence >= 0 AND confidence <= 1),
	payload_json     JSONB        NOT NULL,
	reason_codes_json JSONB,
	-- Corrective action report (2026-07-23) P0-07: named integrity_digest, not
	-- "signature" -- today this is always a plain DevSigner SHA-256 digest
	-- with no authenticity property; see signature_algorithm below (always
	-- 'DEV_SHA256' today) and signature_verification_status (always
	-- 'UNVERIFIED' -- no verification endpoint exists yet).
	integrity_digest TEXT         NOT NULL,
	idempotency_key  TEXT         NOT NULL UNIQUE,
	expires_at       TIMESTAMPTZ,
	contract_status  TEXT         NOT NULL DEFAULT 'ACTIVE'
	                 CHECK (contract_status IN (
	                     'ACTIVE',
	                     'PENDING_APPROVAL',
	                     'APPROVED',
	                     'DISMISSED',
	                     'EXPIRED'
	                 )),
	policy_family    TEXT,
	severity         TEXT,
	created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
	policy_registry_id UUID,
	policy_source    TEXT,
	policy_digest    TEXT,
	scope_type       TEXT,
	scope_ref        TEXT,
	trigger_event_id TEXT,
	trigger_event_source TEXT,
	trigger_event_type TEXT,
	trigger_event_version TEXT,
	input_facts_hash TEXT,
	payload_hash     TEXT,
	payload_schema_version TEXT DEFAULT 'legacy',
	mapping_profile_id TEXT,
	mapping_profile_version TEXT,
	mapping_profile_hash TEXT,
	signature_algorithm TEXT,
	signature_key_id TEXT,
	signature_payload_hash TEXT,
	canonicalization_version TEXT,
	signed_at        TIMESTAMPTZ,
	signature_verification_status TEXT DEFAULT 'UNVERIFIED'
);

CREATE INDEX idx_ac_tenant_created
	ON action_contracts (tenant_id, created_at DESC);

CREATE INDEX idx_ac_scope_refs
	ON action_contracts USING GIN (scope_refs);

CREATE INDEX idx_ac_policy
	ON action_contracts (policy_id, tenant_id, created_at DESC);

CREATE INDEX idx_ac_pending_approval
	ON action_contracts (tenant_id, created_at DESC)
	WHERE contract_status = 'PENDING_APPROVAL';

CREATE INDEX idx_ac_expired
	ON action_contracts (expires_at ASC)
	WHERE contract_status = 'PENDING_APPROVAL'
	AND   expires_at IS NOT NULL;

CREATE INDEX idx_ac_family_created
	ON action_contracts (tenant_id, policy_family, created_at DESC)
	WHERE policy_family IS NOT NULL;

CREATE INDEX idx_ac_severity_status
	ON action_contracts (tenant_id, severity, contract_status)
	WHERE severity IS NOT NULL;

CREATE INDEX idx_ac_status_created
	ON action_contracts (contract_status, created_at DESC);

CREATE INDEX idx_ac_scope_type_ref
	ON action_contracts (tenant_id, scope_type, scope_ref, created_at DESC);

CREATE INDEX idx_ac_policy_registry
	ON action_contracts (policy_registry_id);

-- INTEL-02: append-only audit trail for action approve/dismiss decisions.
-- action_contracts above is immutable by design (only contract_status may
-- change) so actor/reason/prior-state facts live in their own table rather
-- than as columns bolted onto that row — same shape as policy_activations.
CREATE TABLE action_contract_decisions (
	decision_id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
	action_id              TEXT         NOT NULL REFERENCES action_contracts(action_id),
	tenant_id              TEXT         NOT NULL,
	decision               TEXT         NOT NULL
	                       CHECK (decision IN ('APPROVED', 'DISMISSED')),
	actor_subject_id       TEXT         NOT NULL,
	actor_roles            TEXT,
	reason                 TEXT,
	-- Status immediately before this decision — always 'PENDING_APPROVAL'
	-- today (the only state approve/dismiss can transition out of), captured
	-- as TEXT rather than hardcoded so a future additional transition path
	-- doesn't require a migration to represent it.
	prior_contract_status  TEXT         NOT NULL,
	-- action_contracts.integrity_digest at decision time -- "prior hash":
	-- self-contained proof of exactly which immutable contract version was
	-- acted on, independent of anything that changes on the parent row later.
	prior_integrity_digest TEXT         NOT NULL,
	decided_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_contract_decisions_action
	ON action_contract_decisions (action_id, decided_at DESC);

CREATE INDEX idx_action_contract_decisions_tenant
	ON action_contract_decisions (tenant_id, decided_at DESC);

-- +goose Down
DROP INDEX idx_action_contract_decisions_tenant;
DROP INDEX idx_action_contract_decisions_action;
DROP TABLE action_contract_decisions;
DROP INDEX idx_ac_policy_registry;
DROP INDEX idx_ac_scope_type_ref;
DROP INDEX idx_ac_status_created;
DROP INDEX idx_ac_severity_status;
DROP INDEX idx_ac_family_created;
DROP INDEX idx_ac_expired;
DROP INDEX idx_ac_pending_approval;
DROP INDEX idx_ac_policy;
DROP INDEX idx_ac_scope_refs;
DROP INDEX idx_ac_tenant_created;
DROP TABLE action_contracts;
