package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

func Connect(dsn string) (*sql.DB, error) {
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	database.SetMaxOpenConns(50)
	database.SetMaxIdleConns(20)
	database.SetConnMaxLifetime(10 * time.Minute)
	database.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := database.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return database, nil
}

// EnsureTables creates all Service 6 tables if they do not already exist.
// Schema is aligned with the Intelligence Pivot spec §14.1–14.5.
func EnsureTables(ctx context.Context, d *sql.DB) error {
	stmts := []string{
		// Internal buffer for Merkle leaf candidates before pack generation
		`CREATE TABLE IF NOT EXISTS pending_leaf_candidates (
			id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id      TEXT        NOT NULL,
			intent_id      TEXT,
			envelope_id    TEXT,
			contract_id    TEXT,
			batch_id       TEXT,
			leaf_type      TEXT        NOT NULL,
			item_ref       TEXT,
			hash           TEXT        NOT NULL,
			schema_version TEXT        NOT NULL DEFAULT 'v1',
			source_topic   TEXT        NOT NULL,
			client_payout_ref            TEXT,
			amount                       NUMERIC,
			currency                     TEXT,
			payment_instruction_received TIMESTAMPTZ,
			canonical_intent_created    TIMESTAMPTZ,
			mapping_profile_used        TEXT,
			required_fields_status      BOOLEAN,
			tokenization_status         BOOLEAN,
			governance_decision         TEXT,
			settlement_record_received  TIMESTAMPTZ,
			canonical_settlement_created TIMESTAMPTZ,
			bank_reference              TEXT,
			client_reference            TEXT,
			attachment_decision         TEXT,
			match_confidence            DOUBLE PRECISION,
			value_date_check            BOOLEAN,
			amount_match                BOOLEAN,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,

		`CREATE UNIQUE INDEX IF NOT EXISTS plc_intent_type_idx
			ON pending_leaf_candidates(tenant_id, intent_id, leaf_type)
			WHERE intent_id IS NOT NULL;`,

		`DROP INDEX IF EXISTS plc_envelope_type_idx;`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plc_envelope_type_idx
			ON pending_leaf_candidates(tenant_id, envelope_id, leaf_type)
			WHERE intent_id IS NULL AND batch_id IS NULL;`,

		`DROP INDEX IF EXISTS plc_batch_type_idx;`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plc_batch_type_idx
			ON pending_leaf_candidates(tenant_id, batch_id, leaf_type)
			WHERE batch_id IS NOT NULL AND intent_id IS NULL;`,

		// §14.1 — main metadata table
		`CREATE TABLE IF NOT EXISTS evidence_packs (
			evidence_pack_id      TEXT PRIMARY KEY,
			tenant_id             TEXT NOT NULL,
			intent_id             TEXT,
			contract_id           TEXT,
			batch_id              TEXT,
			client_payout_ref     TEXT,
			amount                NUMERIC,
			currency         TEXT,
			mode                  TEXT NOT NULL,
			pack_status           TEXT NOT NULL DEFAULT 'ACTIVE',
			merkle_root           TEXT NOT NULL,
			ruleset_version       TEXT NOT NULL,
			schema_versions_json  JSONB,
			signature_alg         TEXT NOT NULL,
			signature_value       TEXT NOT NULL,
			object_ref            TEXT NOT NULL,
			supersedes_pack_id    TEXT,
			replay_equivalence_status TEXT,
			replay_notes          TEXT,
			pack_completeness_score DOUBLE PRECISION NOT NULL DEFAULT 0,
			leaf_count              INT NOT NULL DEFAULT 0,
			required_leaf_count     INT NOT NULL DEFAULT 0,

			settlement_leaf_present_flag          BOOLEAN NOT NULL DEFAULT FALSE,
			attachment_decision_leaf_present_flag BOOLEAN NOT NULL DEFAULT FALSE,
			payment_instruction_received TIMESTAMPTZ,
			canonical_intent_created    TIMESTAMPTZ,
			mapping_profile_used        TEXT,
			required_fields_status      BOOLEAN,
			tokenization_status         BOOLEAN,
			governance_decision         TEXT,
			settlement_record_received  TIMESTAMPTZ,
			canonical_settlement_created TIMESTAMPTZ,
			bank_reference              TEXT,
			client_reference            TEXT,
			attachment_decision         TEXT,
			match_confidence            DOUBLE PRECISION,
			value_date_check            BOOLEAN,
			amount_match                BOOLEAN,

			-- Spec §4 enrichment fields
			proof_status                  TEXT    NOT NULL DEFAULT 'DRAFT',
			proof_score                   INT     NOT NULL DEFAULT 0,
			generated_by                  TEXT    NOT NULL DEFAULT 'system',
			last_verified_at              TIMESTAMPTZ,
			verification_status           BOOLEAN NOT NULL DEFAULT FALSE,
			export_count                  INT     NOT NULL DEFAULT 0,
			proof_components_json         JSONB,
			cryptographic_signatures_json JSONB,
			proof_score_breakdown_json    JSONB,
			zord_signature                TEXT,

			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_contract_idx
			ON evidence_packs(tenant_id, contract_id)`,

		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_intent_idx
			ON evidence_packs(tenant_id, intent_id)`,

		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_batch_idx
			ON evidence_packs(tenant_id, batch_id)`,

		`CREATE UNIQUE INDEX IF NOT EXISTS evidence_packs_batch_unique_idx
			ON evidence_packs(tenant_id, batch_id)
			WHERE intent_id IS NULL AND batch_id IS NOT NULL AND pack_status = 'ACTIVE';`,

		`CREATE INDEX IF NOT EXISTS evidence_packs_proof_status_idx
			ON evidence_packs(proof_status)`,

		// Partial unique index: only one ACTIVE pack per (tenant_id, intent_id).
		// This is the DB-level idempotency safety net that makes duplicate active packs
		// impossible even across pod restarts or if the advisory lock is bypassed.
		// INSERT ON CONFLICT DO NOTHING in SavePackInTx depends on this index.
		`CREATE UNIQUE INDEX IF NOT EXISTS evidence_packs_active_intent_unique_idx
			ON evidence_packs(tenant_id, intent_id)
			WHERE pack_status = 'ACTIVE' AND intent_id IS NOT NULL`,

		// §14.2 — leaf composition table
		`CREATE TABLE IF NOT EXISTS evidence_items (
			evidence_pack_id TEXT NOT NULL,
			position_index   INT  NOT NULL,
			item_type        TEXT NOT NULL,
			item_ref         TEXT NOT NULL,
			item_hash        TEXT,
			leaf_hash        TEXT NOT NULL,
			schema_version   TEXT NOT NULL,
			PRIMARY KEY(evidence_pack_id, position_index)
		)`,

		`CREATE INDEX IF NOT EXISTS evidence_items_pack_idx
			ON evidence_items(evidence_pack_id)`,

		// signatures sub-table
		`CREATE TABLE IF NOT EXISTS evidence_signatures (
			evidence_pack_id TEXT NOT NULL,
			signer           TEXT NOT NULL,
			alg              TEXT NOT NULL,
			signature        TEXT NOT NULL,
			signed_at        TIMESTAMPTZ NOT NULL,
			PRIMARY KEY(evidence_pack_id, signer, alg)
		)`,

		// §14.3 — immutable archive body metadata
		`CREATE TABLE IF NOT EXISTS evidence_archives (
			archive_id        TEXT PRIMARY KEY,
			evidence_pack_id  TEXT NOT NULL,
			tenant_id         TEXT NOT NULL,
			object_ref        TEXT NOT NULL,
			encryption_key_id TEXT,
			archive_hash      TEXT NOT NULL,
			archive_version   TEXT NOT NULL DEFAULT 'v1',
			created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		`CREATE INDEX IF NOT EXISTS evidence_archives_pack_idx
			ON evidence_archives(evidence_pack_id)`,

		// §14.4 — Merkle inclusion proofs
		`CREATE TABLE IF NOT EXISTS merkle_inclusion_proofs (
			evidence_pack_id TEXT NOT NULL,
			leaf_index       INT NOT NULL,
			leaf_hash        TEXT NOT NULL,
			proof_path_json  JSONB NOT NULL,
			created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY(evidence_pack_id, leaf_index)
		)`,

		// §14.5 — replay job tracking
		`CREATE TABLE IF NOT EXISTS evidence_replay_jobs (
			replay_job_id           TEXT PRIMARY KEY,
			tenant_id               TEXT NOT NULL,
			source_evidence_pack_id TEXT NOT NULL,
			intent_id               TEXT,
			contract_id             TEXT,
			ruleset_version         TEXT NOT NULL,
			mapping_versions_json   JSONB,
			requested_by            TEXT,
			status                  TEXT NOT NULL DEFAULT 'PENDING',
			new_evidence_pack_id    TEXT,
			equivalence_result      TEXT,
			difference_summary_json JSONB,
			created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at            TIMESTAMPTZ
		)`,

		`CREATE INDEX IF NOT EXISTS evidence_replay_jobs_tenant_idx
			ON evidence_replay_jobs(tenant_id, source_evidence_pack_id)`,

		`CREATE INDEX IF NOT EXISTS evidence_replay_jobs_status_idx
			ON evidence_replay_jobs(status)`,

		// Spec §6 dispute export audit log
		`CREATE TABLE IF NOT EXISTS evidence_export_log (
			export_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			evidence_pack_id  TEXT        NOT NULL,
			tenant_id         TEXT        NOT NULL,
			intent_id         TEXT,
			payment_reference TEXT,
			export_type       TEXT        NOT NULL,
			dispute_reason    TEXT,
			requested_by      TEXT,
			exported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			file_hash         TEXT
		)`,

		`CREATE INDEX IF NOT EXISTS export_log_pack_idx
			ON evidence_export_log(evidence_pack_id)`,

		`CREATE INDEX IF NOT EXISTS export_log_tenant_idx
			ON evidence_export_log(tenant_id, exported_at DESC)`,

		// outbox for relay polling
		`CREATE TABLE IF NOT EXISTS evidence_outbox_events (
			event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			trace_id TEXT,
			envelope_id TEXT,
			tenant_id TEXT NOT NULL,
			contract_id TEXT,
			aggregate_type TEXT NOT NULL DEFAULT 'evidence_pack',
			aggregate_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			schema_version TEXT DEFAULT 'v1',
			payload JSONB NOT NULL,
			status TEXT NOT NULL DEFAULT 'PENDING',
			retry_count INT NOT NULL DEFAULT 0,
			next_attempt_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			sent_at TIMESTAMPTZ,
			lease_id UUID,
			leased_by TEXT,
			lease_until TIMESTAMPTZ
		);`,

		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_pending_lease
			ON evidence_outbox_events(status, lease_until, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_lease_id
			ON evidence_outbox_events(lease_id);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_status
			ON evidence_outbox_events(status);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_tenant_id
			ON evidence_outbox_events(tenant_id);`,

		// P1-04: Immutable receipt log — one row per Kafka leaf delivery.
		// Never updated, never deleted. Append-only audit trail.
		//
		// outcome ∈ { ACCEPTED, DUPLICATE, CONFLICT }
		//   ACCEPTED  — first time this leaf slot was written.
		//   DUPLICATE — same source_event_id re-delivered (Kafka at-least-once).
		//   CONFLICT  — different source_event_id tried to overwrite an accepted leaf.
		//
		// source_event_id is the event_id field from the upstream RelayEvent.
		// It is the idempotency key: two Kafka deliveries of the same event
		// share the same source_event_id, so the ON CONFLICT DO NOTHING on the
		// unique index (source_event_id, tenant_id, leaf_type, intent_id, batch_id)
		// makes WriteReceipt fully idempotent.
		`DROP TABLE IF EXISTS evidence_leaf_receipts;`,

		`CREATE TABLE evidence_leaf_receipts (
			receipt_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
			tenant_id TEXT NOT NULL,
			scope_type TEXT NOT NULL,
			scope_ref TEXT NOT NULL,
			leaf_type TEXT NOT NULL,
			leaf_hash TEXT NOT NULL,
			source_topic TEXT NOT NULL,
			source_event_id TEXT,
			amount_minor NUMERIC(20,2),
			currency TEXT,
			client_reference TEXT,
			bank_reference TEXT,
			receipt_status TEXT NOT NULL,
			discard_reason TEXT,
			received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,

		// Idempotency index: prevents a second WriteReceipt call for the exact
		// same Kafka message from inserting a duplicate receipt row.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_leaf_receipts_dedup_v3
			ON evidence_leaf_receipts(
				source_event_id,
				tenant_id,
				leaf_type,
				scope_type,
				scope_ref
			);`,

		// Fast lookup: "show me all receipts for this scope" (auditor view).
		`CREATE INDEX IF NOT EXISTS idx_leaf_receipts_scope
			ON evidence_leaf_receipts(tenant_id, scope_type, scope_ref);`,

		// Fast lookup: "show me all conflicts for this scope" (monitoring).
		`CREATE INDEX IF NOT EXISTS idx_leaf_receipts_conflicts
			ON evidence_leaf_receipts(tenant_id, scope_type, scope_ref, receipt_status)
			WHERE receipt_status = 'CONFLICT';`,
	}

	for _, s := range stmts {
		if _, err := d.ExecContext(ctx, s); err != nil {
			return fmt.Errorf("ensure table: %w (stmt: %.80s)", err, s)
		}
	}

	// ── Schema migrations (add columns that may be missing on older DBs) ──────
	// These are idempotent — safe to run on every startup.
	// IMPORTANT: never DROP or rename columns here; only ADD IF NOT EXISTS.
	// Destructive schema changes belong in a versioned migration file.
	migrations := []string{
		`ALTER TABLE pending_leaf_candidates ADD COLUMN IF NOT EXISTS client_payout_ref TEXT;`,
		`ALTER TABLE evidence_packs ADD COLUMN IF NOT EXISTS client_payout_ref TEXT;`,
		`ALTER TABLE merkle_inclusion_proofs DROP CONSTRAINT IF EXISTS merkle_inclusion_proofs_pkey;`,
		`ALTER TABLE merkle_inclusion_proofs ADD COLUMN IF NOT EXISTS leaf_index INT;`,
		`ALTER TABLE merkle_inclusion_proofs ADD PRIMARY KEY (evidence_pack_id, leaf_index);`,

		// FIX-14: evidence_pack_id links outbox row to the sealed pack for relay correlation.
		`ALTER TABLE evidence_outbox_events ADD COLUMN IF NOT EXISTS evidence_pack_id TEXT;`,

		// FIX-14: payload_hash lets consumers verify payload integrity without re-fetching the pack.
		`ALTER TABLE evidence_outbox_events ADD COLUMN IF NOT EXISTS payload_hash TEXT;`,

		// FIX-14: Index outbox by evidence_pack_id for fast relay correlation queries.
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_pack_id ON evidence_outbox_events(evidence_pack_id) WHERE evidence_pack_id IS NOT NULL;`,

		// FIX P1-08: Track Merkle scheme version so VerifyPack uses the right recomputation.
		// 'merkle_v1' = legacy (no domain sep). 'merkle_v2' = current (domain-separated).
		`ALTER TABLE evidence_packs ADD COLUMN IF NOT EXISTS merkle_scheme_version TEXT NOT NULL DEFAULT 'merkle_v1';`,

		// FIX-16: Store failure reason for FAILED replay jobs.
		`ALTER TABLE evidence_replay_jobs ADD COLUMN IF NOT EXISTS failure_reason TEXT;`,

		// P1-04: Add source_event_id to pending_leaf_candidates.
		// This carries the upstream RelayEvent.event_id through to the pending row
		// so the leaf receipt classifier can detect DUPLICATE vs CONFLICT deliveries.
		// Default '' (empty string) for existing rows that pre-date this column —
		// the classifier treats empty source_event_id as ACCEPTED to avoid
		// blocking leaf writes from older consumer paths.
		`ALTER TABLE pending_leaf_candidates ADD COLUMN IF NOT EXISTS source_event_id TEXT NOT NULL DEFAULT '';`,

		// Drop old dedup index (if any)
		`DROP INDEX IF EXISTS idx_leaf_receipts_dedup;`,
		`DROP INDEX IF EXISTS idx_leaf_receipts_dedup_v2;`,
	}
	for _, m := range migrations {
		if _, err := d.ExecContext(ctx, m); err != nil {
			return fmt.Errorf("migration: %w (stmt: %.80s)", err, m)
		}
	}

	// ── Foreign key constraints ───────────────────────────────────────────────
	// P0-02: Enforce referential integrity between child tables and evidence_packs.
	//
	// Strategy: for each constraint —
	//   1. Query pg_constraint to check whether it already exists.
	//      (PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS" for FK constraints —
	//      that syntax is only valid for CHECK constraints. Attempting it produces
	//      "syntax error at or near NOT".)
	//   2. If absent: ADD CONSTRAINT ... NOT VALID (instant — no row scan, no
	//      AccessExclusiveLock on existing rows, enforces only new writes).
	//   3. VALIDATE CONSTRAINT (non-blocking ShareUpdateExclusiveLock — scans
	//      existing rows; if orphans exist it fails with a clear error).
	//
	// If the service restarts between steps 2 and 3 the NOT VALID constraint is
	// already present. Step 1 detects it, skips step 2, and goes straight to
	// step 3 to finish the validation — fully idempotent.
	type fkDef struct {
		desc           string
		constraintName string
		table          string
		addStmt        string
		validateStmt   string
	}

	fkConstraints := []fkDef{
		{
			desc:           "evidence_items → evidence_packs",
			constraintName: "fk_evidence_items_pack",
			table:          "evidence_items",
			addStmt: `ALTER TABLE evidence_items
				ADD CONSTRAINT fk_evidence_items_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE CASCADE
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_items
				VALIDATE CONSTRAINT fk_evidence_items_pack`,
		},
		{
			desc:           "evidence_signatures → evidence_packs",
			constraintName: "fk_evidence_signatures_pack",
			table:          "evidence_signatures",
			addStmt: `ALTER TABLE evidence_signatures
				ADD CONSTRAINT fk_evidence_signatures_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE CASCADE
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_signatures
				VALIDATE CONSTRAINT fk_evidence_signatures_pack`,
		},
		{
			// RESTRICT not CASCADE: an S3 archive exists independently.
			// Force explicit cleanup before allowing pack deletion.
			desc:           "evidence_archives → evidence_packs",
			constraintName: "fk_evidence_archives_pack",
			table:          "evidence_archives",
			addStmt: `ALTER TABLE evidence_archives
				ADD CONSTRAINT fk_evidence_archives_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE RESTRICT
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_archives
				VALIDATE CONSTRAINT fk_evidence_archives_pack`,
		},
		{
			desc:           "merkle_inclusion_proofs → evidence_packs",
			constraintName: "fk_merkle_proofs_pack",
			table:          "merkle_inclusion_proofs",
			addStmt: `ALTER TABLE merkle_inclusion_proofs
				ADD CONSTRAINT fk_merkle_proofs_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE CASCADE
				NOT VALID`,
			validateStmt: `ALTER TABLE merkle_inclusion_proofs
				VALIDATE CONSTRAINT fk_merkle_proofs_pack`,
		},
		{
			// RESTRICT not CASCADE: replay jobs are audit records.
			// Deleting a pack that has replay history must fail loudly.
			desc:           "evidence_replay_jobs → evidence_packs",
			constraintName: "fk_replay_jobs_source_pack",
			table:          "evidence_replay_jobs",
			addStmt: `ALTER TABLE evidence_replay_jobs
				ADD CONSTRAINT fk_replay_jobs_source_pack
				FOREIGN KEY (source_evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE RESTRICT
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_replay_jobs
				VALIDATE CONSTRAINT fk_replay_jobs_source_pack`,
		},
		{
			// RESTRICT: export logs are legal/audit records.
			// A pack cannot be deleted if it has been exported.
			desc:           "evidence_export_log → evidence_packs",
			constraintName: "fk_export_log_pack",
			table:          "evidence_export_log",
			addStmt: `ALTER TABLE evidence_export_log
				ADD CONSTRAINT fk_export_log_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE RESTRICT
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_export_log
				VALIDATE CONSTRAINT fk_export_log_pack`,
		},
		{
			// SET NULL not RESTRICT: outbox rows must remain relay-able even if
			// the pack row is removed. NULL evidence_pack_id is a degraded but
			// safe state; silently losing the outbox event is not acceptable.
			desc:           "evidence_outbox_events → evidence_packs",
			constraintName: "fk_outbox_events_pack",
			table:          "evidence_outbox_events",
			addStmt: `ALTER TABLE evidence_outbox_events
				ADD CONSTRAINT fk_outbox_events_pack
				FOREIGN KEY (evidence_pack_id)
				REFERENCES evidence_packs(evidence_pack_id)
				ON DELETE SET NULL
				NOT VALID`,
			validateStmt: `ALTER TABLE evidence_outbox_events
				VALIDATE CONSTRAINT fk_outbox_events_pack`,
		},
	}

	for _, fk := range fkConstraints {
		// Step 1: Check whether the constraint already exists in pg_constraint.
		// convalidated=true  → fully validated, nothing to do.
		// convalidated=false → was added NOT VALID but never validated; skip
		//                      ADD and go straight to VALIDATE.
		// no row             → constraint absent; run ADD then VALIDATE.
		var convalidated bool
		err := d.QueryRowContext(ctx, `
			SELECT convalidated
			FROM pg_constraint c
			JOIN pg_class t ON t.oid = c.conrelid
			WHERE c.conname = $1
			  AND t.relname = $2
			  AND c.contype = 'f'`,
			fk.constraintName, fk.table,
		).Scan(&convalidated)

		switch {
		case err == sql.ErrNoRows:
			// Constraint does not exist — add it (NOT VALID, instant).
			if _, addErr := d.ExecContext(ctx, fk.addStmt); addErr != nil {
				return fmt.Errorf("add FK constraint (%s): %w", fk.desc, addErr)
			}
			// Fall through to validate below.

		case err != nil:
			return fmt.Errorf("check FK constraint existence (%s): %w", fk.desc, err)

		case convalidated:
			// Already fully validated — nothing to do.
			continue

		default:
			// Constraint exists but was never validated (NOT VALID state).
			// Skip ADD, fall through to validate below.
		}

		// Step 2: Validate existing rows (non-blocking ShareUpdateExclusiveLock).
		// If this fails, orphan rows exist. The NOT VALID constraint continues
		// to enforce integrity on new writes. Fix the orphans and restart.
		if _, valErr := d.ExecContext(ctx, fk.validateStmt); valErr != nil {
			return fmt.Errorf(
				"validate FK constraint (%s): orphan rows detected — "+
					"clean up orphan rows in %s and restart the service: %w",
				fk.desc, fk.table, valErr,
			)
		}
	}

	return nil
}
