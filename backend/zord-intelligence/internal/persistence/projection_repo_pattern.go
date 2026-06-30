package persistence

// projection_repo_pattern.go
//
// Pattern Intelligence atomic projection methods.
//
// This file contains all new atomic upsert and read methods required by the
// Pattern & Recommendation Intelligence layer. It is intentionally separate
// from projection_repo.go to keep the existing grade-level methods untouched.
//
// ARCHITECTURE RULE:
// Every write method in this file follows the same INSERT...ON CONFLICT DO UPDATE
// pattern used throughout projection_repo.go. This guarantees race-condition-free
// counter increments when the same tenant's events arrive in parallel partitions.
//
// KEY NAMING CONVENTION:
//   pattern.source.{source_system}            → SourceQualityValue
//   pattern.provider.{provider_id}            → ProviderQualityValue
//   pattern.bank.{bank_id}                    → BankQualityValue
//   pattern.ambiguity.source.{source_system}  → AmbiguityBySourceValue
//   pattern.variance.source.{source_system}   → VarianceBySourceValue
//
// ALL MONEY IS IN MINOR UNITS. NEVER float64 for money.

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/models"
)

// maxDelaySamples is the bounded array size for settlement delay samples.
// Storing more than this provides diminishing accuracy improvement for p50/p95
// while growing memory and serialization cost linearly. 500 is sufficient for
// statistical accuracy at the 95th percentile (< 0.5% error vs unlimited).
const maxDelaySamples = 500

// ── SOURCE QUALITY ──────────────────────────────────────────────────────────

// AtomicUpsertSourceQuality atomically updates SourceQualityValue for a source system.
// Called from HandleIntentCreated and HandleDLQItem.
//
// delta carries the increments for this single event. The method reads the current
// row, applies the delta, recomputes derived rates, and writes back atomically.
// Uses a Go-level read-modify-write (not pure SQL) because the ReasonBreakdown map
// requires JSON merging that is impractical in a single jsonb_set chain.
//
// CONCURRENCY NOTE: This uses a SELECT FOR UPDATE inside a transaction to prevent
// lost updates when two events for the same source arrive concurrently.
func (r *ProjectionRepo) AtomicUpsertSourceQuality(
	ctx context.Context,
	tenantID, sourceSystem string,
	delta SourceQualityDelta,
	windowStart, windowEnd time.Time,
) error {
	if sourceSystem == "" {
		return nil // silently skip unknown source — no key to group by
	}
	key := fmt.Sprintf("pattern.source.%s", sanitizeProjectionKey(sourceSystem))

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertSourceQuality begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock the row for this source system (or create it if first event).
	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd,
		`{"source_system":"`+sanitizeProjectionKey(sourceSystem)+`","total_intent_count":0,"total_intent_amount_minor":"0","missing_client_ref_count":0,"low_matchability_count":0,"low_proof_readiness_count":0,"low_quality_score_count":0,"duplicate_risk_count":0,"duplicate_risk_amount_minor":"0","manual_review_count":0,"manual_review_amount_minor":"0","reason_breakdown":{},"missing_client_ref_rate":0,"low_matchability_rate":0,"low_proof_readiness_rate":0,"duplicate_risk_rate":0,"manual_review_rate":0}`,
	).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertSourceQuality upsert key=%s: %w", key, err)
	}

	var v models.SourceQualityValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertSourceQuality unmarshal key=%s: %w", key, err)
	}

	// Apply delta
	v.SourceSystem = sourceSystem
	v.TotalIntentCount += delta.IntentCount
	v.TotalIntentAmountMinor = v.TotalIntentAmountMinor.Add(delta.IntentAmountMinor)
	v.MissingClientRefCount += delta.MissingClientRefCount
	v.LowMatchabilityCount += delta.LowMatchabilityCount
	v.LowProofReadinessCount += delta.LowProofReadinessCount
	v.LowQualityScoreCount += delta.LowQualityScoreCount
	v.DuplicateRiskCount += delta.DuplicateRiskCount
	v.DuplicateRiskAmountMinor = v.DuplicateRiskAmountMinor.Add(delta.DuplicateRiskAmountMinor)
	v.ManualReviewCount += delta.ManualReviewCount
	v.ManualReviewAmountMinor = v.ManualReviewAmountMinor.Add(delta.ManualReviewAmountMinor)

	if delta.ManualReviewReasonCode != "" {
		if v.ReasonBreakdown == nil {
			v.ReasonBreakdown = make(map[string]int)
		}
		v.ReasonBreakdown[delta.ManualReviewReasonCode]++
	}

	// Track approximate unique batch count per source.
	// When a new batch_ref arrives that differs from the last seen one, increment.
	if delta.BatchRef != "" && delta.BatchRef != v.LastBatchRef {
		v.BatchCount++
		v.LastBatchRef = delta.BatchRef
	}

	// Recompute rates
	if v.TotalIntentCount > 0 {
		total := float64(v.TotalIntentCount)
		v.MissingClientRefRate = roundRate(float64(v.MissingClientRefCount) / total)
		v.LowMatchabilityRate = roundRate(float64(v.LowMatchabilityCount) / total)
		v.LowProofReadinessRate = roundRate(float64(v.LowProofReadinessCount) / total)
		v.DuplicateRiskRate = roundRate(float64(v.DuplicateRiskCount) / total)
		v.ManualReviewRate = roundRate(float64(v.ManualReviewCount) / total)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertSourceQuality marshal key=%s: %w", key, err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertSourceQuality update key=%s: %w", key, err)
	}

	return tx.Commit(ctx)
}

// SourceQualityDelta carries the per-event increment values for AtomicUpsertSourceQuality.
type SourceQualityDelta struct {
	IntentCount              int
	IntentAmountMinor        decimal.Decimal
	MissingClientRefCount    int
	LowMatchabilityCount     int
	LowProofReadinessCount   int
	LowQualityScoreCount     int
	DuplicateRiskCount       int
	DuplicateRiskAmountMinor decimal.Decimal
	ManualReviewCount        int
	ManualReviewAmountMinor  decimal.Decimal
	ManualReviewReasonCode   string // only set by HandleDLQItem
	BatchRef                 string // client_batch_ref — used to approximate unique batch count
}

// ── PROVIDER QUALITY ────────────────────────────────────────────────────────

// AtomicUpsertProviderQuality atomically updates ProviderQualityValue for a PSP/provider.
// Called from HandleSettlementCreated and HandleAttachmentDecision.
func (r *ProjectionRepo) AtomicUpsertProviderQuality(
	ctx context.Context,
	tenantID, providerID string,
	delta ProviderQualityDelta,
	windowStart, windowEnd time.Time,
) error {
	if providerID == "" {
		return nil
	}
	key := fmt.Sprintf("pattern.provider.%s", sanitizeProjectionKey(providerID))

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertProviderQuality begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd,
		`{"provider_id":"`+sanitizeProjectionKey(providerID)+`","total_settlement_count":0,"total_settlement_amount_minor":"0","parse_confidence_sum":0,"parse_confidence_count":0,"weak_parse_count":0,"mapping_confidence_sum":0,"mapping_confidence_count":0,"weak_mapping_count":0,"carrier_richness_sum":0,"carrier_richness_count":0,"attachment_readiness_sum":0,"attachment_readiness_count":0,"orphan_count":0,"missing_provider_ref_count":0,"missing_client_ref_count":0,"total_decisions":0,"ambiguous_decisions":0,"unresolved_decisions":0,"successful_decision_count":0,"decision_success_rate":0,"settlement_delay_samples":[]}`,
	).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertProviderQuality upsert key=%s: %w", key, err)
	}

	var v models.ProviderQualityValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertProviderQuality unmarshal key=%s: %w", key, err)
	}

	v.ProviderID = providerID
	v.TotalSettlementCount += delta.SettlementCount
	v.TotalSettlementAmountMinor = v.TotalSettlementAmountMinor.Add(delta.SettlementAmountMinor)

	if delta.ParseConfidence > 0 {
		v.ParseConfidenceSum += delta.ParseConfidence
		v.ParseConfidenceCount++
	}
	if delta.ParseConfidence > 0 && delta.ParseConfidence < 0.70 {
		v.WeakParseCount++
	}
	if delta.MappingConfidence > 0 {
		v.MappingConfidenceSum += delta.MappingConfidence
		v.MappingConfidenceCount++
	}
	if delta.MappingConfidence > 0 && delta.MappingConfidence < 0.70 {
		v.WeakMappingCount++
	}
	if delta.CarrierRichness > 0 {
		v.CarrierRichnessSum += delta.CarrierRichness
		v.CarrierRichnessCount++
	}
	if delta.AttachmentReadiness > 0 {
		v.AttachmentReadinessSum += delta.AttachmentReadiness
		v.AttachmentReadinessCount++
	}

	v.OrphanCount += delta.OrphanCount
	v.MissingProviderRefCount += delta.MissingProviderRefCount
	v.MissingClientRefCount += delta.MissingClientRefCount
	v.TotalDecisions += delta.DecisionCount
	v.AmbiguousDecisions += delta.AmbiguousDecisionCount
	v.UnresolvedDecisions += delta.UnresolvedDecisionCount
	v.SuccessfulDecisionCount += delta.SuccessfulDecisionCount

	if delta.SettlementDelayDays > 0 {
		v.SettlementDelaySamples = appendBoundedSample(v.SettlementDelaySamples, delta.SettlementDelayDays)
	}

	// Recompute derived averages and rates
	if v.ParseConfidenceCount > 0 {
		v.AvgParseConfidence = roundRate(v.ParseConfidenceSum / float64(v.ParseConfidenceCount))
	}
	if v.MappingConfidenceCount > 0 {
		v.AvgMappingConfidence = roundRate(v.MappingConfidenceSum / float64(v.MappingConfidenceCount))
	}
	if v.CarrierRichnessCount > 0 {
		v.AvgCarrierRichness = roundRate(v.CarrierRichnessSum / float64(v.CarrierRichnessCount))
	}
	if v.AttachmentReadinessCount > 0 {
		v.AvgAttachmentReadiness = roundRate(v.AttachmentReadinessSum / float64(v.AttachmentReadinessCount))
	}
	if v.TotalSettlementCount > 0 {
		v.OrphanRate = roundRate(float64(v.OrphanCount) / float64(v.TotalSettlementCount))
	}
	if v.TotalDecisions > 0 {
		v.AmbiguityRate = roundRate(float64(v.AmbiguousDecisions) / float64(v.TotalDecisions))
		v.DecisionSuccessRate = roundRate(float64(v.SuccessfulDecisionCount) / float64(v.TotalDecisions))
	}
	if len(v.SettlementDelaySamples) > 0 {
		v.SettlementDelayP95Days = computePercentile(v.SettlementDelaySamples, 95)
		v.SettlementDelayP50Days = computePercentile(v.SettlementDelaySamples, 50)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertProviderQuality marshal key=%s: %w", key, err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertProviderQuality update key=%s: %w", key, err)
	}
	return tx.Commit(ctx)
}

// ProviderQualityDelta carries per-event increments for AtomicUpsertProviderQuality.
type ProviderQualityDelta struct {
	SettlementCount          int
	SettlementAmountMinor    decimal.Decimal
	ParseConfidence          float64
	MappingConfidence        float64
	CarrierRichness          float64
	AttachmentReadiness      float64
	OrphanCount              int
	MissingProviderRefCount  int
	MissingClientRefCount    int
	DecisionCount            int
	AmbiguousDecisionCount   int
	UnresolvedDecisionCount  int
	SuccessfulDecisionCount  int
	SettlementDelayDays      int
}

// ── BANK QUALITY ─────────────────────────────────────────────────────────────

// AtomicUpsertBankQuality atomically updates BankQualityValue for a bank.
// Called from HandleSettlementCreated.
func (r *ProjectionRepo) AtomicUpsertBankQuality(
	ctx context.Context,
	tenantID, bankID string,
	delta BankQualityDelta,
	windowStart, windowEnd time.Time,
) error {
	if bankID == "" {
		return nil
	}
	key := fmt.Sprintf("pattern.bank.%s", sanitizeProjectionKey(bankID))

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertBankQuality begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd,
		`{"bank_id":"`+sanitizeProjectionKey(bankID)+`","total_settlement_count":0,"missing_bank_ref_count":0,"missing_utr_count":0,"settlement_delay_samples":[]}`,
	).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertBankQuality upsert key=%s: %w", key, err)
	}

	var v models.BankQualityValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertBankQuality unmarshal key=%s: %w", key, err)
	}

	v.BankID = bankID
	v.TotalSettlementCount += delta.SettlementCount
	v.MissingBankRefCount += delta.MissingBankRefCount
	v.MissingUTRCount += delta.MissingUTRCount

	if delta.SettlementDelayDays > 0 {
		v.SettlementDelaySamples = appendBoundedSample(v.SettlementDelaySamples, delta.SettlementDelayDays)
	}

	if v.TotalSettlementCount > 0 {
		v.MissingBankRefRate = roundRate(float64(v.MissingBankRefCount) / float64(v.TotalSettlementCount))
	}
	if len(v.SettlementDelaySamples) > 0 {
		v.SettlementDelayP95Days = computePercentile(v.SettlementDelaySamples, 95)
		v.SettlementDelayP50Days = computePercentile(v.SettlementDelaySamples, 50)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertBankQuality marshal key=%s: %w", key, err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertBankQuality update key=%s: %w", key, err)
	}
	return tx.Commit(ctx)
}

// BankQualityDelta carries per-event increments for AtomicUpsertBankQuality.
type BankQualityDelta struct {
	SettlementCount     int
	MissingBankRefCount int
	MissingUTRCount     int
	SettlementDelayDays int
}

// ── AMBIGUITY BY SOURCE ──────────────────────────────────────────────────────

// AtomicUpsertAmbiguityBySource atomically updates AmbiguityBySourceValue.
// Called from HandleAttachmentDecision when SourceSystem is populated.
func (r *ProjectionRepo) AtomicUpsertAmbiguityBySource(
	ctx context.Context,
	tenantID, sourceSystem string,
	delta AmbiguityBySourceDelta,
	windowStart, windowEnd time.Time,
) error {
	if sourceSystem == "" {
		return nil
	}
	key := fmt.Sprintf("pattern.ambiguity.source.%s", sanitizeProjectionKey(sourceSystem))

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertAmbiguityBySource begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd,
		`{"source_system":"`+sanitizeProjectionKey(sourceSystem)+`","total_decisions":0,"ambiguous_count":0,"unresolved_count":0,"low_confidence_count":0,"collision_count":0,"candidate_set_size_sum":0,"value_at_risk_minor":"0"}`,
	).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertAmbiguityBySource upsert key=%s: %w", key, err)
	}

	var v models.AmbiguityBySourceValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertAmbiguityBySource unmarshal key=%s: %w", key, err)
	}

	v.SourceSystem = sourceSystem
	v.TotalDecisions += delta.DecisionCount
	v.AmbiguousCount += delta.AmbiguousCount
	v.UnresolvedCount += delta.UnresolvedCount
	v.LowConfidenceCount += delta.LowConfidenceCount
	v.CollisionCount += delta.CollisionCount
	v.CandidateSetSizeSum += delta.CandidateSetSizeSum
	v.ValueAtRiskMinor = v.ValueAtRiskMinor.Add(delta.ValueAtRiskMinor)

	if v.TotalDecisions > 0 {
		total := float64(v.TotalDecisions)
		v.AmbiguityRate = roundRate(float64(v.AmbiguousCount) / total)
		v.CollisionRate = roundRate(float64(v.CollisionCount) / total)
		v.LowConfidenceRate = roundRate(float64(v.LowConfidenceCount) / total)
		v.AvgCandidateSetSize = roundRate(float64(v.CandidateSetSizeSum) / total)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertAmbiguityBySource marshal key=%s: %w", key, err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertAmbiguityBySource update key=%s: %w", key, err)
	}
	return tx.Commit(ctx)
}

// AmbiguityBySourceDelta carries per-event increments for AtomicUpsertAmbiguityBySource.
type AmbiguityBySourceDelta struct {
	DecisionCount       int
	AmbiguousCount      int
	UnresolvedCount     int
	LowConfidenceCount  int
	CollisionCount      int
	CandidateSetSizeSum int
	ValueAtRiskMinor    decimal.Decimal
}

// ── VARIANCE BY SOURCE ───────────────────────────────────────────────────────

// AtomicUpsertVarianceBySource atomically updates VarianceBySourceValue.
// Called from HandleVarianceRecord when SourceSystem is populated.
func (r *ProjectionRepo) AtomicUpsertVarianceBySource(
	ctx context.Context,
	tenantID, sourceSystem string,
	delta VarianceBySourceDelta,
	windowStart, windowEnd time.Time,
) error {
	if sourceSystem == "" {
		return nil
	}
	key := fmt.Sprintf("pattern.variance.source.%s", sanitizeProjectionKey(sourceSystem))

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertVarianceBySource begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd,
		`{"source_system":"`+sanitizeProjectionKey(sourceSystem)+`","total_variance_count":0,"total_variance_amount_minor":"0","whitelisted_variance_count":0,"whitelisted_variance_minor":"0","unexplained_variance_count":0,"unexplained_variance_minor":"0","missing_provider_ref_count":0,"missing_bank_ref_count":0,"cross_period_count":0,"fee_variance_total_minor":"0","breakdown_by_type":{}}`,
	).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertVarianceBySource upsert key=%s: %w", key, err)
	}

	var v models.VarianceBySourceValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertVarianceBySource unmarshal key=%s: %w", key, err)
	}

	v.SourceSystem = sourceSystem
	v.TotalVarianceCount += delta.VarianceCount
	v.TotalVarianceAmountMinor = v.TotalVarianceAmountMinor.Add(delta.VarianceAmountMinor)

	if delta.IsWhitelisted {
		v.WhitelistedVarianceCount++
		v.WhitelistedVarianceMinor = v.WhitelistedVarianceMinor.Add(delta.VarianceAmountMinor)
	} else {
		v.UnexplainedVarianceCount++
		v.UnexplainedVarianceMinor = v.UnexplainedVarianceMinor.Add(delta.VarianceAmountMinor)
	}

	if delta.ProviderRefMissing {
		v.MissingProviderRefCount++
	}
	if delta.BankRefMissing {
		v.MissingBankRefCount++
	}
	if delta.CrossPeriod {
		v.CrossPeriodCount++
	}
	v.FeeVarianceTotalMinor = v.FeeVarianceTotalMinor.Add(delta.FeeVarianceMinor)

	if delta.VarianceType != "" && delta.VarianceAmountMinor.IsPositive() {
		if v.BreakdownByType == nil {
			v.BreakdownByType = make(map[string]decimal.Decimal)
		}
		v.BreakdownByType[delta.VarianceType] = v.BreakdownByType[delta.VarianceType].Add(delta.VarianceAmountMinor)
	}

	// Recompute rates
	if v.TotalVarianceCount > 0 {
		total := float64(v.TotalVarianceCount)
		v.MissingProviderRefRate = roundRate(float64(v.MissingProviderRefCount) / total)
		v.MissingBankRefRate = roundRate(float64(v.MissingBankRefCount) / total)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertVarianceBySource marshal key=%s: %w", key, err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicUpsertVarianceBySource update key=%s: %w", key, err)
	}
	return tx.Commit(ctx)
}

// VarianceBySourceDelta carries per-event increments for AtomicUpsertVarianceBySource.
type VarianceBySourceDelta struct {
	VarianceCount       int
	VarianceAmountMinor decimal.Decimal
	IsWhitelisted       bool
	ProviderRefMissing  bool
	BankRefMissing      bool
	CrossPeriod         bool
	FeeVarianceMinor    decimal.Decimal
	VarianceType        string
}

// ── LEAKAGE EXTENSIONS ───────────────────────────────────────────────────────

// AtomicRecordWhitelistedDeduction records a whitelisted (pre-agreed) deduction
// amount in the leakage projection for audit purposes.
// Previously whitelisted variances were skipped entirely; we now track their amount
// separately so the dashboard can show "explained deductions" vs "real leakage".
func (r *ProjectionRepo) AtomicRecordWhitelistedDeduction(
	ctx context.Context,
	tenantID string,
	amountMinor decimal.Decimal,
	windowStart, windowEnd time.Time,
) error {
	if !amountMinor.IsPositive() {
		return nil
	}
	key := "leakage.total"
	amountStr := amountMinor.String()

	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('whitelisted_deduction_amount_minor', $5::numeric),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{whitelisted_deduction_amount_minor}',
				to_jsonb(
					COALESCE((projection_state.value_json->>'whitelisted_deduction_amount_minor')::numeric, 0)
					+ $5::numeric
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, amountStr); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicRecordWhitelistedDeduction: %w", err)
	}
	return nil
}

// AtomicRecordOverSettlement records an over-settlement event and its amount.
// Previously OVER_SETTLEMENT was skipped; it is now tracked for pattern detection.
func (r *ProjectionRepo) AtomicRecordOverSettlement(
	ctx context.Context,
	tenantID string,
	amountMinor decimal.Decimal,
	windowStart, windowEnd time.Time,
) error {
	key := "leakage.total"
	amountStr := amountMinor.String()

	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('over_settlement_amount_minor', $5::numeric, 'over_settlement_count', 1),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{over_settlement_amount_minor}',
					to_jsonb(
						COALESCE((projection_state.value_json->>'over_settlement_amount_minor')::numeric, 0)
						+ $5::numeric
					)
				),
				'{over_settlement_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'over_settlement_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, amountStr); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicRecordOverSettlement: %w", err)
	}
	return nil
}

// ── PATTERN TENANT SUMMARY EXTENSIONS ───────────────────────────────────────

// AtomicIncrementPatternP2WithAmount extends the existing P2 counter to also
// accumulate the duplicate risk exposure amount (sum of intent amounts where
// duplicate_risk_flag=true). Previously only the count was tracked.
func (r *ProjectionRepo) AtomicIncrementPatternP2WithAmount(
	ctx context.Context,
	tenantID string,
	isDuplicateRisk bool,
	amountMinor decimal.Decimal,
	isMissingClientRef bool,
	windowStart, windowEnd time.Time,
) error {
	key := "pattern.p2_p6"

	missingRefIncr := 0
	if isMissingClientRef {
		missingRefIncr = 1
	}

	var dupAmountStr string
	if isDuplicateRisk && amountMinor.IsPositive() {
		dupAmountStr = amountMinor.String()
	} else {
		dupAmountStr = "0"
	}

	dupRiskIncr := 0
	if isDuplicateRisk {
		dupRiskIncr = 1
	}

	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intent_count', 1,
				'duplicate_risk_count', $5::int,
				'duplicate_risk_rate', $5::float8,
				'duplicate_risk_amount_minor', $6::text,
				'missing_client_ref_count', $7::int,
				'settlement_delay_samples', '[]'::jsonb,
				'settlement_delay_p95_days', 0.0,
				'settlement_delay_p50_days', 0.0,
				'cross_period_count', 0
			),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								projection_state.value_json,
								'{total_intent_count}',
								to_jsonb(COALESCE((projection_state.value_json->>'total_intent_count')::int, 0) + 1)
							),
							'{duplicate_risk_count}',
							to_jsonb(COALESCE((projection_state.value_json->>'duplicate_risk_count')::int, 0) + $5::int)
						),
						'{duplicate_risk_amount_minor}',
						to_jsonb(
							(COALESCE((projection_state.value_json->>'duplicate_risk_amount_minor')::numeric, 0)
							+ $6::numeric)::text
						)
					),
					'{missing_client_ref_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'missing_client_ref_count')::int, 0) + $7::int)
				),
				'{duplicate_risk_rate}',
				to_jsonb(
					COALESCE(
						(COALESCE((projection_state.value_json->>'duplicate_risk_count')::float8, 0) + $5::float8)
						/ NULLIF((COALESCE((projection_state.value_json->>'total_intent_count')::float8, 0) + 1), 0),
						0
					)
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd,
		dupRiskIncr, dupAmountStr, missingRefIncr); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicIncrementPatternP2WithAmount: %w", err)
	}
	return nil
}

// AtomicAppendPatternP6WithP50 extends the existing P6 sample array to also
// compute the P50 (median) in addition to P95. Updates settlement_delay_p50_days.
func (r *ProjectionRepo) AtomicAppendPatternP6WithP50(
	ctx context.Context,
	tenantID string,
	delayDays int,
	windowStart, windowEnd time.Time,
) error {
	if delayDays <= 0 {
		return nil
	}
	key := "pattern.p2_p6"

	// Read current samples, append new value, recompute both percentiles.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicAppendPatternP6WithP50 begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var rawJSON []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('settlement_delay_samples', jsonb_build_array($5::int), 'settlement_delay_p95_days', $5::float8, 'settlement_delay_p50_days', $5::float8),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET computed_at = now()
		RETURNING value_json
	`, tenantID, key, windowStart, windowEnd, delayDays).Scan(&rawJSON)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicAppendPatternP6WithP50 upsert: %w", err)
	}

	var v models.PatternTenantSummaryValue
	if err := json.Unmarshal(rawJSON, &v); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicAppendPatternP6WithP50 unmarshal: %w", err)
	}

	v.SettlementDelaySamples = appendBoundedSample(v.SettlementDelaySamples, delayDays)
	if len(v.SettlementDelaySamples) > 0 {
		v.SettlementDelayP95Days = computePercentile(v.SettlementDelaySamples, 95)
		v.SettlementDelayP50Days = computePercentile(v.SettlementDelaySamples, 50)
	}
	v.UpdatedAt = time.Now().UTC()

	updated, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicAppendPatternP6WithP50 marshal: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE projection_state SET value_json = $1::jsonb, computed_at = now()
		WHERE tenant_id = $2 AND projection_key = $3 AND window_start = $4 AND projection_version = 1
	`, string(updated), tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicAppendPatternP6WithP50 update: %w", err)
	}
	return tx.Commit(ctx)
}

// AtomicIncrementCrossPeriod increments the cross_period_count in the
// PatternTenantSummaryValue projection.
func (r *ProjectionRepo) AtomicIncrementCrossPeriod(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	key := "pattern.p2_p6"
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, '{"cross_period_count":1}'::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{cross_period_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'cross_period_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicIncrementCrossPeriod: %w", err)
	}
	return nil
}

// ── DEFENSIBILITY EXTENSION: MISSING LEAF TRACKING ──────────────────────────

// AtomicRecordEvidenceLeafCoverage updates missing_leaf tracking in the
// defensibility.summary projection. Called from HandleEvidencePackReady.
func (r *ProjectionRepo) AtomicRecordEvidenceLeafCoverage(
	ctx context.Context,
	tenantID string,
	leafCount, requiredLeafCount int,
	windowStart, windowEnd time.Time,
) error {
	if requiredLeafCount <= 0 {
		return nil
	}
	missing := requiredLeafCount - leafCount
	if missing < 0 {
		missing = 0
	}
	key := "defensibility.summary"

	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end, value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_leaf_count',          $5::int,
				'total_required_leaf_count', $6::int,
				'missing_leaf_count',        $7::int,
				'missing_leaf_rate',         CASE WHEN $6::int > 0 THEN $7::float8 / $6::float8 ELSE 0.0 END
			),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							projection_state.value_json,
							'{total_leaf_count}',
							to_jsonb(COALESCE((projection_state.value_json->>'total_leaf_count')::int, 0) + $5::int)
						),
						'{total_required_leaf_count}',
						to_jsonb(COALESCE((projection_state.value_json->>'total_required_leaf_count')::int, 0) + $6::int)
					),
					'{missing_leaf_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'missing_leaf_count')::int, 0) + $7::int)
				),
				'{missing_leaf_rate}',
				to_jsonb(
					CASE WHEN (COALESCE((projection_state.value_json->>'total_required_leaf_count')::int, 0) + $6::int) > 0
					THEN (COALESCE((projection_state.value_json->>'missing_leaf_count')::int, 0) + $7::int)::float8
					     / (COALESCE((projection_state.value_json->>'total_required_leaf_count')::int, 0) + $6::int)::float8
					ELSE 0.0 END
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd,
		leafCount, requiredLeafCount, missing); err != nil {
		return fmt.Errorf("projection_repo_pattern.AtomicRecordEvidenceLeafCoverage: %w", err)
	}
	return nil
}

// ── DISPUTE READINESS COMPONENT ACCUMULATORS ─────────────────────────────────

// AtomicRecordDefensibilityIntentQuality accumulates IntentQualityScore into
// the defensibility.summary projection for use in the new dispute_ready_pct formula.
// Called from HandleIntentCreated when IntentQualityScore > 0.
func (r *ProjectionRepo) AtomicRecordDefensibilityIntentQuality(
	ctx context.Context,
	tenantID string,
	intentQualityScore float64,
	windowStart, windowEnd time.Time,
) error {
	key := "defensibility.summary"
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'intent_quality_sum',      $5::float8,
				'intent_quality_count',    1,
				'avg_intent_quality_score', $5::float8
			),
			now(), 1, 'DEFENSIBILITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{intent_quality_sum}',
					to_jsonb(COALESCE((projection_state.value_json->>'intent_quality_sum')::float8, 0) + $5::float8)
				),
				'{intent_quality_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'intent_quality_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, intentQualityScore); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordDefensibilityIntentQuality tenant=%s: %w", tenantID, err)
	}
	return r.recomputeDefensibilityEvidenceRates(ctx, tenantID, key, windowStart)
}

// AtomicRecordDefensibilityMappingConfidence accumulates MappingConfidence into
// the defensibility.summary projection for use in the new dispute_ready_pct formula.
// Called from HandleSettlementCreated when MappingConfidence > 0.
func (r *ProjectionRepo) AtomicRecordDefensibilityMappingConfidence(
	ctx context.Context,
	tenantID string,
	mappingConfidence float64,
	windowStart, windowEnd time.Time,
) error {
	key := "defensibility.summary"
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'mapping_confidence_sum',   $5::float8,
				'mapping_confidence_count', 1,
				'avg_mapping_confidence',   $5::float8
			),
			now(), 1, 'DEFENSIBILITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{mapping_confidence_sum}',
					to_jsonb(COALESCE((projection_state.value_json->>'mapping_confidence_sum')::float8, 0) + $5::float8)
				),
				'{mapping_confidence_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'mapping_confidence_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, mappingConfidence); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordDefensibilityMappingConfidence tenant=%s: %w", tenantID, err)
	}
	return r.recomputeDefensibilityEvidenceRates(ctx, tenantID, key, windowStart)
}

// AtomicUpdateDefensibilityDisputeReady writes the service-layer-computed
// dispute_ready_pct back to the projection so the policy engine can read it.
// Called from DefensibilityIntelligenceService.ComputeAndSave after every snapshot.
func (r *ProjectionRepo) AtomicUpdateDefensibilityDisputeReady(
	ctx context.Context,
	tenantID string,
	disputeReadyPct float64,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state SET
			value_json  = jsonb_set(value_json, '{dispute_ready_pct}', to_jsonb($3::float8)),
			computed_at = now()
		WHERE tenant_id        = $1
		  AND projection_key   = 'defensibility.summary'
		  AND window_start     = $2
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, windowStart, disputeReadyPct); err != nil {
		return fmt.Errorf("projection_repo.AtomicUpdateDefensibilityDisputeReady tenant=%s: %w", tenantID, err)
	}
	return nil
}

// GetPatternTenantSummary reads the pattern.tenant_summary projection.
// Used by DefensibilityIntelligenceService to obtain ProofReadinessScore
// for the dispute_ready_pct formula.
func (r *ProjectionRepo) GetPatternTenantSummary(
	ctx context.Context,
	tenantID string,
) (*models.PatternTenantSummaryValue, error) {
	var v models.PatternTenantSummaryValue
	if err := r.GetValueAs(ctx, tenantID, "pattern.tenant_summary", &v); err != nil {
		return nil, fmt.Errorf("projection_repo.GetPatternTenantSummary: %w", err)
	}
	return &v, nil
}

// ── READ METHODS ─────────────────────────────────────────────────────────────

// GetProjectionsByKeyPrefix returns all projection_state rows whose projection_key
// starts with the given prefix for the specified tenant and window.
//
// Used by Pattern Intelligence service to read all source/provider/bank projections
// at snapshot computation time (e.g. prefix="pattern.source." returns all sources).
//
// Results are ordered by computed_at DESC so the most recently updated projection
// for each key is returned first.
func (r *ProjectionRepo) GetProjectionsByKeyPrefix(
	ctx context.Context,
	tenantID, keyPrefix string,
	windowStart time.Time,
) ([]*models.ProjectionState, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, tenant_id, projection_key, window_start, window_end,
		       value_json, computed_at, projection_version
		FROM projection_state
		WHERE tenant_id        = $1
		  AND projection_key   LIKE $2
		  AND window_start     = $3
		  AND projection_version = 1
		ORDER BY computed_at DESC
	`, tenantID, keyPrefix+"%", windowStart)
	if err != nil {
		return nil, fmt.Errorf("projection_repo_pattern.GetProjectionsByKeyPrefix prefix=%s: %w", keyPrefix, err)
	}
	defer rows.Close()

	var results []*models.ProjectionState
	for rows.Next() {
		var p models.ProjectionState
		var valueJSON string
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.ProjectionKey, &p.WindowStart, &p.WindowEnd,
			&valueJSON, &p.ComputedAt, &p.ProjectionVersion,
		); err != nil {
			return nil, fmt.Errorf("projection_repo_pattern.GetProjectionsByKeyPrefix scan: %w", err)
		}
		p.ValueJSON = valueJSON
		results = append(results, &p)
	}
	return results, rows.Err()
}

// GetAllSourceQualityProjections returns all SourceQualityValue projections
// for a tenant in the given window, sorted by manual_review_rate descending.
func (r *ProjectionRepo) GetAllSourceQualityProjections(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) ([]*models.SourceQualityValue, error) {
	rows, err := r.GetProjectionsByKeyPrefix(ctx, tenantID, "pattern.source.", windowStart)
	if err != nil {
		return nil, err
	}
	var result []*models.SourceQualityValue
	for _, row := range rows {
		var v models.SourceQualityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			continue
		}
		result = append(result, &v)
	}
	// Sort by manual_review_rate descending — worst source first
	sort.Slice(result, func(i, j int) bool {
		return result[i].ManualReviewRate > result[j].ManualReviewRate
	})
	return result, nil
}

// GetAllProviderQualityProjections returns all ProviderQualityValue projections
// for a tenant in the given window, sorted by ambiguity_rate descending.
func (r *ProjectionRepo) GetAllProviderQualityProjections(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) ([]*models.ProviderQualityValue, error) {
	rows, err := r.GetProjectionsByKeyPrefix(ctx, tenantID, "pattern.provider.", windowStart)
	if err != nil {
		return nil, err
	}
	var result []*models.ProviderQualityValue
	for _, row := range rows {
		var v models.ProviderQualityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			continue
		}
		result = append(result, &v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].AmbiguityRate > result[j].AmbiguityRate
	})
	return result, nil
}

// GetAllBankQualityProjections returns all BankQualityValue projections.
func (r *ProjectionRepo) GetAllBankQualityProjections(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) ([]*models.BankQualityValue, error) {
	rows, err := r.GetProjectionsByKeyPrefix(ctx, tenantID, "pattern.bank.", windowStart)
	if err != nil {
		return nil, err
	}
	var result []*models.BankQualityValue
	for _, row := range rows {
		var v models.BankQualityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			continue
		}
		result = append(result, &v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].MissingBankRefRate > result[j].MissingBankRefRate
	})
	return result, nil
}

// GetAllAmbiguityBySourceProjections returns all AmbiguityBySourceValue projections.
func (r *ProjectionRepo) GetAllAmbiguityBySourceProjections(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) ([]*models.AmbiguityBySourceValue, error) {
	rows, err := r.GetProjectionsByKeyPrefix(ctx, tenantID, "pattern.ambiguity.source.", windowStart)
	if err != nil {
		return nil, err
	}
	var result []*models.AmbiguityBySourceValue
	for _, row := range rows {
		var v models.AmbiguityBySourceValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			continue
		}
		result = append(result, &v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].AmbiguityRate > result[j].AmbiguityRate
	})
	return result, nil
}

// GetAllVarianceBySourceProjections returns all VarianceBySourceValue projections.
func (r *ProjectionRepo) GetAllVarianceBySourceProjections(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) ([]*models.VarianceBySourceValue, error) {
	rows, err := r.GetProjectionsByKeyPrefix(ctx, tenantID, "pattern.variance.source.", windowStart)
	if err != nil {
		return nil, err
	}
	var result []*models.VarianceBySourceValue
	for _, row := range rows {
		var v models.VarianceBySourceValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			continue
		}
		result = append(result, &v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].UnexplainedVarianceMinor.GreaterThan(result[j].UnexplainedVarianceMinor)
	})
	return result, nil
}

// ── INTERNAL HELPERS ─────────────────────────────────────────────────────────

// sanitizeProjectionKey replaces characters that could break the projection key
// string with underscores. Projection keys are used in SQL LIKE queries, so
// characters like %, _, and whitespace must be normalised.
func sanitizeProjectionKey(s string) string {
	return strings.NewReplacer(
		" ", "_",
		"%", "_",
		".", "_",
		"/", "_",
		"\\", "_",
	).Replace(strings.ToLower(s))
}

// appendBoundedSample appends a value to a bounded slice, evicting the oldest
// entry when the slice exceeds maxDelaySamples. This keeps memory bounded while
// preserving the most recent observations for p50/p95 computation.
func appendBoundedSample(samples []int, value int) []int {
	samples = append(samples, value)
	if len(samples) > maxDelaySamples {
		samples = samples[len(samples)-maxDelaySamples:]
	}
	return samples
}

// computePercentile returns the nth percentile value from a sample slice.
// Uses the nearest-rank method (no interpolation) for simplicity and correctness
// at the bounded sample sizes used here (max 500 entries).
// Returns 0.0 if the sample slice is empty.
func computePercentile(samples []int, percentile float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sorted := make([]int, len(samples))
	copy(sorted, samples)
	sort.Ints(sorted)

	// Nearest-rank: index = ceil(p/100 * N) - 1 (0-indexed)
	idx := int(math.Ceil(percentile/100.0*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return float64(sorted[idx])
}

// roundRate rounds a rate to 4 decimal places to avoid floating-point noise in JSON.
func roundRate(v float64) float64 {
	return math.Round(v*10000) / 10000
}
