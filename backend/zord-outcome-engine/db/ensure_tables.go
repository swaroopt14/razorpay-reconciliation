package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

/*
Old idempotency used a single settlement_ingest_jobs table plus CheckByFingerprint,
JobIDExists, and a single-table ingest_fingerprint uniqueness check to suppress
duplicate uploads and guard force-reprocess batch reuse.

That is being replaced with a two-table model: settlement_batches stores the
client-visible batch identity, while settlement_ingest_runs stores each versioned
processing attempt for that batch.

What is not changing: parsing, canonicalization, outbox emission, and attachment
engine business behavior all remain the same; this change only swaps the ingest
idempotency and run-tracking model underneath them.
*/
var DB *sql.DB

func EnsureTables(ctx context.Context) error {
	if DB == nil {
		return fmt.Errorf("db is nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS canonical_intents (
			intent_id                UUID PRIMARY KEY,
			tenant_id                UUID NOT NULL,
			contract_id              UUID,
			client_payout_ref        TEXT,
			client_batch_ref         TEXT,
			business_idempotency_key TEXT,
			amount             NUMERIC(20,2) NOT NULL,
			currency_code            TEXT NOT NULL,
			intended_execution_at    TIMESTAMPTZ,
			payout_type              TEXT,
			provider_hint            TEXT,
			corridor                 TEXT,
			proof_readiness_score    NUMERIC(5,4) NOT NULL DEFAULT 0,
			matchability_score       NUMERIC(5,4) NOT NULL DEFAULT 0,
			canonical_hash           TEXT NOT NULL,
			governance_state         TEXT NOT NULL,
			beneficiary_fingerprint  TEXT,
			zord_signature_carrier   TEXT,
			source_row_num           INT,
			created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_tenant_idx
			ON canonical_intents(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_client_ref_idx
			ON canonical_intents(client_payout_ref) WHERE client_payout_ref IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_amount_currency_idx
			ON canonical_intents(tenant_id, amount, currency_code);`,
		// Index to support the reverse scan master intent list query.
		`CREATE INDEX IF NOT EXISTS canonical_intents_client_batch_ref_idx
			ON canonical_intents(tenant_id, client_batch_ref) WHERE client_batch_ref IS NOT NULL;`,
		`CREATE TABLE IF NOT EXISTS dispatch_index(
	dispatch_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	intent_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL,
	attempt_count INT NOT NULL DEFAULT 0,
	provider_attempt_id TEXT,
	correlation_carriers JSONB,
	provider_ref_hashes TEXT[]
);`,
		`
CREATE TABLE IF NOT EXISTS raw_outcome_envelopes(
	raw_outcome_envelope_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	source_class TEXT NOT NULL,
	received_at TIMESTAMPTZ NOT NULL,
	raw_bytes_sha256 BYTEA NOT NULL,
	object_store_ref TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS raw_outcome_envelopes_tenant_sha256_uq ON raw_outcome_envelopes(tenant_id, raw_bytes_sha256);`,
		`
CREATE TABLE IF NOT EXISTS canonical_outcome_events(
	event_id UUID PRIMARY KEY,
	raw_outcome_envelope_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	contract_id UUID,
	intent_id UUID,
	dispatch_id UUID,
	trace_id UUID,
	connector_id UUID NOT NULL,
	corridor_id TEXT,
	source_class TEXT NOT NULL,
	status_candidate TEXT NOT NULL,
	provider_ref_hash TEXT,
	provider_event_id TEXT,
	utr TEXT,
	amount NUMERIC(20,2),
	currency TEXT,
	observed_at TIMESTAMPTZ,
	received_at TIMESTAMPTZ NOT NULL,
	correlation_confidence INT NOT NULL DEFAULT 0,
	dedupe_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS canonical_outcome_events_dedupe_key_uq ON canonical_outcome_events(dedupe_key);`,
		`CREATE INDEX IF NOT EXISTS canonical_outcome_events_contract_idx ON canonical_outcome_events(contract_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_outcome_events_dispatch_idx ON canonical_outcome_events(dispatch_id);`,

		`
CREATE TABLE IF NOT EXISTS fused_outcomes(
	contract_id UUID PRIMARY KEY,
	current_state TEXT NOT NULL,
	finality_certificate_id UUID,
	final_state TEXT,
	finality_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	finality_basis TEXT,
	rule_version TEXT NOT NULL,
	divergence_flags JSONB,
	last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`
CREATE TABLE IF NOT EXISTS poll_schedule(
	contract_id UUID PRIMARY KEY,
	dispatch_id UUID NOT NULL,
	next_poll_at TIMESTAMPTZ NOT NULL,
	poll_stage INT NOT NULL,
	last_poll_at TIMESTAMPTZ,
	poll_failures INT NOT NULL DEFAULT 0,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL
);`,
		`
CREATE TABLE IF NOT EXISTS finality_certificates(
	finality_certificate_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	final_state TEXT NOT NULL,
	confidence INT NOT NULL,
	input_hashes JSONB NOT NULL,
	rule_id TEXT NOT NULL,
	signature TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`
CREATE TABLE IF NOT EXISTS settlement_batches (
	settlement_batch_id     TEXT PRIMARY KEY,
	tenant_id               UUID NOT NULL,
	psp                     TEXT NOT NULL,
	client_batch_id         TEXT NOT NULL,
	current_active_run_id   TEXT,
	latest_run_number       INT NOT NULL DEFAULT 0,
	status                  TEXT NOT NULL DEFAULT 'ACTIVE',
	created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS settlement_batches_tenant_psp_client_uq
			ON settlement_batches(tenant_id, psp, client_batch_id);`,
		`CREATE INDEX IF NOT EXISTS settlement_batches_tenant_idx
			ON settlement_batches(tenant_id);`,
		`
CREATE TABLE IF NOT EXISTS settlement_ingest_runs (
	ingest_run_id            TEXT PRIMARY KEY,
	settlement_batch_id      TEXT NOT NULL REFERENCES settlement_batches(settlement_batch_id),
	tenant_id                UUID NOT NULL,
	psp                      TEXT NOT NULL,
	settlement_envelope_id   UUID NOT NULL,
	artifact_family          TEXT NOT NULL,
	source_system            TEXT NOT NULL,
	connector_id             UUID,
	mapping_profile_id       TEXT NOT NULL,
	mapping_profile_version  TEXT NOT NULL,
	parser_version           TEXT NOT NULL DEFAULT '',
	file_sha256              TEXT NOT NULL DEFAULT '',
	run_number               INT NOT NULL DEFAULT 1,
	force_reprocess          BOOLEAN NOT NULL DEFAULT FALSE,
	reprocess_reason         TEXT,
	run_status               TEXT NOT NULL DEFAULT 'PARSING',
	row_count_expected       INT,
	row_count_parsed         INT NOT NULL DEFAULT 0,
	row_count_canonicalized  INT NOT NULL DEFAULT 0,
	row_count_failed         INT NOT NULL DEFAULT 0,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	started_at               TIMESTAMPTZ,
	completed_at             TIMESTAMPTZ,
	failure_reason_code      TEXT,
	created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_runs_batch_idx
			ON settlement_ingest_runs(settlement_batch_id);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_runs_tenant_idx
			ON settlement_ingest_runs(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_runs_status_idx
			ON settlement_ingest_runs(run_status);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_runs_envelope_idx
			ON settlement_ingest_runs(settlement_envelope_id);`,

		`
CREATE TABLE IF NOT EXISTS settlement_parsed_rows(
	parsed_row_id UUID PRIMARY KEY,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	tenant_id UUID NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_row_ref TEXT NOT NULL,
	raw_line_hash TEXT,
	raw_columns_json JSONB NOT NULL,
	parsed_candidates_json JSONB NOT NULL,
	parse_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	parse_quality_label TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	client_batch_id TEXT,
	status TEXT NOT NULL DEFAULT 'PARSED',
	failure_reason_code TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS settlement_parsed_rows_run_idx ON settlement_parsed_rows(ingest_run_id);`,

		`
CREATE TABLE IF NOT EXISTS canonical_settlement_observations(
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
);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_tenant_idx ON canonical_settlement_observations(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_obs_run_idx ON canonical_settlement_observations(ingest_run_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_obs_batch_idx ON canonical_settlement_observations(settlement_batch_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_envelope_idx ON canonical_settlement_observations(settlement_envelope_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_trace_idx ON canonical_settlement_observations(trace_id);`,

		`
CREATE TABLE IF NOT EXISTS canonical_settlement_batches(
	settlement_batch_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id_ref TEXT NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	source_batch_ref TEXT,
	client_batch_id TEXT NOT NULL,
	artifact_family TEXT NOT NULL,
	row_count INT NOT NULL DEFAULT 0,
	success_count_estimate INT NOT NULL DEFAULT 0,
	failed_count_estimate INT NOT NULL DEFAULT 0,
	pending_count_estimate INT NOT NULL DEFAULT 0,
	reversal_count_estimate INT NOT NULL DEFAULT 0,
	total_amount NUMERIC(20,2) NOT NULL,
	total_settled_amount NUMERIC(20,2) NOT NULL,
	currency_code TEXT NOT NULL,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	attachment_readiness_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS canonical_settlement_batches_run_client_idx ON canonical_settlement_batches(ingest_run_id, client_batch_id);`,

		`
CREATE TABLE IF NOT EXISTS settlement_parse_errors(
	error_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	source_row_ref TEXT,
	error_stage TEXT NOT NULL,
	reason_code TEXT NOT NULL,
	reason_detail_redacted TEXT,
	severity TEXT NOT NULL,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parser_version TEXT NOT NULL DEFAULT '',
	client_batch_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS settlement_parse_errors_run_idx ON settlement_parse_errors(ingest_run_id);`,

		`
CREATE TABLE IF NOT EXISTS settlement_outbox_events(
	outbox_event_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID,
	ingest_run_id TEXT NOT NULL,
	settlement_batch_id TEXT NOT NULL,
	entity_family TEXT NOT NULL,
	entity_id UUID NOT NULL,
	event_type TEXT NOT NULL,
	payload_json JSONB NOT NULL,
	status TEXT NOT NULL,
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	published_at TIMESTAMPTZ,
	lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ
);`,
		`CREATE INDEX IF NOT EXISTS settlement_outbox_events_status_idx ON settlement_outbox_events(status, next_retry_at);`,
		`CREATE INDEX IF NOT EXISTS settlement_outbox_run_idx ON settlement_outbox_events(ingest_run_id);`,

		// ── attachment_jobs ──────────────────────────────────────────────────
		// One row per attachment run (batch or single). Provides replayability
		// and aggregate metrics over a processing cycle.
		`CREATE TABLE IF NOT EXISTS attachment_jobs (
			attachment_job_id        UUID PRIMARY KEY,
			tenant_id                UUID NOT NULL,
			job_scope_type           TEXT NOT NULL,
			scope_ref                TEXT NOT NULL,
			matching_ruleset_version TEXT NOT NULL,
			status                   TEXT NOT NULL,
			candidate_count_total    INT NOT NULL DEFAULT 0,
			exact_match_count        INT NOT NULL DEFAULT 0,
			high_confidence_count    INT NOT NULL DEFAULT 0,
			ambiguous_count          INT NOT NULL DEFAULT 0,
			unresolved_count         INT NOT NULL DEFAULT 0,
			conflicted_count         INT NOT NULL DEFAULT 0,
			started_at               TIMESTAMPTZ,
			completed_at             TIMESTAMPTZ,
			created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_jobs_tenant_idx
			ON attachment_jobs(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_jobs_status_idx
			ON attachment_jobs(status);`,

		// ── attachment_candidates ────────────────────────────────────────────
		// Every candidate evaluated for an intent, with per-carrier match flags
		// and score breakdown. Never deleted — required for RCA replay.
		`CREATE TABLE IF NOT EXISTS attachment_candidates (
			candidate_id                UUID PRIMARY KEY,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			tenant_id                   UUID NOT NULL,
			settlement_observation_id   UUID NOT NULL,
			intent_id                   UUID NOT NULL,
			candidate_rank              INT NOT NULL DEFAULT 0,

			-- per-carrier match flags
			exact_ref_match_flag        BOOLEAN NOT NULL DEFAULT FALSE,
			client_ref_match_flag       BOOLEAN NOT NULL DEFAULT FALSE,
			provider_ref_match_flag     BOOLEAN NOT NULL DEFAULT FALSE,
			bank_ref_match_flag         BOOLEAN NOT NULL DEFAULT FALSE,
			batch_match_flag            BOOLEAN NOT NULL DEFAULT FALSE,
			amount_match_flag           BOOLEAN NOT NULL DEFAULT FALSE,
			currency_match_flag         BOOLEAN NOT NULL DEFAULT FALSE,
			time_window_match_flag      BOOLEAN NOT NULL DEFAULT FALSE,
			source_system_match_flag    BOOLEAN NOT NULL DEFAULT FALSE,
			zord_signature_match_flag   BOOLEAN NOT NULL DEFAULT FALSE,
			composite_match_flag        BOOLEAN NOT NULL DEFAULT FALSE,

			-- scoring
			score_total                 NUMERIC(8,4) NOT NULL DEFAULT 0,
			score_breakdown_json        JSONB NOT NULL,
			confidence_bucket           TEXT NOT NULL,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_observation_idx
			ON attachment_candidates(settlement_observation_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_intent_idx
			ON attachment_candidates(intent_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_job_idx
			ON attachment_candidates(attachment_job_id);`,

		// ── attachment_decisions ─────────────────────────────────────────────
		// The formal attachment truth artifact. One row per intent per job.
		// Upserted so replays overwrite stale decisions cleanly.
		`CREATE TABLE IF NOT EXISTS attachment_decisions (
			attachment_decision_id      UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			settlement_observation_id   UUID,
			intent_id                   UUID,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			decision_type               TEXT NOT NULL,
			decision_reason_code        TEXT NOT NULL,
			decision_reason_detail_json JSONB,
			matching_ruleset_version    TEXT NOT NULL,
			winning_score               NUMERIC(8,4) NOT NULL DEFAULT 0,
			runner_up_score             NUMERIC(8,4),
			score_margin                NUMERIC(8,4),
			relative_score_margin       NUMERIC(8,4),
			confidence_score            NUMERIC(5,4) NOT NULL DEFAULT 0,
			ambiguity_score             NUMERIC(5,4) NOT NULL DEFAULT 0,
			match_confidence            NUMERIC(5,4) NOT NULL DEFAULT 0,
			supporting_carriers_json    JSONB,
			candidate_set_hash          TEXT NOT NULL,
			candidate_set_snapshot_ref  TEXT,
			candidate_set_size          INT NOT NULL DEFAULT 0,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		// One authoritative decision per intent. Replays upsert by this key.
		`CREATE UNIQUE INDEX IF NOT EXISTS attachment_decisions_intent_uq
			ON attachment_decisions(intent_id, attachment_job_id);`,
		// One observed decision per settlement observation in a job. Unresolved
		// intent decisions intentionally have no observation id.
		`CREATE UNIQUE INDEX IF NOT EXISTS attachment_decisions_observation_job_uq
			ON attachment_decisions(settlement_observation_id, attachment_job_id)
			WHERE settlement_observation_id IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS attachment_decisions_observation_idx
			ON attachment_decisions(settlement_observation_id) WHERE settlement_observation_id IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS attachment_decisions_intent_idx
			ON attachment_decisions(intent_id) WHERE intent_id IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS attachment_decisions_type_idx
			ON attachment_decisions(decision_type);`,

		// ── variance_records ─────────────────────────────────────────────────
		// Intent-vs-observation difference record. Created for every attached pair.
		// Value-date mismatch and cross-period are first-class per the spec.
		//
		// Changes from PDF review (sections 8 & 9):
		//   • variance_type      — classifies the nature of the variance
		//                          (NO_VARIANCE | UNDER_SETTLEMENT | OVER_SETTLEMENT |
		//                           FEE_DEDUCTION | TAX_TDS_DEDUCTION | ROUNDING |
		//                           STATUS_MISMATCH | VALUE_DATE_MISMATCH | CROSS_PERIOD)
		//   • is_whitelisted     — TRUE when variance is expected/approved (e.g. PSP fees,
		//                          TDS, commissions). Service 7 must not count whitelisted
		//                          variance as leakage.
		//   • whitelist_policy_id / whitelist_policy_version — the policy that approved it.
		//   • whitelist_reason_code / whitelist_explanation   — human-readable audit trail.
		`CREATE TABLE IF NOT EXISTS variance_records (
			variance_record_id          UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			attachment_decision_id      UUID NOT NULL REFERENCES attachment_decisions(attachment_decision_id),
			intent_id                   UUID NOT NULL,
			settlement_observation_id   UUID NOT NULL,

			-- amount deltas
			amount_variance       NUMERIC(20,2) NOT NULL DEFAULT 0,
			deduction_variance    NUMERIC(20,2),
			fee_variance          NUMERIC(20,2),

			-- status & timing flags
			currency_match_flag         BOOLEAN NOT NULL DEFAULT TRUE,
			status_variance_flag        BOOLEAN NOT NULL DEFAULT FALSE,
			value_date_mismatch_flag    BOOLEAN NOT NULL DEFAULT FALSE,
			settlement_delay_days       INT NOT NULL DEFAULT 0,
			cross_period_flag           BOOLEAN NOT NULL DEFAULT FALSE,

			-- evidence quality flags
			provider_ref_missing_flag   BOOLEAN NOT NULL DEFAULT FALSE,
			bank_ref_missing_flag       BOOLEAN NOT NULL DEFAULT FALSE,
			evidence_gap_flag           BOOLEAN NOT NULL DEFAULT FALSE,

			-- variance classification (PDF review section 9)
			variance_type               TEXT NOT NULL DEFAULT 'NO_VARIANCE',

			-- severity
			variance_severity           TEXT NOT NULL,
			variance_reason_codes_json  JSONB,

			-- whitelist fields (PDF review sections 8 & 9)
			-- A separate whitelist policy service populates these in a subsequent pass.
			-- Default: not whitelisted.
			is_whitelisted              BOOLEAN NOT NULL DEFAULT FALSE,
			whitelist_policy_id         TEXT,
			whitelist_policy_version    TEXT,
			whitelist_reason_code       TEXT,
			whitelist_explanation       TEXT,

			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS variance_records_decision_idx
			ON variance_records(attachment_decision_id);`,
		`CREATE INDEX IF NOT EXISTS variance_records_intent_idx
			ON variance_records(intent_id);`,
		`CREATE INDEX IF NOT EXISTS variance_records_severity_idx
			ON variance_records(variance_severity);`,
		// Allows Service 7 to quickly query all non-whitelisted variances.
		`CREATE INDEX IF NOT EXISTS variance_records_whitelisted_idx
			ON variance_records(is_whitelisted);`,

		// ── batch_attachment_summaries ───────────────────────────────────────
		// Derived batch-level view: one row per batch per attachment job.
		`CREATE TABLE IF NOT EXISTS batch_attachment_summaries (
			batch_attachment_summary_id UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			batch_id                    TEXT,
			source_reference            TEXT NOT NULL,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),

			-- counts
			total_intent_count          INT NOT NULL DEFAULT 0,
			total_observation_count     INT NOT NULL DEFAULT 0,
			matched_intent_count        INT NOT NULL DEFAULT 0,
			matched_observation_count   INT NOT NULL DEFAULT 0,
			exact_match_count           INT NOT NULL DEFAULT 0,
			high_confidence_count       INT NOT NULL DEFAULT 0,
			ambiguous_count             INT NOT NULL DEFAULT 0,
			unresolved_count            INT NOT NULL DEFAULT 0,
			conflicted_count            INT NOT NULL DEFAULT 0,
			orphan_observation_count    INT NOT NULL DEFAULT 0,

			-- amount aggregates
			original_intended_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
			original_settled_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
	
			total_intended_amount      NUMERIC(20,2) NOT NULL DEFAULT 0,
			total_observed_amount      NUMERIC(20,2) NOT NULL DEFAULT 0,
			total_variance             NUMERIC(20,2) NOT NULL DEFAULT 0,
			matched_intended_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
			matched_observed_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
			orphan_observed_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
			matched_pair_variance      NUMERIC(20,2) NOT NULL DEFAULT 0,
			net_batch_delta            NUMERIC(20,2) NOT NULL DEFAULT 0,

			unresolved_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
			ambiguous_amount           NUMERIC(20,2) NOT NULL DEFAULT 0,
			conflicted_amount          NUMERIC(20,2) NOT NULL DEFAULT 0,
			ambiguous_observed_amount  NUMERIC(20,2) NOT NULL DEFAULT 0,
			conflicted_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
			unresolved_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
			
			total_fee_amount           NUMERIC(20,2) NOT NULL DEFAULT 0,
			total_deduction_amount     NUMERIC(20,2) NOT NULL DEFAULT 0,
			net_unexplained_variance   NUMERIC(20,2) NOT NULL DEFAULT 0,

			intent_count_coverage                 NUMERIC(10,6) NOT NULL DEFAULT 0,
			intent_value_coverage                 NUMERIC(10,6) NOT NULL DEFAULT 0,
			observed_count_allocation_coverage    NUMERIC(10,6) NOT NULL DEFAULT 0,
			observed_value_allocation_coverage    NUMERIC(10,6) NOT NULL DEFAULT 0,

			-- derived status
			batch_attachment_status     TEXT NOT NULL,
			avg_matched_attachment_quality             NUMERIC(10,4) NOT NULL DEFAULT 0,
			avg_matched_attachment_ambiguity             NUMERIC(10,4) NOT NULL DEFAULT 0,
			avg_matched_attachment_confidence  NUMERIC(10,4) NOT NULL DEFAULT 0,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS batch_attachment_summaries_tenant_idx
			ON batch_attachment_summaries(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS batch_attachment_summaries_job_idx
			ON batch_attachment_summaries(attachment_job_id);`,

		// ── attachment_rule_profiles ─────────────────────────────────────────
		// Tenant-scoped matching configuration. Keeps the engine deterministic
		// while allowing per-tenant carrier priorities and time window policies.
		`CREATE TABLE IF NOT EXISTS attachment_rule_profiles (
			profile_id                    TEXT NOT NULL,
			tenant_id                     UUID NOT NULL,
			version                       TEXT NOT NULL,
			exact_ref_priority_json       JSONB,
			carrier_priority_json         JSONB,
			time_window_policy_json       JSONB,
			amount_tolerance_policy_json  JSONB,
			batch_boundary_policy_json    JSONB,
			manual_review_thresholds_json JSONB,
			ambiguity_margin_threshold    NUMERIC(10,2) NOT NULL DEFAULT 0.15,
			requires_bank_ref_for_exact_flag BOOLEAN NOT NULL DEFAULT FALSE,
			status                        TEXT NOT NULL DEFAULT 'ACTIVE',
			created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (profile_id, tenant_id, version)
		);`,

		// ── attachment_outbox_events ─────────────────────────────────────────
		// Durable outbox for Service 5C downstream events.
		// Mirrors settlement_outbox_events but scoped to attachment domain.
		`CREATE TABLE IF NOT EXISTS attachment_outbox_events (
			outbox_event_id   UUID PRIMARY KEY,
			tenant_id         UUID NOT NULL,
			trace_id          UUID ,
			attachment_job_id UUID NOT NULL,
			entity_family     TEXT NOT NULL,
			entity_id         UUID NOT NULL,
			event_type        TEXT NOT NULL,
			payload_json      JSONB NOT NULL,
			status            TEXT NOT NULL,
			attempts          INT NOT NULL DEFAULT 0,
			next_retry_at     TIMESTAMPTZ,
			created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			published_at      TIMESTAMPTZ,
			lease_id          UUID,
			leased_by         TEXT,
			lease_until       TIMESTAMPTZ
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_outbox_status_idx
			ON attachment_outbox_events(status, next_retry_at);`,
		`CREATE INDEX IF NOT EXISTS attachment_outbox_job_idx
			ON attachment_outbox_events(attachment_job_id);`,

		// ── outcome_outbox ────────────────────────────────────────────────────
		// Relay-facing outbox: carries Merkle leaf bundle events destined for
		// zord-evidence (Service 6) via zord-relay → payments.outcome.events.v1.
		// Schema mirrors the intent-engine outbox so the same OutboxPullRepo
		// and OutboxHandler can serve it with zero code duplication.
		`CREATE TABLE IF NOT EXISTS outcome_outbox (
			event_id        UUID PRIMARY KEY,
			envelope_id     UUID,
			trace_id        UUID,
			tenant_id       UUID NOT NULL,
			contract_id     TEXT,
			aggregate_type  TEXT NOT NULL,
			aggregate_id    UUID NOT NULL,
			event_type      TEXT NOT NULL,
			schema_version  TEXT NOT NULL DEFAULT 'v1',
			payload         JSONB NOT NULL,
			payload_hash    BYTEA,
			status          TEXT NOT NULL DEFAULT 'PENDING',
			retry_count     INT  NOT NULL DEFAULT 0,
			next_attempt_at TIMESTAMPTZ,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			sent_at         TIMESTAMPTZ,
			lease_id        UUID,
			leased_by       TEXT,
			lease_until     TIMESTAMPTZ,
			batchid         TEXT,
			settlement_record_received TIMESTAMPTZ,
			canonical_settlement_created TIMESTAMPTZ,
			bank_reference              TEXT,
			client_reference            TEXT,
			attachment_decision        TEXT,
			match_confidence           DOUBLE PRECISION,
			value_date_check            BOOLEAN,
			amount_match                BOOLEAN,
			bank_id                    TEXT,
			source_system              TEXT,
			corridor_id                TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS outcome_outbox_status_idx
			ON outcome_outbox(status, next_attempt_at);`,
		`CREATE INDEX IF NOT EXISTS outcome_outbox_tenant_idx
			ON outcome_outbox(tenant_id);`,

		// ── unresolved_intent_records ─────────────────────────────────────────
		// Reverse scan output (PDF review section 10).
		//
		// Records every canonical intent for which no acceptable settlement
		// observation was found within the expected attachment window after a
		// SETTLEMENT_BATCH attachment job completes.
		//
		// This table is the only mechanism by which Zord can prove that every
		// dollar intended to be paid was accounted for (or explicitly flagged
		// as missing).  It powers:
		//   • leakage intelligence in Service 7
		//   • pending-beyond-SLA alerts
		//   • unmatched intent RCA
		//   • replay / backfill action triggers
		//
		// reason_code values:
		//   NO_SETTLEMENT_OBSERVATION_FOUND   — intent never appeared as a candidate
		//   SOURCE_FILE_NOT_RECEIVED          — reserved for future use by scheduler
		`CREATE TABLE IF NOT EXISTS unresolved_intent_records (
			unresolved_id        UUID PRIMARY KEY,
			tenant_id            UUID NOT NULL,
			attachment_job_id    UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			intent_id            UUID NOT NULL,
			batch_id             TEXT,
			expected_window_end  TIMESTAMPTZ,
			reason_code          TEXT NOT NULL,
			amount               NUMERIC(20,2) NOT NULL,
			currency_code        TEXT NOT NULL,
			created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS unresolved_intent_records_tenant_idx
			ON unresolved_intent_records(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS unresolved_intent_records_job_idx
			ON unresolved_intent_records(attachment_job_id);`,
		`CREATE INDEX IF NOT EXISTS unresolved_intent_records_intent_idx
			ON unresolved_intent_records(intent_id);`,
		`CREATE INDEX IF NOT EXISTS unresolved_intent_records_batch_idx
			ON unresolved_intent_records(batch_id) WHERE batch_id IS NOT NULL;`,

		// ── ambiguous_intent_records ──────────────────────────────────────────
		// Intents resolved as MATCH_AMBIGUOUS during an attachment job.
		`CREATE TABLE IF NOT EXISTS ambiguous_intent_records (
			ambiguous_id         UUID PRIMARY KEY,
			tenant_id            UUID NOT NULL,
			attachment_job_id    UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			intent_id            UUID NOT NULL,
			batch_id             TEXT,
			expected_window_end  TIMESTAMPTZ,
			reason_code          TEXT NOT NULL,
			amount               NUMERIC(20,2) NOT NULL,
			currency_code        TEXT NOT NULL,
			created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS ambiguous_intent_records_tenant_idx
			ON ambiguous_intent_records(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS ambiguous_intent_records_job_idx
			ON ambiguous_intent_records(attachment_job_id);`,
		`CREATE INDEX IF NOT EXISTS ambiguous_intent_records_intent_idx
			ON ambiguous_intent_records(intent_id);`,
		`CREATE INDEX IF NOT EXISTS ambiguous_intent_records_batch_idx
			ON ambiguous_intent_records(batch_id) WHERE batch_id IS NOT NULL;`,

		// ── conflicted_intent_records ─────────────────────────────────────────
		// Intents resolved as MATCH_CONFLICTED during an attachment job.
		`CREATE TABLE IF NOT EXISTS conflicted_intent_records (
			conflicted_id        UUID PRIMARY KEY,
			tenant_id            UUID NOT NULL,
			attachment_job_id    UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			intent_id            UUID NOT NULL,
			batch_id             TEXT,
			expected_window_end  TIMESTAMPTZ,
			reason_code          TEXT NOT NULL,
			amount               NUMERIC(20,2) NOT NULL,
			currency_code        TEXT NOT NULL,
			created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS conflicted_intent_records_tenant_idx
			ON conflicted_intent_records(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS conflicted_intent_records_job_idx
			ON conflicted_intent_records(attachment_job_id);`,
		`CREATE INDEX IF NOT EXISTS conflicted_intent_records_intent_idx
			ON conflicted_intent_records(intent_id);`,
		`CREATE INDEX IF NOT EXISTS conflicted_intent_records_batch_idx
			ON conflicted_intent_records(batch_id) WHERE batch_id IS NOT NULL;`,

		// ── orphan_settlement_records ─────────────────────────────────────────
		// Records every canonical settlement observation that was not matched
		// during an attachment job (reverse scan for intent-centric engine).
		`CREATE TABLE IF NOT EXISTS orphan_settlement_records (
			orphan_id            UUID PRIMARY KEY,
			tenant_id            UUID NOT NULL,
			attachment_job_id    UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			settlement_observation_id UUID NOT NULL,
			batch_id             TEXT,
			unresolved_reason    TEXT NOT NULL,
			amount               NUMERIC(20,2) NOT NULL,
			currency_code        TEXT NOT NULL,
			created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS orphan_settlement_records_tenant_idx
			ON orphan_settlement_records(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS orphan_settlement_records_job_idx
			ON orphan_settlement_records(attachment_job_id);`,
		`CREATE INDEX IF NOT EXISTS orphan_settlement_records_obs_idx
			ON orphan_settlement_records(settlement_observation_id);`,
		`CREATE INDEX IF NOT EXISTS orphan_settlement_records_batch_idx
			ON orphan_settlement_records(batch_id) WHERE batch_id IS NOT NULL;`,

		// ── Schema migrations (add columns that may be missing on older DBs) ──
		`ALTER TABLE canonical_intents ADD COLUMN IF NOT EXISTS source_row_num INT;`,
		`ALTER TABLE canonical_settlement_observations ADD COLUMN IF NOT EXISTS bank_id TEXT;`,
		`ALTER TABLE outcome_outbox ADD COLUMN IF NOT EXISTS bank_id TEXT;`,
		`ALTER TABLE attachment_decisions ALTER COLUMN settlement_observation_id DROP NOT NULL;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS total_observation_count INT NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS orphan_observation_count INT NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS matched_intent_count INT NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS matched_observation_count INT NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS matched_intended_amount NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS matched_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS orphan_observed_amount NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS matched_pair_variance NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS net_batch_delta NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS intent_count_coverage NUMERIC(10,6) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS intent_value_coverage NUMERIC(10,6) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS observed_count_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS observed_value_allocation_coverage NUMERIC(10,6) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS ambiguous_amount NUMERIC(20,2) NOT NULL DEFAULT 0;`,
		`ALTER TABLE batch_attachment_summaries ADD COLUMN IF NOT EXISTS conflicted_amount NUMERIC(20,2) NOT NULL DEFAULT 0;`,
	}

	for _, s := range stmts {
		if _, err := DB.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func SeedDefaultAttachmentRuleProfile(ctx context.Context, tenantID interface{}) error {
	defaultRulesetJSON := []byte(`{
  "profile_id": "default_profile",
  "tenant_id": "YOUR_TENANT_UUID",
  "version": "v1",

  "exact_ref_priority_json": {
    "priority_order": [
      "zord_signature",
      "client_payout_ref",
      "provider_reference",
      "bank_reference"
    ]
  },

  "carrier_priority_json": {
    "exact_ref": 120,
    "client_ref": 100,
    "provider_ref": 85,
    "bank_ref": 85,
    "zord_signature": 120,
    "beneficiary_match": 35,
    "amount_match": 30,
    "currency_match": 10,
    "batch_match": 90,
    "time_window": 20,
    "source_system": 10,
    "parse_confidence_modifier": -20,
    "source_strength_modifier": -15,
    "conflict_penalty": -70
  },

  "time_window_policy_json": {
    "max_hours_difference": 72,
    "strict_same_day": false,
    "allow_cross_period": true
  },

  "amount_tolerance_policy_json": {
    "exact_match_required": true,
    "tolerance_minor": 0,
    "allow_percentage_tolerance": false,
    "percentage_tolerance": 0
  },

  "batch_boundary_policy_json": {
    "strict_batch_matching": false,
    "allow_cross_batch_if_strong_match": true
  },

  "manual_review_thresholds_json": {
    "high_confidence_score": 135,
    "exact_match_score": 200,
    "ambiguity_margin_threshold": 15,
    "min_score_for_auto_attach": 80,
    "max_candidates_for_auto_attach": 1
  },

  "ambiguity_margin_threshold": 0.15,
  "requires_bank_ref_for_exact_flag": false,
  "status": "ACTIVE"
}`)

	var ruleset struct {
		ProfileID                   string          `json:"profile_id"`
		Version                     string          `json:"version"`
		ExactRefPriorityJSON        json.RawMessage `json:"exact_ref_priority_json"`
		CarrierPriorityJSON         json.RawMessage `json:"carrier_priority_json"`
		TimeWindowPolicyJSON        json.RawMessage `json:"time_window_policy_json"`
		AmountTolerancePolicyJSON   json.RawMessage `json:"amount_tolerance_policy_json"`
		BatchBoundaryPolicyJSON     json.RawMessage `json:"batch_boundary_policy_json"`
		ManualReviewThresholdsJSON  json.RawMessage `json:"manual_review_thresholds_json"`
		AmbiguityMarginThreshold    float64         `json:"ambiguity_margin_threshold"`
		RequiresBankRefForExactFlag bool            `json:"requires_bank_ref_for_exact_flag"`
		Status                      string          `json:"status"`
	}

	if err := json.Unmarshal(defaultRulesetJSON, &ruleset); err != nil {
		return fmt.Errorf("failed to unmarshal default ruleset JSON: %w", err)
	}

	stmt := `
		INSERT INTO attachment_rule_profiles (
			profile_id, tenant_id, version,
			exact_ref_priority_json, carrier_priority_json,
			time_window_policy_json, amount_tolerance_policy_json,
			batch_boundary_policy_json, manual_review_thresholds_json,
			ambiguity_margin_threshold, requires_bank_ref_for_exact_flag,
			status
		) VALUES (
			$1, $2, $3,
			$4, $5,
			$6, $7,
			$8, $9,
			$10, $11,
			$12
		) ON CONFLICT (profile_id, tenant_id, version) DO UPDATE SET
			exact_ref_priority_json = EXCLUDED.exact_ref_priority_json,
			carrier_priority_json = EXCLUDED.carrier_priority_json,
			time_window_policy_json = EXCLUDED.time_window_policy_json,
			amount_tolerance_policy_json = EXCLUDED.amount_tolerance_policy_json,
			batch_boundary_policy_json = EXCLUDED.batch_boundary_policy_json,
			manual_review_thresholds_json = EXCLUDED.manual_review_thresholds_json,
			ambiguity_margin_threshold = EXCLUDED.ambiguity_margin_threshold,
			requires_bank_ref_for_exact_flag = EXCLUDED.requires_bank_ref_for_exact_flag,
			status = EXCLUDED.status;
	`
	_, err := DB.ExecContext(ctx, stmt,
		ruleset.ProfileID, tenantID, ruleset.Version,
		string(ruleset.ExactRefPriorityJSON), string(ruleset.CarrierPriorityJSON),
		string(ruleset.TimeWindowPolicyJSON), string(ruleset.AmountTolerancePolicyJSON),
		string(ruleset.BatchBoundaryPolicyJSON), string(ruleset.ManualReviewThresholdsJSON),
		ruleset.AmbiguityMarginThreshold, ruleset.RequiresBankRefForExactFlag,
		ruleset.Status,
	)
	return err
}
