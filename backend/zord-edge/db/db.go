package db

import (
	"database/sql"
	"log"
)

var DB *sql.DB

func CreateTable() error {

	tenant :=
		`CREATE TABLE IF NOT EXISTS "tenants" (
    tenant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    tenant_name TEXT NOT NULL UNIQUE,                     
    key_prefix  TEXT NOT NULL UNIQUE,                      
    key_hash    TEXT NOT NULL,                             
    is_active   BOOLEAN NOT NULL DEFAULT true,            
    created_at  TIMESTAMPTZ DEFAULT now()                 
	);`
	_, err := DB.Exec(tenant)
	if err != nil {
		log.Fatal(err)
		return err
	}

	idempotencyKeys :=
		`CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	tenant_id UUID NOT NULL,
	idempotency_key TEXT NOT NULL,
	first_envelope_id  UUID NULL,
	status TEXT NOT NULL DEFAULT 'RESERVED',
	request_fingerprint TEXT,
	first_seen_at TIMESTAMPTZ DEFAULT now(),
	last_seen_at TIMESTAMPTZ DEFAULT now(),
	resolution_type TEXT NOT NULL DEFAULT 'CREATED',
	expires_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT now(),
	updated_at TIMESTAMPTZ DEFAULT now(),
	response_snapshot_json TEXT,
	conflict_count INT DEFAULT 0,
	last_conflict_at TIMESTAMPTZ,
	principal_id_first_seen UUID,
	source_class_first_seen TEXT,
	PRIMARY KEY (tenant_id, idempotency_key),
	UNIQUE (tenant_id, idempotency_key)
);`

	_, err = DB.Exec(idempotencyKeys)
	if err != nil {
		log.Fatal(err)
	}

	ingress_envelope :=
		`CREATE TABLE IF NOT EXISTS "ingress_envelopes"(
	trace_id UUID NOT NULL,
	envelope_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	ingress_channel TEXT NOT NULL,
	source_class TEXT NOT NULL,
	source_system TEXT NOT NULL,
	content_type TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	payload_size INT NOT NULL,
	payload_hash TEXT NOT NULL,
	envelope_hash TEXT NOT NULL,
	envelope_signature TEXT NOT NULL,
	vault_object_ref TEXT,
	request_headers_hash TEXT,
	schema_hint TEXT,
	mapping_profile_hint TEXT,
	object_encryption_alg TEXT,
	kms_key_version TEXT,
	parser_classification TEXT,
	transport_request_id TEXT,
	client_reference_hint TEXT,
	source_system_hint TEXT,
	ingress_api_version TEXT,
	retention_policy_class TEXT,
	webhook_provider_id TEXT,
	connector_binding_id TEXT,
	encryption_key_id TEXT,
	object_store_version TEXT,
	idempotency_reservation_status TEXT,
	principal_id UUID,
	auth_method TEXT,
	received_at TIMESTAMPTZ NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	file_name TEXT,
	file_size_bytes BIGINT,
	file_content_hash TEXT,
	row_count_estimate INT,
	file_upload_channel TEXT,
	batchid TEXT
	--error_code TEXT,
    --error_detail TEXT
	);`

	_, err = DB.Exec(ingress_envelope)
	if err != nil {
		log.Fatal(err)
	}

	rawEnvelopeIndexes := `
	CREATE INDEX IF NOT EXISTS idx_raw_env_tenant_time
	ON ingress_envelopes (tenant_id, received_at DESC);

	CREATE INDEX IF NOT EXISTS idx_raw_env_status
	ON ingress_envelopes (status, received_at);`

	_, err = DB.Exec(rawEnvelopeIndexes)
	if err != nil {
		log.Fatal(err)
	}

	ingress_outbox :=
		`CREATE TABLE IF NOT EXISTS "ingress_outbox"(
	outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trace_id UUID NOT NULL,
	envelope_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	object_ref TEXT NOT NULL,
	received_at TIMESTAMPTZ NOT NULL,
	ingress_channel TEXT NOT NULL,
	source TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	encrypted_payload BYTEA NOT NULL,
	payload_hash TEXT NOT NULL,
	envelope_hash TEXT NOT NULL,
	envelope_signature BYTEA NOT NULL,
	topic TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING',
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	lease_id UUID,
	leased_by TEXT,
	event_type TEXT NOT NULL,
	lease_until TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ,
	published_at TIMESTAMPTZ,
	failure_reason_code TEXT,
	batchid TEXT,
	file_content_hash TEXT,
	source_system TEXT NOT NULL DEFAULT ''
	);`

	_, err = DB.Exec(ingress_outbox)
	if err != nil {
		log.Fatal(err)
	}

	// Indexes for lease scanning and ack/nack operations
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease
		ON ingress_outbox (status, lease_until, created_at);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_lease_id
		ON ingress_outbox (lease_id);
	`); err != nil {
		return err
	}

	connectors := `
	CREATE TABLE IF NOT EXISTS "connectors" (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id UUID NOT NULL,
	provider TEXT NOT NULL,
	connector_id TEXT NOT NULL,
	secret_ref TEXT,
	secret TEXT,
	active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ DEFAULT now(),
	updated_at TIMESTAMPTZ DEFAULT now(),
	CONSTRAINT unique_provider_connector UNIQUE (provider, connector_id),
	CONSTRAINT unique_tenant_connector UNIQUE (tenant_id, provider, connector_id)
);`

	_, err = DB.Exec(connectors)
	if err != nil {
		log.Fatal(err)
	}

	// ── Schema migrations (add columns that may be missing on older DBs) ──────
	// Add new ALTER TABLE statements here when columns are added to existing tables.
	// These are idempotent — safe to run on every startup.
	migrations := []string{
		// Add future column migrations here, e.g.:
		// `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS new_column TEXT;`,
	}
	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			log.Printf("migration warning: %v (stmt: %.80s)", err, m)
		}
	}

	return nil
}
