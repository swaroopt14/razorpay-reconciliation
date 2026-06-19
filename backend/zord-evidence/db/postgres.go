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
			leaf_hash        TEXT NOT NULL,
			proof_path_json  JSONB NOT NULL,
			created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY(evidence_pack_id, leaf_hash)
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
	}

	for _, s := range stmts {
		if _, err := d.ExecContext(ctx, s); err != nil {
			return fmt.Errorf("ensure table: %w (stmt: %.80s)", err, s)
		}
	}

	// ── Schema migrations (add columns that may be missing on older DBs) ──────
	// Add new ALTER TABLE statements here when columns are added to existing tables.
	// These are idempotent — safe to run on every startup.
	migrations := []string{
		// Add future column migrations here, e.g.:
		// `ALTER TABLE evidence_packs ADD COLUMN IF NOT EXISTS new_column TEXT;`,
		`ALTER TABLE pending_leaf_candidates ADD COLUMN IF NOT EXISTS client_payout_ref TEXT;`,
		`ALTER TABLE evidence_packs ADD COLUMN IF NOT EXISTS client_payout_ref TEXT;`,
	}
	for _, m := range migrations {
		if _, err := d.ExecContext(ctx, m); err != nil {
			return fmt.Errorf("migration: %w (stmt: %.80s)", err, m)
		}
	}

	return nil
}
