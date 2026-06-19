package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

var DB *sql.DB

func CreateTables() error {

	paymentIntents := `
	CREATE TABLE IF NOT EXISTS payment_intents (
		intent_id UUID PRIMARY KEY,
		trace_id UUID NOT NULL,
		envelope_id UUID NOT NULL,
		tenant_id UUID NOT NULL,
		contract_id UUID NOT NULL,
    idempotency_key TEXT,
    salient_hash TEXT NOT NULL,
	payload_hash TEXT NOT NULL, 
    intent_type TEXT NOT NULL,
    canonical_version TEXT NOT NULL,
    schema_version TEXT,
    amount NUMERIC NOT NULL,
    currency CHAR(3) NOT NULL,
    intended_execution_at TIMESTAMPTZ,
    constraints JSONB,
    beneficiary_type TEXT,
    pii_tokens JSONB,
    beneficiary JSONB,
    status TEXT NOT NULL,
    confidence_score NUMERIC(5,2),
    -- 🆕 WORM / Tamper-evidence fields
    canonical_hash TEXT NOT NULL,
    canonical_snapshot_ref TEXT NOT NULL,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,
    governance_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 🆕 Additional Canonical Schema fields
    client_payout_ref TEXT,
    provider_hint TEXT,
    request_fingerprint TEXT,
    routing_hints_json JSONB,
    governance_state TEXT NOT NULL DEFAULT 'VALID',
    business_state TEXT,
    duplicate_risk_flag BOOLEAN,
    mapping_profile_id TEXT,
    mapping_profile_version TEXT,
    source_system TEXT,
    -- 🆕 Service 2 fields
    business_idempotency_key TEXT,
    beneficiary_fingerprint TEXT,
    proof_readiness_score NUMERIC(5,2),
    matchability_score NUMERIC(5,2),
    intent_quality_score NUMERIC(5,2),
    mapping_confidence_score NUMERIC(5,2),
    schema_completeness_score NUMERIC(5,2),
    governance_reason_codes_json JSONB NOT NULL DEFAULT '{}',
    duplicate_reason_code TEXT,
    client_batch_ref TEXT,
    
    -- 🆕 Added for tracking status
    required_fields_status BOOLEAN,
    tokenization_status BOOLEAN,
    governance_decision TEXT,

    updated_at TIMESTAMPTZ DEFAULT now(),
    batchid TEXT,
    source_row_num INT,
    aggregate_confidence_score NUMERIC(5,2),      -- existing

    -- 🆕 Scoring v2 fields
    reference_quality_score  NUMERIC(6,2),
    duplicate_risk_score     NUMERIC(6,2),
    score_version            TEXT        DEFAULT 'service2_score_v2.0',
    score_validity_status    TEXT        DEFAULT 'NOT_SCORED',
    score_breakdown_json     JSONB       DEFAULT '{}',
    score_reason_codes_json  JSONB       DEFAULT '[]',
    scored_at                TIMESTAMPTZ,

	payment_instruction_received TIMESTAMPTZ,
    canonical_intent_created TIMESTAMPTZ
);`

	if _, err := DB.Exec(paymentIntents); err != nil {
		return err
	}

	// Optimized lookup for idempotency guard (tenant_id + envelope_id)
	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_envelope
	    ON payment_intents (tenant_id, envelope_id);
	`); err != nil {
		return err
	}

	// Optimized lookup for business idempotency check
	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_payment_intents_business_idempotency_key
	    ON payment_intents (tenant_id, business_idempotency_key);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_payment_intents_batchid
	    ON payment_intents (batchid) WHERE batchid IS NOT NULL;
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_pi_tenant_canonical_created
	    ON payment_intents (tenant_id, created_at DESC) 
	    WHERE canonical_hash IS NOT NULL AND canonical_hash <> '';
	`); err != nil {
		return err
	}

	//Outbox (OWNED)
	outbox := `
	CREATE TABLE IF NOT EXISTS outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trace_id UUID NOT NULL,  
    envelope_id UUID NOT NULL, 
    tenant_id UUID NOT NULL,
    contract_id UUID NOT NULL,
	lease_id UUID, leased_by TEXT, lease_until TIMESTAMPTZ,
    -- intent-specific outbox
    aggregate_type TEXT NOT NULL DEFAULT 'intent',
    aggregate_id UUID NOT NULL, -- payment_intents.intent_id
    event_type TEXT NOT NULL,   -- intent.created.v1, intent.updated.v1
	schema_version TEXT,
	amount NUMERIC,
	currency CHAR(3),
    idempotency_key TEXT,
    salient_hash TEXT,
    intent_type TEXT,
    canonical_version TEXT,
    intended_execution_at TIMESTAMPTZ,
    constraints JSONB,
    beneficiary_type TEXT,
    pii_tokens JSONB,
    beneficiary JSONB,
    intent_status TEXT,
    confidence_score NUMERIC(5,2),
    canonical_hash TEXT,
    canonical_snapshot_ref TEXT,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,
    governance_hash TEXT,
    client_payout_ref TEXT,
    provider_hint TEXT,
    request_fingerprint TEXT,
    routing_hints_json JSONB,
    governance_state TEXT NOT NULL DEFAULT 'VALID',
    business_state TEXT,
    duplicate_risk_flag BOOLEAN,
    mapping_profile_id TEXT,
    mapping_profile_version TEXT,
    source_system TEXT,
    business_idempotency_key TEXT,
    beneficiary_fingerprint TEXT,
    proof_readiness_score NUMERIC(5,2),
    matchability_score NUMERIC(5,2),
    intent_quality_score NUMERIC(5,2),
    mapping_confidence_score NUMERIC(5,2),
    schema_completeness_score NUMERIC(5,2),
    governance_reason_codes_json JSONB NOT NULL DEFAULT '{}',
    duplicate_reason_code TEXT,
    client_batch_ref TEXT,
   	payload JSONB NOT NULL,     -- downstream message body (no raw PII)
	payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
	batchid TEXT,
	source_row_num INT,
    aggregate_confidence_score NUMERIC(5,2),      -- existing

    -- 🆕 Added for tracking status
    required_fields_status BOOLEAN,
    tokenization_status BOOLEAN,
    governance_decision TEXT,

    -- 🆕 Scoring v2 batch fields
    reference_quality_score  NUMERIC(6,2),
    duplicate_risk_score     NUMERIC(6,2),
    score_version            TEXT        DEFAULT 'service2_score_v2.0',
    score_validity_status    TEXT        DEFAULT 'NOT_SCORED',
    score_breakdown_json     JSONB       DEFAULT '{}',
    score_reason_codes_json  JSONB       DEFAULT '[]',
    scored_at                TIMESTAMPTZ,
    batch_quality_score      NUMERIC(6,2),
    avg_reference_quality    NUMERIC(6,2),
    avg_duplicate_risk       NUMERIC(6,2),
    low_matchability_count   INT         DEFAULT 0,
    duplicate_risk_count     INT         DEFAULT 0,

	payment_instruction_received TIMESTAMPTZ,
    canonical_intent_created TIMESTAMPTZ,

    CONSTRAINT fk_outbox_intent
        FOREIGN KEY (aggregate_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_outbox_status
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    CONSTRAINT chk_outbox_aggregate_type
        CHECK (aggregate_type = 'intent')
);
`

	if _, err := DB.Exec(outbox); err != nil {
		return err
	}
	// // Ensure lease columns exist for internal outbox pull API
	// if _, err := DB.Exec(`
	// 	ALTER TABLE outbox
	// 	ADD COLUMN IF NOT EXISTS lease_id UUID,
	// 	ADD COLUMN IF NOT EXISTS leased_by TEXT,
	// 	ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
	// `); err != nil {
	// 	return err
	// }

	// Indexes for lease scanning and ack/nack operations
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease
		ON outbox (status, lease_until, created_at);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_lease_id
		ON outbox (lease_id);
	`); err != nil {
		return err
	}

	// DLQ ITEMS (OWNED)
	dlqItems := `
	CREATE TABLE IF NOT EXISTS dlq_items (
		dlq_id UUID PRIMARY KEY,
		tenant_id UUID NOT NULL,
		envelope_id UUID NOT NULL,
		stage TEXT NOT NULL,
		reason_code TEXT NOT NULL,
		error_detail TEXT,
		replayable BOOLEAN NOT NULL,
		client_batch_ref TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		batch_id   TEXT,
		source_row_num INT,
		dlq_status TEXT NOT NULL DEFAULT 'DLQ_TERMINAL',
		intent_context JSONB,
		trace_id TEXT,
		lease_id UUID,
		leased_by TEXT,
		lease_until TIMESTAMPTZ,
		retry_count INT NOT NULL DEFAULT 0,
		next_attempt_at TIMESTAMPTZ,
		dispatched_at TIMESTAMPTZ
	);`

	if _, err := DB.Exec(dlqItems); err != nil {
		return err
	}

	// Ensure lease columns exist on dlq_items for the pull API
	if _, err := DB.Exec(`
		ALTER TABLE dlq_items
		ADD COLUMN IF NOT EXISTS lease_id UUID,
		ADD COLUMN IF NOT EXISTS leased_by TEXT,
		ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
		ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
		ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
		ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
	`); err != nil {
		return err
	}

	// Indexes for lease scanning and ack/nack operations
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_dlq_items_pending_lease
		ON dlq_items (dlq_status, lease_until, created_at);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_dlq_items_lease_id
		ON dlq_items (lease_id);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_dlq_items_batch_id
	    ON dlq_items (batch_id) WHERE batch_id IS NOT NULL;
	`); err != nil {
		return err
	}

	// NORMALIZED INGEST RECORDS TABLE
	normalizedIngestRecords := `
	CREATE TABLE IF NOT EXISTS normalized_ingest_records (
		nir_id UUID PRIMARY KEY,
		envelope_id UUID NOT NULL,
		tenant_id UUID NOT NULL,
		detected_format TEXT,
		profile_id TEXT,
		profile_version TEXT,
		fields_json JSONB,
		field_confidence_summary JSONB,
		unmapped_json JSONB,
		mapping_uncertain_flag BOOLEAN,
		-- 🆕 Service 2 fields
		required_field_gap_count INT,
		low_confidence_field_count INT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`

	if _, err := DB.Exec(normalizedIngestRecords); err != nil {
		return err
	}

	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_nirs_tenant_id ON normalized_ingest_records(tenant_id);`); err != nil {
		return err
	}

	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_nirs_envelope_id ON normalized_ingest_records(envelope_id);`); err != nil {
		return err
	}

	businessIdempotencyRegistry := `
	CREATE TABLE IF NOT EXISTS business_idempotency_registry (
		tenant_id UUID NOT NULL,
		business_idempotency_key TEXT NOT NULL,
		intent_id UUID NOT NULL,
		beneficiary_fingerprint TEXT NOT NULL,
		amount_minor BIGINT NOT NULL,
		currency_code CHAR(3) NOT NULL,
		time_bucket TEXT NOT NULL,
		duplicate_reason_code TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		PRIMARY KEY (tenant_id, business_idempotency_key)
	);`

	if _, err := DB.Exec(businessIdempotencyRegistry); err != nil {
		return err
	}

	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_idempotency_registry_intent_id ON business_idempotency_registry(intent_id);`); err != nil {
		return err
	}

	intentVersions := `
CREATE TABLE IF NOT EXISTS intent_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    version_no INT NOT NULL,
    prev_hash TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_intent_versions_intent
        FOREIGN KEY (intent_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_intent_versions_intent_version
        UNIQUE (intent_id, version_no)
);`

	if _, err := DB.Exec(intentVersions); err != nil {
		return err
	}

	if _, err := DB.Exec(`
CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_id
    ON intent_versions (intent_id);
`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_version
    ON intent_versions (intent_id, version_no);
`); err != nil {
		return err
	}

	log.Println("✅ Canonical Intent Engine tables ensured")

	etlIngestRuns := `
CREATE TABLE IF NOT EXISTS etl_ingest_runs (
    run_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    envelope_id         UUID NOT NULL,
    intent_id           UUID,
    outbox_event_id     TEXT NOT NULL,
    artifact_family     TEXT NOT NULL DEFAULT 'PAYOUT_INTENT',
    source_system       TEXT,
    mapping_profile_id  TEXT,
    parser_version      TEXT NOT NULL DEFAULT 'v1',
    run_generation      INT  NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'PROCESSING',
    is_active            BOOLEAN NOT NULL DEFAULT false,
    supersedes_run_id   UUID,
    parse_success_rate  FLOAT8,
    quality_score       FLOAT8,
    proof_readiness_score FLOAT8,
    started_at          TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);`

	etlQualityResults := `
CREATE TABLE IF NOT EXISTS etl_quality_results (
    quality_result_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                  UUID NOT NULL REFERENCES etl_ingest_runs(run_id),
    tenant_id               UUID NOT NULL,
    scope_type              TEXT NOT NULL DEFAULT 'INTENT',
    quality_score           FLOAT8,
    parse_success_rate      FLOAT8,
    required_field_gap_count INT DEFAULT 0,
    low_confidence_field_count INT DEFAULT 0,
    attachment_readiness_score FLOAT8,
    proof_readiness_score   FLOAT8,
    status                  TEXT NOT NULL DEFAULT 'PASS',
    reason_codes_json       JSONB DEFAULT '[]',
    created_at              TIMESTAMPTZ DEFAULT now()
);`

	if _, err := DB.Exec(etlIngestRuns); err != nil {
		log.Fatal("etl_ingest_runs:", err)
	}
	if _, err := DB.Exec(etlQualityResults); err != nil {
		log.Fatal("etl_quality_results:", err)
	}

	tenantSynonymProfiles := `
	CREATE TABLE IF NOT EXISTS tenant_synonym_profiles (
		profile_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		tenant_id    UUID NOT NULL,
		source_key   TEXT NOT NULL,        -- tenant's raw column name, e.g. "Payout Amount"
		canonical_path TEXT NOT NULL,      -- Zord path, e.g. "amount.value"
		match_method TEXT NOT NULL DEFAULT 'exact',
		is_active    BOOLEAN NOT NULL DEFAULT true,
		created_at   TIMESTAMPTZ DEFAULT now(),
		UNIQUE (tenant_id, source_key)
	);`
	if _, err := DB.Exec(tenantSynonymProfiles); err != nil {
		log.Fatal("tenant_synonym_profiles:", err)
	}
	// canonical batch schema
	canonicalBatches := `
	CREATE TABLE IF NOT EXISTS canonical_batches (
    	tenant_id                       UUID NOT NULL,
    	batch_id                        TEXT NOT NULL,
		source_system                   TEXT,
		received_count                  INT NOT NULL DEFAULT 0,
		canonicalized_count             INT NOT NULL DEFAULT 0,
		dlq_count                       INT NOT NULL DEFAULT 0,
		review_count                    INT NOT NULL DEFAULT 0,
		low_matchability_count          INT NOT NULL DEFAULT 0,
		low_proof_readiness_count       INT NOT NULL DEFAULT 0,
		duplicate_risk_count            INT NOT NULL DEFAULT 0,
		canonicalization_success_rate   NUMERIC(6,2) DEFAULT 0,
		avg_schema_completeness_score   NUMERIC(6,2) DEFAULT 0,
		avg_mapping_confidence_score    NUMERIC(6,2) DEFAULT 0,
		avg_matchability_score          NUMERIC(6,2) DEFAULT 0,
		avg_proof_readiness_score       NUMERIC(6,2) DEFAULT 0,
		avg_intent_quality_score        NUMERIC(6,2) DEFAULT 0,
		duplicate_risk_amount_minor     BIGINT DEFAULT 0,
		batch_quality_score             NUMERIC(6,2) DEFAULT 0,
		score_breakdown_json            JSONB DEFAULT '{}',
		total_amount                    NUMERIC DEFAULT 0,
		created_at                      TIMESTAMPTZ DEFAULT now(),
		updated_at                      TIMESTAMPTZ DEFAULT now(),
		lease_id                        UUID,
		leased_by                       TEXT,
		lease_until                     TIMESTAMPTZ,
		retry_count                     INT NOT NULL DEFAULT 0,
		next_attempt_at                 TIMESTAMPTZ,
		dispatched_at                   TIMESTAMPTZ,
		    PRIMARY KEY (tenant_id, batch_id)
	);`
	if _, err := DB.Exec(canonicalBatches); err != nil {
		log.Fatal("canonical_batches:", err)
	}

	// Lease indexes for relay batch-completion polling
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_canonical_batches_lease_id
		ON canonical_batches (lease_id);
	`); err != nil {
		log.Fatal("idx_canonical_batches_lease_id:", err)
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_canonical_batches_pending_lease
		ON canonical_batches (dispatched_at, lease_until);
	`); err != nil {
		log.Fatal("idx_canonical_batches_pending_lease:", err)
	}

	mappingProfiles := `
	CREATE TABLE IF NOT EXISTS mapping_profiles (
	    profile_id                TEXT        PRIMARY KEY,
	    profile_version           TEXT        NOT NULL DEFAULT '1.0.0',
	    tenant_id                 UUID,
	    tenant_name               TEXT        NOT NULL DEFAULT '',
	    source_vendor             TEXT        NOT NULL DEFAULT '',
	    source_system             TEXT        NOT NULL DEFAULT '',
	    artifact_family           TEXT        NOT NULL DEFAULT 'LIVE_INTENT_JSON',
	    file_format               TEXT        NOT NULL DEFAULT 'json',
	    delimiter                 TEXT        NOT NULL DEFAULT ',',
	    header_row_index          INT         NOT NULL DEFAULT 0,
	    mapping_strategy          TEXT        NOT NULL DEFAULT 'column_map',
	    column_map                JSONB       NOT NULL DEFAULT '{}',
	    amount_format             TEXT        NOT NULL DEFAULT 'DECIMAL',
	    date_format               TEXT        NOT NULL DEFAULT '2006-01-02',
	    default_currency          TEXT        NOT NULL DEFAULT 'INR',
	    default_intent_type      TEXT        NOT NULL DEFAULT 'PAYOUT',
	    source_timezone           TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
	    strict_required_fields_json JSONB     NOT NULL DEFAULT '[]',
	    soft_inferable_fields_json  JSONB     NOT NULL DEFAULT '[]',
	    field_kind_policy_json      JSONB     NOT NULL DEFAULT '{}',
	    sensitive_field_policy_json JSONB     NOT NULL DEFAULT '{}',
	    output_entity_family      TEXT        NOT NULL DEFAULT 'INTENT',
	    status                    TEXT        NOT NULL DEFAULT 'active',
	    notes                     TEXT        NOT NULL DEFAULT '',
	    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
	    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
	    created_by                TEXT        NOT NULL DEFAULT '',
	    UNIQUE (tenant_id, source_system, artifact_family, profile_version)
	);

	CREATE INDEX IF NOT EXISTS idx_mapping_profiles_tenant_source
	    ON mapping_profiles (tenant_id, source_system)
	    WHERE status = 'active';
	`
	if _, err := DB.Exec(mappingProfiles); err != nil {
		return err
	}

	// Migration: add default_intent_type if it doesn't exist yet (idempotent)
	_, _ = DB.Exec(`ALTER TABLE mapping_profiles ADD COLUMN IF NOT EXISTS default_intent_type TEXT NOT NULL DEFAULT 'PAYOUT'`)

	// ── Ingest run audit trail (batch level) ──────────────────────────────────
	intentIngestRuns := `
	CREATE TABLE IF NOT EXISTS intent_ingest_runs (
	    run_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	    batch_id       TEXT NOT NULL UNIQUE,
	    tenant_id      UUID NOT NULL,
	    mapping_id     TEXT,         -- profile_id resolved by the intent-engine for this batch
	    profile_id     TEXT,         -- legacy audit hint (e.g. "system-tally-v1")
	    file_name      TEXT,
	    file_hash      TEXT,
	    total_rows     INT  DEFAULT 0,
	    accepted_rows  INT  DEFAULT 0,
	    failed_rows    INT  DEFAULT 0,
	    duplicate_rows INT  DEFAULT 0,
	    status         TEXT NOT NULL DEFAULT 'PROCESSING',
	    started_at     TIMESTAMPTZ DEFAULT now(),
	    completed_at   TIMESTAMPTZ
	);`

	if _, err := DB.Exec(intentIngestRuns); err != nil {
		log.Fatal("intent_ingest_runs:", err)
	}

	// ── Per-row ingest records (one entry per row, per tenant, per mapping) ───
	intentIngestRows := `
	CREATE TABLE IF NOT EXISTS intent_ingest_rows (
	    row_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	    batch_id        TEXT NOT NULL,
	    tenant_id       UUID NOT NULL,
	    mapping_id      TEXT NOT NULL DEFAULT '',  -- profile_id from mapping_profiles used
	    profile_id      TEXT,                       -- legacy: human-readable source profile
	    row_index       INT  NOT NULL DEFAULT 0,    -- 1-based row number within the file
	    idempotency_key TEXT,
	    status          TEXT NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED | FAILED | DUPLICATE
	    error_detail    TEXT,
	    source_system   TEXT,
	    file_name       TEXT,
	    file_hash       TEXT,
	    raw_row_json    JSONB,
	    created_at      TIMESTAMPTZ DEFAULT now()
	);

	CREATE INDEX IF NOT EXISTS idx_iir_tenant_batch
	    ON intent_ingest_rows (tenant_id, batch_id);

	CREATE INDEX IF NOT EXISTS idx_iir_mapping_id
	    ON intent_ingest_rows (mapping_id);`

	if _, err := DB.Exec(intentIngestRows); err != nil {
		log.Fatal("intent_ingest_rows:", err)
	}

	// ── Schema migrations (add columns that may be missing on older DBs) ──────
	// Add new ALTER TABLE statements here when columns are added to existing tables.
	// These are idempotent — safe to run on every startup.
	migrations := []string{
		// Add future column migrations here, e.g.:
		// `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS new_column TEXT;`,
	}
	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			log.Printf("migration warning: %v (stmt: %.80s)", err, m)
		}
	}

	return nil
}

// UpsertIngestRun inserts or updates an intent_ingest_runs row at the end of
// a bulk ingest. It uses ON CONFLICT on batch_id to update run stats atomically.
func UpsertIngestRun(
	ctx context.Context,
	db *sql.DB,
	runID, batchID, tenantID, mappingID, profileID, fileName, fileHash string,
	total, accepted, failed, duplicate int,
	status string,
) error {
	const q = `
		INSERT INTO intent_ingest_runs
		    (run_id, batch_id, tenant_id, mapping_id, profile_id, file_name, file_hash,
		     total_rows, accepted_rows, failed_rows, duplicate_rows, status, completed_at)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''),
		        $8, $9, $10, $11, $12, now())
		ON CONFLICT (batch_id) DO UPDATE SET
		    mapping_id     = EXCLUDED.mapping_id,
		    total_rows     = EXCLUDED.total_rows,
		    accepted_rows  = EXCLUDED.accepted_rows,
		    failed_rows    = EXCLUDED.failed_rows,
		    duplicate_rows = EXCLUDED.duplicate_rows,
		    status         = EXCLUDED.status,
		    completed_at   = now()`

	_, err := db.ExecContext(ctx, q,
		runID, batchID, tenantID, mappingID, profileID, fileName, fileHash,
		total, accepted, failed, duplicate, status,
	)
	if err != nil {
		return fmt.Errorf("UpsertIngestRun: %w", err)
	}
	return nil
}

// InsertIngestRow writes a single per-row audit record into intent_ingest_rows.
// Called by the intent-engine when it processes each row-level envelope from Kafka.
// The full match entry (mapping_id, profile_id, status, raw_row_json, etc.) is written
// in one shot — same pattern as UpsertIngestRun was used in zord-edge bulk_handler.
func InsertIngestRow(
	ctx context.Context,
	db *sql.DB,
	batchID, tenantID, mappingID, profileID string,
	rowIndex int,
	idempotencyKey, status, errorDetail, sourceSystem, fileName, fileHash string,
	rawRowJSON []byte,
) error {
	const q = `
		INSERT INTO intent_ingest_rows
		    (batch_id, tenant_id, mapping_id, profile_id, row_index,
		     idempotency_key, status, error_detail, source_system,
		     file_name, file_hash, raw_row_json)
		VALUES ($1, $2, $3, NULLIF($4,''), $5,
		        NULLIF($6,''), $7, NULLIF($8,''), NULLIF($9,''),
		        NULLIF($10,''), NULLIF($11,''), $12)`

	_, err := db.ExecContext(ctx, q,
		batchID, tenantID, mappingID, profileID, rowIndex,
		idempotencyKey, status, errorDetail, sourceSystem,
		fileName, fileHash, rawRowJSON,
	)
	if err != nil {
		return fmt.Errorf("InsertIngestRow: %w", err)
	}
	return nil
}
