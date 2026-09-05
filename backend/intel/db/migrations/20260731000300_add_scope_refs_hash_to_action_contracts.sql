-- +goose Up
-- corrective-action-report P1-06: canonical-JSON SHA-256 of the FULL
-- scope_refs object, additive alongside the existing single-scope
-- scope_type/scope_ref classifier. Nullable, same convention as the other
-- PHASE 5 (refactor) lineage columns on this table (policy_source,
-- policy_digest, etc.) — pre-existing rows (none live today) simply have
-- NULL here.
ALTER TABLE action_contracts
	ADD COLUMN scope_refs_hash TEXT;

-- +goose Down
ALTER TABLE action_contracts
	DROP COLUMN scope_refs_hash;
