-- +goose Up
CREATE TABLE canonical_settlement_observations(
	settlement_observation_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID,
	settlement_envelope_id UUID NOT NULL,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_row_ref TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	observation_kind TEXT NOT NULL,
	source_strength_class TEXT NOT NULL,
	client_reference_candidate TEXT,
	provider_reference TEXT,
	bank_id TEXT,
	bank_reference TEXT,
	external_reference TEXT,
	batch_reference TEXT,
	merchant_id_token TEXT,
	seller_id_token TEXT,
	vendor_id_token TEXT,
	amount NUMERIC(20,2) NOT NULL,
	settled_amount NUMERIC(20,2),
	fee_amount NUMERIC(20,2),
	deduction_amount NUMERIC(20,2),
	currency_code TEXT NOT NULL,
	settlement_status TEXT NOT NULL,
	provider_status_code TEXT,
	failure_reason_code TEXT,
	retry_flag BOOLEAN NOT NULL DEFAULT FALSE,
	reversal_flag BOOLEAN NOT NULL DEFAULT FALSE,
	return_flag BOOLEAN NOT NULL DEFAULT FALSE,
	observation_timestamp TIMESTAMPTZ NOT NULL,
	value_date DATE,
	provider_ref_status TEXT NOT NULL,
	provider_ref_first_seen_at TIMESTAMPTZ,
	provider_ref_last_seen_at TIMESTAMPTZ,
	provider_ref_source_set JSONB,
	provider_ref_consistency_flag BOOLEAN,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	parse_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	mapping_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	carrier_richness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	attachment_readiness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	score_breakdown_json JSONB,
	score_reason_codes_json JSONB,
	score_version TEXT,
	canonical_hash TEXT NOT NULL,
	canonical_snapshot_ref TEXT,
	client_batch_id TEXT,
	source_strength TEXT,
	source_type TEXT,
	source_system_id TEXT,
	corridor_id TEXT,
	beneficiary_fingerprint TEXT,
	zord_signature_carrier TEXT,
	warnings_json JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX canonical_settlement_observations_tenant_idx ON canonical_settlement_observations(tenant_id);
CREATE INDEX canonical_obs_run_idx ON canonical_settlement_observations(ingest_run_id);
CREATE INDEX canonical_obs_tenant_run_idx ON canonical_settlement_observations(tenant_id, ingest_run_id);
CREATE INDEX canonical_obs_batch_idx ON canonical_settlement_observations(settlement_batch_id);
CREATE INDEX canonical_obs_tenant_client_ref_lower_idx ON canonical_settlement_observations(tenant_id, LOWER(client_reference_candidate)) WHERE client_reference_candidate IS NOT NULL;
CREATE INDEX canonical_obs_tenant_batch_ref_lower_idx ON canonical_settlement_observations(tenant_id, LOWER(batch_reference)) WHERE batch_reference IS NOT NULL;
CREATE INDEX canonical_obs_tenant_client_batch_id_lower_idx ON canonical_settlement_observations(tenant_id, LOWER(client_batch_id)) WHERE client_batch_id IS NOT NULL AND client_batch_id <> '';
CREATE INDEX canonical_obs_tenant_curr_amt_ts_idx ON canonical_settlement_observations(tenant_id, currency_code, amount, observation_timestamp);
CREATE INDEX canonical_settlement_observations_envelope_idx ON canonical_settlement_observations(settlement_envelope_id);
CREATE INDEX canonical_settlement_observations_trace_idx ON canonical_settlement_observations(trace_id);

-- +goose Down
DROP INDEX canonical_settlement_observations_trace_idx;
DROP INDEX canonical_settlement_observations_envelope_idx;
DROP INDEX canonical_obs_tenant_curr_amt_ts_idx;
DROP INDEX canonical_obs_tenant_client_batch_id_lower_idx;
DROP INDEX canonical_obs_tenant_batch_ref_lower_idx;
DROP INDEX canonical_obs_tenant_client_ref_lower_idx;
DROP INDEX canonical_obs_batch_idx;
DROP INDEX canonical_obs_tenant_run_idx;
DROP INDEX canonical_obs_run_idx;
DROP INDEX canonical_settlement_observations_tenant_idx;
DROP TABLE canonical_settlement_observations;
