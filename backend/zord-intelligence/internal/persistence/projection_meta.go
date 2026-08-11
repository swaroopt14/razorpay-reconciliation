package persistence

// projection_meta.go — Phase 3 refactor: the scoped/source-aware metadata
// vocabulary for projection_state (blueprint §6 Phase 3, §5.3).
//
// THE CONTRACT: db/migrations/009_projection_state_backfill.sql derives these
// exact values for pre-Phase-3 rows; the Go writers stamp them on every new
// row. projection_meta_test.go asserts the Go derivation (keyToProjectionMeta)
// and the SQL derivation stay in sync, so backfilled and freshly-written rows
// are indistinguishable.
//
// HOW WRITERS STAMP METADATA:
//   - Dedicated Atomic* writers inline the per-metric constants as SQL
//     literals (the established idiom — they already inline 'LEAKAGE',
//     'TENANT') and derive scope_ref from params already in the statement
//     ($1 = tenant_id for TENANT scope; regexp on $2 = projection_key for
//     CORRIDOR/SOURCE/PSP/BANK). Only two values ever need appended
//     parameters: projection_source_version (from the Kafka envelope) and,
//     for BATCH-scoped rows, the resolved batch_contracts_core UUID.
//   - The generic Upsert/UpsertWithValue path derives everything through
//     keyToProjectionMeta.
//   - value_hash / source_refs_hash are maintained by the
//     trg_projection_state_hashes trigger (see migration 008), never by Go.
//
// BATCH scope_ref (blueprint §5.3): the batch_contracts_core.batch_contract_id
// UUID — resolved inside the SAME transaction via resolveBatchContractID
// below. Events with no batch reference use the explicit UnbatchedScopeRef
// bucket instead of the former "leakage.batch." junk-key behavior (bug E1),
// which keeps the tenant = Σ batch consistency invariant additive.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
)

// Scope types (blueprint §5.3 vocabulary; BANK is a ZPI addition for
// pattern.bank.* rows, which fit none of the blueprint's six).
const (
	ScopeTenant   = "TENANT"
	ScopeBatch    = "BATCH"
	ScopeIntent   = "INTENT"
	ScopeCorridor = "CORRIDOR"
	ScopePSP      = "PSP"
	ScopeSource   = "SOURCE"
	ScopeBank     = "BANK"
)

// Window types. ROLLING_24H is the blueprint's name for today's calendar-day
// buckets (todayWindow); BATCH_LIFETIME is the fixed 2020→2099 window;
// EPHEMERAL covers rca.frag.* temp rows whose windows are arbitrary.
const (
	WindowRolling24h    = "ROLLING_24H"
	WindowBatchLifetime = "BATCH_LIFETIME"
	WindowEphemeral     = "EPHEMERAL"
)

// Retention classes. No cleanup worker consumes these until Phase 9 — Phase 3
// only stamps them (plus expires_at) so the Phase 9 worker has data to act on.
const (
	RetentionDerivedCache = "DERIVED_CACHE"
	RetentionTempFragment = "TEMP_FRAGMENT"
)

// Projection sources: the upstream event family that computed a row
// (blueprint §16 scenario 5 vocabulary). On multi-source accumulator rows
// (leakage.total, ambiguity.summary, defensibility.summary, pattern.p2_p6,
// rca.summary) the FIRST writer's family sticks — ON CONFLICT never updates
// it; true per-source row splitting is Phase 10 work.
const (
	SourceIntentCreated         = "intent_created"
	SourceSettlementObservation = "settlement_observation"
	SourceAttachmentDecision    = "attachment_decision"
	SourceVarianceRecord        = "variance_record"
	SourceBatchSummary          = "batch_summary"
	SourceGovernanceDecision    = "governance_decision"
	SourceEvidencePack          = "evidence_pack"
	SourceManualReviewDLQ       = "manual_review_dlq"
	SourceFinalityCertificate   = "finality_certificate"
	SourceDispatchAttempt       = "dispatch_attempt"
	SourceOutcomeNormalized     = "outcome_normalized"
	SourceStatementMatch        = "statement_match"
	SourceDLQEvent              = "dlq_event"
	SourceSLATimer              = "sla_timer"
	SourceRCAClustering         = "rca_clustering"
	SourceCorridorHealthTick    = "corridor_health_tick"
	SourceInternal              = "internal" // generic/worker-originated writes
	SourceLegacy                = "legacy"   // backfilled pre-Phase-3 rows
)

// UnbatchedScopeRef is the explicit BATCH-scope bucket for events that carry
// no batch reference. Replaces the former empty-suffix junk keys (bug E1).
const UnbatchedScopeRef = "__unbatched__"

// fragmentTTL mirrors the outbox worker's CleanupStaleRCAFragments max age.
const fragmentTTL = 10 * time.Minute

// derivedCacheRetention is how long a ROLLING_24H derived row outlives its
// window before the Phase 9 cleanup worker may delete it (blueprint §11:
// projection_state dashboard metrics 30–90 days; we take the ceiling).
const derivedCacheRetention = 90 * 24 * time.Hour

// envelopeSourceVersion returns the event schema version for
// projection_source_version — 'legacy' until upstream ships real versions
// (team decision A.2). Reads the Kafka envelope riding the context; safe
// defaults apply for worker-originated writes outside an event context.
func envelopeSourceVersion(ctx context.Context) string {
	return models.EnvelopeMetaFromContext(ctx).EventVersion
}

// batchScopeRefOrUnbatched resolves the BATCH scope_ref for a projection row:
// the batch_contracts_core UUID for a real batch (created on first sight, same
// semantics as the Phase 2 shadow writes), or UnbatchedScopeRef when the event
// carries no batch reference. q must be the SAME executor (tx) the caller
// writes projections with, so the resolve commits or rolls back atomically
// with them.
//
// Note: no core row is ever created for the unbatched bucket — it is not a
// real batch and must not appear in batch_contracts_core (the shadow-diff
// worker iterates that table).
func batchScopeRefOrUnbatched(ctx context.Context, q DBTX, tenantID, externalBatchID string) (string, error) {
	if externalBatchID == "" {
		return UnbatchedScopeRef, nil
	}
	return resolveBatchContractID(ctx, q, tenantID, externalBatchID)
}

// resolveBatchContractID is the package-level twin of
// BatchContractRepo.resolveOrCreate (which delegates here): returns the stable
// internal UUID for (tenantID, externalBatchID), creating the
// batch_contracts_core row on first sight. The no-op DO UPDATE exists purely
// so RETURNING fires on the conflicting row.
func resolveBatchContractID(ctx context.Context, q DBTX, tenantID, externalBatchID string) (string, error) {
	if tenantID == "" || externalBatchID == "" {
		return "", fmt.Errorf("persistence.resolveBatchContractID: tenant_id and external_batch_id are required")
	}

	// Bug fix (found live 2026-07-16): kafka/consumer.go runs one goroutine
	// PER TOPIC in parallel — settlement/variance/attachment-decision/etc all
	// run concurrently, and any of them touching the same batch's shared rows
	// (batch_contracts legacy table, batch_contracts_core, batch_risk_summary,
	// batch_reconciliation_summary, projection_state) at the same moment can
	// hit a genuine Postgres deadlock (SQLSTATE 40P01) if two such
	// transactions acquire those locks in different relative orders. The
	// existing 4-attempt retry recovered ~99% of these live but not 100%.
	//
	// pg_advisory_xact_lock is transaction-scoped (auto-released at COMMIT/
	// ROLLBACK) and reentrant (re-acquiring a lock this same transaction
	// already holds is a no-op, never blocks). Acquiring it here, keyed by
	// (tenant_id, external_batch_id), means any second transaction wanting
	// the SAME batch simply queues until the first fully commits — no
	// interleaving is possible, so no lock-order-reversal cycle can form,
	// regardless of what order each transaction's own statements run in.
	// Different batches are completely unaffected — this never serializes
	// unrelated work, only concurrent writers to the same one batch.
	//
	// P1-09 (corrective-action-report): hashtextextended (64-bit) instead of
	// hashtext (32-bit) — a 32-bit hash has a real birthday-bound collision
	// risk across the full tenant/batch keyspace this lock covers; two
	// UNRELATED batches colliding onto the same 32-bit bucket would
	// needlessly serialize each other (a correctness-neutral but real
	// throughput bug, distinct from the deadlock this lock itself fixes).
	// The `0` second argument is hashtextextended's seed — unused here.
	if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`, tenantID, externalBatchID); err != nil {
		return "", fmt.Errorf("persistence.resolveBatchContractID advisory lock tenant=%s batch=%s: %w", tenantID, externalBatchID, err)
	}

	var id string
	err := q.QueryRow(ctx, `
		INSERT INTO batch_contracts_core (tenant_id, external_batch_id)
		VALUES ($1, $2)
		ON CONFLICT (tenant_id, external_batch_id) DO UPDATE
			SET tenant_id = batch_contracts_core.tenant_id
		RETURNING batch_contract_id
	`, tenantID, externalBatchID).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("persistence.resolveBatchContractID tenant=%s batch=%s: %w", tenantID, externalBatchID, err)
	}
	return id, nil
}

// projectionMeta carries the Phase 3 metadata for one projection row.
type projectionMeta struct {
	Family     string
	ScopeType  string
	ScopeRef   string // for BATCH keys: the external id — callers with a tx upgrade it to the core UUID
	MetricKey  string
	WindowType string
	Retention  string
	ExpiresAt  *time.Time
}

// keyToProjectionMeta derives Phase 3 metadata from a projection key + window,
// mirroring the SQL derivation in db/migrations/009 exactly (asserted by
// projection_meta_test.go). Used by the generic Upsert path and by tests;
// dedicated Atomic* writers inline the same values as SQL literals.
func keyToProjectionMeta(tenantID, key string, windowStart, windowEnd time.Time) projectionMeta {
	m := projectionMeta{
		Family:     "UNKNOWN",
		ScopeType:  ScopeTenant,
		ScopeRef:   tenantID,
		MetricKey:  "",
		WindowType: WindowRolling24h,
		Retention:  RetentionDerivedCache,
	}

	isBatchLifetime := windowStart.Equal(BatchProjectionWindowStart) && windowEnd.Equal(BatchProjectionWindowEnd)
	if isBatchLifetime {
		m.WindowType = WindowBatchLifetime
	}

	trim := func(prefix string) string { return strings.TrimPrefix(key, prefix) }

	switch {
	case strings.HasPrefix(key, "corridor."):
		m.Family = "RELIABILITY"
		m.ScopeType = ScopeCorridor
		parts := strings.SplitN(key, ".", 3)
		m.MetricKey = parts[1]
		if len(parts) == 3 {
			m.ScopeRef = parts[2]
		} else {
			m.ScopeRef = ""
		}
	case strings.HasPrefix(key, "leakage.batch."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "LEAKAGE", ScopeBatch, trim("leakage.batch."), "total"
	case strings.HasPrefix(key, "leakage."):
		m.Family, m.MetricKey = "LEAKAGE", "total"
	case strings.HasPrefix(key, "ambiguity.batch."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "AMBIGUITY", ScopeBatch, trim("ambiguity.batch."), "summary"
	case strings.HasPrefix(key, "ambiguity."):
		m.Family, m.MetricKey = "AMBIGUITY", "summary"
	case strings.HasPrefix(key, "defensibility.batch."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "DEFENSIBILITY", ScopeBatch, trim("defensibility.batch."), "summary"
	case strings.HasPrefix(key, "defensibility."):
		m.Family, m.MetricKey = "DEFENSIBILITY", "summary"
	case key == "rca.summary":
		m.Family, m.MetricKey = "RCA", "summary"
	case strings.HasPrefix(key, "rca.frag."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "RCA", ScopeIntent, trim("rca.frag."), "frag"
		m.WindowType = WindowEphemeral
		m.Retention = RetentionTempFragment
	case strings.HasPrefix(key, "batch.health."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeBatch, trim("batch.health."), "health"
	case key == "tenant.evidence_readiness":
		m.Family, m.MetricKey = "DEFENSIBILITY", "evidence_readiness"
	case key == "tenant.sla_breach_rate":
		m.Family, m.MetricKey = "SLA", "sla_breach_rate"
	case strings.HasPrefix(key, "dlq.count."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "RELIABILITY", ScopeSource, trim("dlq.count."), "dlq_count"
	case key == "pattern.p2_p6":
		m.Family, m.MetricKey = "PATTERN", "p2_p6"
	case key == "pattern.tenant_summary":
		m.Family, m.MetricKey = "PATTERN", "tenant_summary"
	case strings.HasPrefix(key, "pattern.batch_density."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeBatch, trim("pattern.batch_density."), "batch_density"
	case strings.HasPrefix(key, "pattern.ambiguity.source."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeSource, trim("pattern.ambiguity.source."), "ambiguity_by_source"
	case strings.HasPrefix(key, "pattern.variance.source."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeSource, trim("pattern.variance.source."), "variance_by_source"
	case strings.HasPrefix(key, "pattern.source."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeSource, trim("pattern.source."), "source_quality"
	case strings.HasPrefix(key, "pattern.provider."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopePSP, trim("pattern.provider."), "provider_quality"
	case strings.HasPrefix(key, "pattern.bank."):
		m.Family, m.ScopeType, m.ScopeRef, m.MetricKey = "PATTERN", ScopeBank, trim("pattern.bank."), "bank_quality"
	default:
		// Honest fallback, same as the backfill: second key segment.
		parts := strings.SplitN(key, ".", 3)
		if len(parts) >= 2 {
			m.MetricKey = parts[1]
		} else {
			m.MetricKey = key
		}
	}

	switch {
	case m.Retention == RetentionTempFragment:
		t := time.Now().UTC().Add(fragmentTTL)
		m.ExpiresAt = &t
	case m.WindowType == WindowRolling24h:
		t := windowEnd.Add(derivedCacheRetention)
		m.ExpiresAt = &t
	default: // BATCH_LIFETIME — batch closure decides (Phase 9+)
		m.ExpiresAt = nil
	}
	return m
}
