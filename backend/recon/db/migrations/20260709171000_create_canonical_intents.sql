-- +goose Up
CREATE TABLE canonical_intents (
	intent_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID,
	contract_id UUID,
	client_payout_ref TEXT,
	client_batch_ref TEXT,
	business_idempotency_key TEXT,
	amount NUMERIC(20,2) NOT NULL,
	currency_code TEXT NOT NULL,
	intended_execution_at TIMESTAMPTZ,
	payout_type TEXT,
	provider_hint TEXT,
	corridor TEXT,
	proof_readiness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	matchability_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	canonical_hash TEXT NOT NULL,
	governance_state TEXT NOT NULL,
	beneficiary_fingerprint TEXT,
	zord_signature_carrier TEXT,
	source_row_num INT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX canonical_intents_tenant_idx ON canonical_intents(tenant_id);
CREATE INDEX canonical_intents_client_ref_idx ON canonical_intents(client_payout_ref) WHERE client_payout_ref IS NOT NULL;
CREATE INDEX canonical_intents_amount_currency_idx ON canonical_intents(tenant_id, amount, currency_code);
CREATE INDEX canonical_intents_client_batch_ref_idx ON canonical_intents(tenant_id, client_batch_ref) WHERE client_batch_ref IS NOT NULL;

-- +goose Down
DROP INDEX canonical_intents_client_batch_ref_idx;
DROP INDEX canonical_intents_amount_currency_idx;
DROP INDEX canonical_intents_client_ref_idx;
DROP INDEX canonical_intents_tenant_idx;
DROP TABLE canonical_intents;
