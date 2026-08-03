package persistence

// consistency_check.go
//
// VerifyBatchTenantConsistency checks that sum(all batch counters for tenant T)
// equals the tenant counter for T, for every LEAKAGE, AMBIGUITY, and
// DEFENSIBILITY counter field maintained by the *BothScopes atomic methods.
//
// FOR USE IN INTEGRATION TESTS ONLY — never called from the production
// event-handling path. Tenant-scoped projections are bucketed into daily
// windows (todayWindow), so we sum ACROSS ALL historical daily rows for a
// given tenant projection_key, not just the latest. Batch-scoped projections
// live in a single lifetime-window row per batch, so we sum across all rows
// matching the batch key prefix.
//
// Only fields that are actually written by the BothScopes methods are
// compared. Fields fed exclusively by tenant-only helpers (e.g.
// AtomicRecordCarrierCompleteness, AtomicRecordEvidenceLeafCoverage — neither
// of which has a BothScopes twin per this task's scope) are intentionally
// excluded, since batch-side values for those fields stay at zero by design.
//
// Derived rate/average fields (percentages, AvgX) are NOT tenant-vs-batch
// additive-compared — a batch's rate can legitimately differ from the
// tenant's overall rate (corrective-action-report P1-04). They ARE checked,
// via metric_registry.go's RATIO/WEIGHTED_AVERAGE self-consistency check:
// does each row's own persisted derived value match its own recomputed
// numerator/denominator? See computeLeakageSums/computeAmbiguitySums/
// computeDefensibilitySums below.

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/models"
)

// VerifyBatchTenantConsistency runs all three family-level consistency checks
// for a tenant. Returns a descriptive error for the first mismatch found.
func (r *ProjectionRepo) VerifyBatchTenantConsistency(
	ctx context.Context,
	tenantID string,
) error {
	if err := r.verifyLeakageConsistency(ctx, tenantID); err != nil {
		return err
	}
	if err := r.verifyAmbiguityConsistency(ctx, tenantID); err != nil {
		return err
	}
	if err := r.verifyDefensibilityConsistency(ctx, tenantID); err != nil {
		return err
	}
	return nil
}

// projectionRow is one projection_state row's value plus enough identity
// (scope_ref) to name which row a P1-04 ratio self-consistency violation
// came from.
type projectionRow struct {
	ScopeRef  string
	ValueJSON string
}

// queryAllValueJSONByKey returns every row matching an exact projection_key,
// across all window_start buckets.
func (r *ProjectionRepo) queryAllValueJSONByKey(ctx context.Context, tenantID, key string) ([]projectionRow, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT COALESCE(scope_ref, ''), value_json FROM projection_state
		WHERE tenant_id = $1 AND projection_key = $2
	`, tenantID, key)
	if err != nil {
		return nil, fmt.Errorf("consistency_check.queryAllValueJSONByKey key=%s: %w", key, err)
	}
	defer rows.Close()

	var result []projectionRow
	for rows.Next() {
		var row projectionRow
		if err := rows.Scan(&row.ScopeRef, &row.ValueJSON); err != nil {
			return nil, fmt.Errorf("consistency_check.queryAllValueJSONByKey scan key=%s: %w", key, err)
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// queryAllValueJSONByPrefix returns every row whose projection_key starts
// with the given prefix.
func (r *ProjectionRepo) queryAllValueJSONByPrefix(ctx context.Context, tenantID, prefix string) ([]projectionRow, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT COALESCE(scope_ref, ''), value_json FROM projection_state
		WHERE tenant_id = $1 AND projection_key LIKE $2
	`, tenantID, prefix+"%")
	if err != nil {
		return nil, fmt.Errorf("consistency_check.queryAllValueJSONByPrefix prefix=%s: %w", prefix, err)
	}
	defer rows.Close()

	var result []projectionRow
	for rows.Next() {
		var row projectionRow
		if err := rows.Scan(&row.ScopeRef, &row.ValueJSON); err != nil {
			return nil, fmt.Errorf("consistency_check.queryAllValueJSONByPrefix scan prefix=%s: %w", prefix, err)
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// computeLeakageSums reads every LEAKAGE tenant/batch row for tenantID and
// returns the summed tenant-scope and batch-scope values, ready to compare,
// plus any P1-04 RATIO/WEIGHTED_AVERAGE self-consistency violations found
// along the way (see metric_registry.go — checked per-row, before folding
// into the additive sums, since an average must never itself be summed).
// Shared by verifyLeakageConsistency (fail-fast, tests) and
// FindConsistencyViolations (collect-all, the scheduled job).
func (r *ProjectionRepo) computeLeakageSums(ctx context.Context, tenantID string) (tenantSum, batchSum models.LeakageValue, ratioViolations []ConsistencyViolation, err error) {
	tenantRows, err := r.queryAllValueJSONByKey(ctx, tenantID, "leakage.total")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	batchRows, err := r.queryAllValueJSONByPrefix(ctx, tenantID, "leakage.batch.")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	for _, row := range tenantRows {
		var v models.LeakageValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeLeakageSums unmarshal tenant row tenant=%s: %w", tenantID, err)
		}
		addLeakageValue(&tenantSum, v)
		ratioViolations = append(ratioViolations, checkLeakageRatios(v, "TENANT", row.ScopeRef)...)
	}
	for _, row := range batchRows {
		var v models.LeakageValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeLeakageSums unmarshal batch row tenant=%s: %w", tenantID, err)
		}
		addLeakageValue(&batchSum, v)
		ratioViolations = append(ratioViolations, checkLeakageRatios(v, "BATCH", row.ScopeRef)...)
	}
	return tenantSum, batchSum, ratioViolations, nil
}

// checkLeakageRatios runs every registered leakageRatioMetrics entry against
// one decoded row and returns a violation for each mismatch.
func checkLeakageRatios(v models.LeakageValue, scopeLabel, scopeRef string) []ConsistencyViolation {
	var out []ConsistencyViolation
	for _, m := range leakageRatioMetrics {
		if ok, expected, stored := checkRatioMetric(m, v); !ok {
			out = append(out, ConsistencyViolation{
				ProjectionFamily: "LEAKAGE",
				MetricKey:        fmt.Sprintf("%s[%s:%s]", m.Name, scopeLabel, scopeRef),
				ExpectedValue:    decimal.NewFromFloat(expected),
				ActualValue:      decimal.NewFromFloat(stored),
			})
		}
	}
	return out
}

func (r *ProjectionRepo) verifyLeakageConsistency(ctx context.Context, tenantID string) error {
	tenantSum, batchSum, ratioViolations, err := r.computeLeakageSums(ctx, tenantID)
	if err != nil {
		return err
	}
	if len(ratioViolations) > 0 {
		v := ratioViolations[0]
		return fmt.Errorf("leakage ratio self-consistency mismatch tenant=%s metric=%s expected=%s stored=%s",
			tenantID, v.MetricKey, v.ExpectedValue.String(), v.ActualValue.String())
	}

	checks := []struct {
		name          string
		tenant, batch decimal.Decimal
	}{
		{"total_amount_minor", tenantSum.TotalAmountMinor, batchSum.TotalAmountMinor},
		{"unmatched_amount_minor", tenantSum.UnmatchedAmountMinor, batchSum.UnmatchedAmountMinor},
		{"under_settlement_amount_minor", tenantSum.UnderSettlementAmountMinor, batchSum.UnderSettlementAmountMinor},
		{"orphan_amount_minor", tenantSum.OrphanAmountMinor, batchSum.OrphanAmountMinor},
		{"reversal_exposure_minor", tenantSum.ReversalExposureMinor, batchSum.ReversalExposureMinor},
		{"duplicate_risk_exposure_minor", tenantSum.DuplicateRiskExposureMinor, batchSum.DuplicateRiskExposureMinor},
		{"confirmed_duplicate_exposure_minor", tenantSum.ConfirmedDuplicateExposureMinor, batchSum.ConfirmedDuplicateExposureMinor},
		{"total_intended_amount_minor", tenantSum.TotalIntendedAmountMinor, batchSum.TotalIntendedAmountMinor},
		{"total_observed_settled_amount_minor", tenantSum.TotalObservedSettledAmountMinor, batchSum.TotalObservedSettledAmountMinor},
		{"over_settlement_amount_minor", tenantSum.OverSettlementAmountMinor, batchSum.OverSettlementAmountMinor},
	}
	for _, c := range checks {
		if !c.tenant.Equal(c.batch) {
			return fmt.Errorf("leakage consistency mismatch tenant=%s field=%s tenant_sum=%s batch_sum=%s",
				tenantID, c.name, c.tenant.String(), c.batch.String())
		}
	}

	intChecks := []struct {
		name          string
		tenant, batch int
	}{
		{"unmatched_intent_count", tenantSum.UnmatchedIntentCount, batchSum.UnmatchedIntentCount},
		{"under_settlement_count", tenantSum.UnderSettlementCount, batchSum.UnderSettlementCount},
		{"orphan_settlement_count", tenantSum.OrphanSettlementCount, batchSum.OrphanSettlementCount},
		{"reversal_count", tenantSum.ReversalCount, batchSum.ReversalCount},
		{"duplicate_risk_count", tenantSum.DuplicateRiskCount, batchSum.DuplicateRiskCount},
		{"confirmed_duplicate_count", tenantSum.ConfirmedDuplicateCount, batchSum.ConfirmedDuplicateCount},
		{"value_date_mismatch_count", tenantSum.ValueDateMismatchCount, batchSum.ValueDateMismatchCount},
		{"over_settlement_count", tenantSum.OverSettlementCount, batchSum.OverSettlementCount},
	}
	for _, c := range intChecks {
		if c.tenant != c.batch {
			return fmt.Errorf("leakage consistency mismatch tenant=%s field=%s tenant_sum=%d batch_sum=%d",
				tenantID, c.name, c.tenant, c.batch)
		}
	}

	return nil
}

func addLeakageValue(sum *models.LeakageValue, v models.LeakageValue) {
	sum.TotalAmountMinor = sum.TotalAmountMinor.Add(v.TotalAmountMinor)
	sum.UnmatchedAmountMinor = sum.UnmatchedAmountMinor.Add(v.UnmatchedAmountMinor)
	sum.UnderSettlementAmountMinor = sum.UnderSettlementAmountMinor.Add(v.UnderSettlementAmountMinor)
	sum.OrphanAmountMinor = sum.OrphanAmountMinor.Add(v.OrphanAmountMinor)
	sum.ReversalExposureMinor = sum.ReversalExposureMinor.Add(v.ReversalExposureMinor)
	sum.UnmatchedIntentCount += v.UnmatchedIntentCount
	sum.UnderSettlementCount += v.UnderSettlementCount
	sum.OrphanSettlementCount += v.OrphanSettlementCount
	sum.ReversalCount += v.ReversalCount
	sum.DuplicateRiskCount += v.DuplicateRiskCount
	sum.DuplicateRiskExposureMinor = sum.DuplicateRiskExposureMinor.Add(v.DuplicateRiskExposureMinor)
	sum.ConfirmedDuplicateCount += v.ConfirmedDuplicateCount
	sum.ConfirmedDuplicateExposureMinor = sum.ConfirmedDuplicateExposureMinor.Add(v.ConfirmedDuplicateExposureMinor)
	sum.TotalIntendedAmountMinor = sum.TotalIntendedAmountMinor.Add(v.TotalIntendedAmountMinor)
	sum.TotalObservedSettledAmountMinor = sum.TotalObservedSettledAmountMinor.Add(v.TotalObservedSettledAmountMinor)
	sum.ValueDateMismatchCount += v.ValueDateMismatchCount
	sum.OverSettlementAmountMinor = sum.OverSettlementAmountMinor.Add(v.OverSettlementAmountMinor)
	sum.OverSettlementCount += v.OverSettlementCount
}

// computeAmbiguitySums is the AMBIGUITY-family twin of computeLeakageSums,
// including the same per-row P1-04 ratio self-consistency check.
func (r *ProjectionRepo) computeAmbiguitySums(ctx context.Context, tenantID string) (tenantSum, batchSum models.AmbiguityValue, ratioViolations []ConsistencyViolation, err error) {
	tenantRows, err := r.queryAllValueJSONByKey(ctx, tenantID, "ambiguity.summary")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	batchRows, err := r.queryAllValueJSONByPrefix(ctx, tenantID, "ambiguity.batch.")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	for _, row := range tenantRows {
		var v models.AmbiguityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeAmbiguitySums unmarshal tenant row tenant=%s: %w", tenantID, err)
		}
		addAmbiguityValue(&tenantSum, v)
		ratioViolations = append(ratioViolations, checkAmbiguityRatios(v, "TENANT", row.ScopeRef)...)
	}
	for _, row := range batchRows {
		var v models.AmbiguityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeAmbiguitySums unmarshal batch row tenant=%s: %w", tenantID, err)
		}
		addAmbiguityValue(&batchSum, v)
		ratioViolations = append(ratioViolations, checkAmbiguityRatios(v, "BATCH", row.ScopeRef)...)
	}
	return tenantSum, batchSum, ratioViolations, nil
}

func checkAmbiguityRatios(v models.AmbiguityValue, scopeLabel, scopeRef string) []ConsistencyViolation {
	var out []ConsistencyViolation
	for _, m := range ambiguityRatioMetrics {
		if ok, expected, stored := checkRatioMetric(m, v); !ok {
			out = append(out, ConsistencyViolation{
				ProjectionFamily: "AMBIGUITY",
				MetricKey:        fmt.Sprintf("%s[%s:%s]", m.Name, scopeLabel, scopeRef),
				ExpectedValue:    decimal.NewFromFloat(expected),
				ActualValue:      decimal.NewFromFloat(stored),
			})
		}
	}
	return out
}

func (r *ProjectionRepo) verifyAmbiguityConsistency(ctx context.Context, tenantID string) error {
	tenantSum, batchSum, ratioViolations, err := r.computeAmbiguitySums(ctx, tenantID)
	if err != nil {
		return err
	}
	if len(ratioViolations) > 0 {
		v := ratioViolations[0]
		return fmt.Errorf("ambiguity ratio self-consistency mismatch tenant=%s metric=%s expected=%s stored=%s",
			tenantID, v.MetricKey, v.ExpectedValue.String(), v.ActualValue.String())
	}

	decimalChecks := []struct {
		name          string
		tenant, batch decimal.Decimal
	}{
		{"ambiguous_amount_minor", tenantSum.AmbiguousAmountMinor, batchSum.AmbiguousAmountMinor},
		{"value_at_risk_minor", tenantSum.ValueAtRiskMinor, batchSum.ValueAtRiskMinor},
	}
	for _, c := range decimalChecks {
		if !c.tenant.Equal(c.batch) {
			return fmt.Errorf("ambiguity consistency mismatch tenant=%s field=%s tenant_sum=%s batch_sum=%s",
				tenantID, c.name, c.tenant.String(), c.batch.String())
		}
	}

	intChecks := []struct {
		name          string
		tenant, batch int
	}{
		{"ambiguous_intent_count", tenantSum.AmbiguousIntentCount, batchSum.AmbiguousIntentCount},
		{"unresolved_settlement_count", tenantSum.UnresolvedSettlementCount, batchSum.UnresolvedSettlementCount},
		{"confidence_count", tenantSum.ConfidenceCount, batchSum.ConfidenceCount},
		{"provider_ref_missing_count", tenantSum.ProviderRefMissingCount, batchSum.ProviderRefMissingCount},
		{"total_decisions", tenantSum.TotalDecisions, batchSum.TotalDecisions},
		{"low_confidence_count", tenantSum.LowConfidenceCount, batchSum.LowConfidenceCount},
		{"candidate_collision_count", tenantSum.CandidateCollisionCount, batchSum.CandidateCollisionCount},
		{"score_margin_count", tenantSum.ScoreMarginCount, batchSum.ScoreMarginCount},
		{"successful_decision_count", tenantSum.SuccessfulDecisionCount, batchSum.SuccessfulDecisionCount},
	}
	for _, c := range intChecks {
		if c.tenant != c.batch {
			return fmt.Errorf("ambiguity consistency mismatch tenant=%s field=%s tenant_sum=%d batch_sum=%d",
				tenantID, c.name, c.tenant, c.batch)
		}
	}

	// score_margin_sum / confidence_sum are float64 running sums — compare with
	// a small epsilon to absorb JSON float round-trip noise.
	floatChecks := []struct {
		name          string
		tenant, batch float64
	}{
		{"confidence_sum", tenantSum.ConfidenceSum, batchSum.ConfidenceSum},
		{"score_margin_sum", tenantSum.ScoreMarginSum, batchSum.ScoreMarginSum},
	}
	for _, c := range floatChecks {
		if diff := c.tenant - c.batch; diff > 1e-6 || diff < -1e-6 {
			return fmt.Errorf("ambiguity consistency mismatch tenant=%s field=%s tenant_sum=%f batch_sum=%f",
				tenantID, c.name, c.tenant, c.batch)
		}
	}

	return nil
}

func addAmbiguityValue(sum *models.AmbiguityValue, v models.AmbiguityValue) {
	sum.AmbiguousIntentCount += v.AmbiguousIntentCount
	sum.AmbiguousAmountMinor = sum.AmbiguousAmountMinor.Add(v.AmbiguousAmountMinor)
	sum.UnresolvedSettlementCount += v.UnresolvedSettlementCount
	sum.ValueAtRiskMinor = sum.ValueAtRiskMinor.Add(v.ValueAtRiskMinor)
	sum.ConfidenceSum += v.ConfidenceSum
	sum.ConfidenceCount += v.ConfidenceCount
	sum.ProviderRefMissingCount += v.ProviderRefMissingCount
	sum.TotalDecisions += v.TotalDecisions
	sum.LowConfidenceCount += v.LowConfidenceCount
	sum.CandidateCollisionCount += v.CandidateCollisionCount
	sum.ScoreMarginSum += v.ScoreMarginSum
	sum.ScoreMarginCount += v.ScoreMarginCount
	sum.SuccessfulDecisionCount += v.SuccessfulDecisionCount
}

// computeDefensibilitySums is the DEFENSIBILITY-family twin of
// computeLeakageSums, including the same per-row P1-04 ratio
// self-consistency check.
func (r *ProjectionRepo) computeDefensibilitySums(ctx context.Context, tenantID string) (tenantSum, batchSum models.DefensibilityValue, ratioViolations []ConsistencyViolation, err error) {
	tenantRows, err := r.queryAllValueJSONByKey(ctx, tenantID, "defensibility.summary")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	batchRows, err := r.queryAllValueJSONByPrefix(ctx, tenantID, "defensibility.batch.")
	if err != nil {
		return tenantSum, batchSum, nil, err
	}
	for _, row := range tenantRows {
		var v models.DefensibilityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeDefensibilitySums unmarshal tenant row tenant=%s: %w", tenantID, err)
		}
		addDefensibilityValue(&tenantSum, v)
		ratioViolations = append(ratioViolations, checkDefensibilityRatios(v, "TENANT", row.ScopeRef)...)
	}
	for _, row := range batchRows {
		var v models.DefensibilityValue
		if err := json.Unmarshal([]byte(row.ValueJSON), &v); err != nil {
			return tenantSum, batchSum, nil, fmt.Errorf("consistency_check.computeDefensibilitySums unmarshal batch row tenant=%s: %w", tenantID, err)
		}
		addDefensibilityValue(&batchSum, v)
		ratioViolations = append(ratioViolations, checkDefensibilityRatios(v, "BATCH", row.ScopeRef)...)
	}
	return tenantSum, batchSum, ratioViolations, nil
}

func checkDefensibilityRatios(v models.DefensibilityValue, scopeLabel, scopeRef string) []ConsistencyViolation {
	var out []ConsistencyViolation
	for _, m := range defensibilityRatioMetrics {
		if ok, expected, stored := checkRatioMetric(m, v); !ok {
			out = append(out, ConsistencyViolation{
				ProjectionFamily: "DEFENSIBILITY",
				MetricKey:        fmt.Sprintf("%s[%s:%s]", m.Name, scopeLabel, scopeRef),
				ExpectedValue:    decimal.NewFromFloat(expected),
				ActualValue:      decimal.NewFromFloat(stored),
			})
		}
	}
	return out
}

func (r *ProjectionRepo) verifyDefensibilityConsistency(ctx context.Context, tenantID string) error {
	tenantSum, batchSum, ratioViolations, err := r.computeDefensibilitySums(ctx, tenantID)
	if err != nil {
		return err
	}
	if len(ratioViolations) > 0 {
		v := ratioViolations[0]
		return fmt.Errorf("defensibility ratio self-consistency mismatch tenant=%s metric=%s expected=%s stored=%s",
			tenantID, v.MetricKey, v.ExpectedValue.String(), v.ActualValue.String())
	}

	intChecks := []struct {
		name          string
		tenant, batch int
	}{
		{"total_intents", tenantSum.TotalIntents, batchSum.TotalIntents},
		{"with_evidence_pack", tenantSum.WithEvidencePack, batchSum.WithEvidencePack},
		{"with_governance_decision", tenantSum.WithGovernanceDecision, batchSum.WithGovernanceDecision},
		{"with_replay_equivalence", tenantSum.WithReplayEquivalence, batchSum.WithReplayEquivalence},
		{"with_kyc_checked", tenantSum.WithKYCChecked, batchSum.WithKYCChecked},
		{"with_aml_checked", tenantSum.WithAMLChecked, batchSum.WithAMLChecked},
		{"governance_approved_count", tenantSum.GovernanceApprovedCount, batchSum.GovernanceApprovedCount},
		{"governance_rejected_count", tenantSum.GovernanceRejectedCount, batchSum.GovernanceRejectedCount},
		{"governance_escalated_count", tenantSum.GovernanceEscalatedCount, batchSum.GovernanceEscalatedCount},
		{"pack_completeness_count", tenantSum.PackCompletenessCount, batchSum.PackCompletenessCount},
		{"with_settlement_leaf", tenantSum.WithSettlementLeaf, batchSum.WithSettlementLeaf},
		{"with_attachment_leaf", tenantSum.WithAttachmentLeaf, batchSum.WithAttachmentLeaf},
		{"weak_evidence_count", tenantSum.WeakEvidenceCount, batchSum.WeakEvidenceCount},
		{"intent_quality_count", tenantSum.IntentQualityCount, batchSum.IntentQualityCount},
		{"mapping_confidence_count", tenantSum.MappingConfidenceCount, batchSum.MappingConfidenceCount},
	}
	for _, c := range intChecks {
		if c.tenant != c.batch {
			return fmt.Errorf("defensibility consistency mismatch tenant=%s field=%s tenant_sum=%d batch_sum=%d",
				tenantID, c.name, c.tenant, c.batch)
		}
	}

	floatChecks := []struct {
		name          string
		tenant, batch float64
	}{
		{"pack_completeness_sum", tenantSum.PackCompletenessSum, batchSum.PackCompletenessSum},
		{"intent_quality_sum", tenantSum.IntentQualitySum, batchSum.IntentQualitySum},
		{"mapping_confidence_sum", tenantSum.MappingConfidenceSum, batchSum.MappingConfidenceSum},
	}
	for _, c := range floatChecks {
		if diff := c.tenant - c.batch; diff > 1e-6 || diff < -1e-6 {
			return fmt.Errorf("defensibility consistency mismatch tenant=%s field=%s tenant_sum=%f batch_sum=%f",
				tenantID, c.name, c.tenant, c.batch)
		}
	}

	return nil
}

func addDefensibilityValue(sum *models.DefensibilityValue, v models.DefensibilityValue) {
	sum.TotalIntents += v.TotalIntents
	sum.WithEvidencePack += v.WithEvidencePack
	sum.WithGovernanceDecision += v.WithGovernanceDecision
	sum.WithReplayEquivalence += v.WithReplayEquivalence
	sum.WithKYCChecked += v.WithKYCChecked
	sum.WithAMLChecked += v.WithAMLChecked
	sum.GovernanceApprovedCount += v.GovernanceApprovedCount
	sum.GovernanceRejectedCount += v.GovernanceRejectedCount
	sum.GovernanceEscalatedCount += v.GovernanceEscalatedCount
	sum.PackCompletenessSum += v.PackCompletenessSum
	sum.PackCompletenessCount += v.PackCompletenessCount
	sum.WithSettlementLeaf += v.WithSettlementLeaf
	sum.WithAttachmentLeaf += v.WithAttachmentLeaf
	sum.WeakEvidenceCount += v.WeakEvidenceCount
	sum.IntentQualitySum += v.IntentQualitySum
	sum.IntentQualityCount += v.IntentQualityCount
	sum.MappingConfidenceSum += v.MappingConfidenceSum
	sum.MappingConfidenceCount += v.MappingConfidenceCount
}

// ── Gap-fix pass (2026-07-13): projection_consistency_violations job ────────
//
// clarification doc §11 asks to "promote VerifyBatchTenantConsistency from
// test-only to a scheduled production job" outputting to
// projection_consistency_violations. VerifyBatchTenantConsistency itself
// stays fail-fast (test-only, unchanged) — FindConsistencyViolations below
// is the collect-all sibling the scheduled job actually calls, sharing the
// same compute*Sums functions so both stay in sync by construction.

// ConsistencyViolation is one tenant-vs-batch mismatch, ready to persist into
// projection_consistency_violations.
type ConsistencyViolation struct {
	ProjectionFamily string
	MetricKey        string
	ExpectedValue    decimal.Decimal // tenant-scope sum
	ActualValue      decimal.Decimal // batch-scope sum
}

// FindConsistencyViolations runs all three family-level checks for tenantID
// and returns every mismatch found (does not stop at the first one).
func (r *ProjectionRepo) FindConsistencyViolations(ctx context.Context, tenantID string) ([]ConsistencyViolation, error) {
	var out []ConsistencyViolation

	leakTenant, leakBatch, leakRatioViolations, err := r.computeLeakageSums(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out = append(out, diffLeakage(leakTenant, leakBatch)...)
	out = append(out, leakRatioViolations...)

	ambTenant, ambBatch, ambRatioViolations, err := r.computeAmbiguitySums(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out = append(out, diffAmbiguity(ambTenant, ambBatch)...)
	out = append(out, ambRatioViolations...)

	defTenant, defBatch, defRatioViolations, err := r.computeDefensibilitySums(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out = append(out, diffDefensibility(defTenant, defBatch)...)
	out = append(out, defRatioViolations...)

	return out, nil
}

func diffLeakage(tenantSum, batchSum models.LeakageValue) []ConsistencyViolation {
	var out []ConsistencyViolation
	decimalFields := []struct {
		name          string
		tenant, batch decimal.Decimal
	}{
		{"total_amount_minor", tenantSum.TotalAmountMinor, batchSum.TotalAmountMinor},
		{"unmatched_amount_minor", tenantSum.UnmatchedAmountMinor, batchSum.UnmatchedAmountMinor},
		{"under_settlement_amount_minor", tenantSum.UnderSettlementAmountMinor, batchSum.UnderSettlementAmountMinor},
		{"orphan_amount_minor", tenantSum.OrphanAmountMinor, batchSum.OrphanAmountMinor},
		{"reversal_exposure_minor", tenantSum.ReversalExposureMinor, batchSum.ReversalExposureMinor},
		{"duplicate_risk_exposure_minor", tenantSum.DuplicateRiskExposureMinor, batchSum.DuplicateRiskExposureMinor},
		{"confirmed_duplicate_exposure_minor", tenantSum.ConfirmedDuplicateExposureMinor, batchSum.ConfirmedDuplicateExposureMinor},
		{"total_intended_amount_minor", tenantSum.TotalIntendedAmountMinor, batchSum.TotalIntendedAmountMinor},
		{"total_observed_settled_amount_minor", tenantSum.TotalObservedSettledAmountMinor, batchSum.TotalObservedSettledAmountMinor},
		{"over_settlement_amount_minor", tenantSum.OverSettlementAmountMinor, batchSum.OverSettlementAmountMinor},
	}
	for _, f := range decimalFields {
		if !f.tenant.Equal(f.batch) {
			out = append(out, ConsistencyViolation{"LEAKAGE", f.name, f.tenant, f.batch})
		}
	}
	intFields := []struct {
		name          string
		tenant, batch int
	}{
		{"unmatched_intent_count", tenantSum.UnmatchedIntentCount, batchSum.UnmatchedIntentCount},
		{"under_settlement_count", tenantSum.UnderSettlementCount, batchSum.UnderSettlementCount},
		{"orphan_settlement_count", tenantSum.OrphanSettlementCount, batchSum.OrphanSettlementCount},
		{"reversal_count", tenantSum.ReversalCount, batchSum.ReversalCount},
		{"duplicate_risk_count", tenantSum.DuplicateRiskCount, batchSum.DuplicateRiskCount},
		{"confirmed_duplicate_count", tenantSum.ConfirmedDuplicateCount, batchSum.ConfirmedDuplicateCount},
		{"value_date_mismatch_count", tenantSum.ValueDateMismatchCount, batchSum.ValueDateMismatchCount},
		{"over_settlement_count", tenantSum.OverSettlementCount, batchSum.OverSettlementCount},
	}
	for _, f := range intFields {
		if f.tenant != f.batch {
			out = append(out, ConsistencyViolation{"LEAKAGE", f.name, decimal.NewFromInt(int64(f.tenant)), decimal.NewFromInt(int64(f.batch))})
		}
	}
	return out
}

func diffAmbiguity(tenantSum, batchSum models.AmbiguityValue) []ConsistencyViolation {
	var out []ConsistencyViolation
	decimalFields := []struct {
		name          string
		tenant, batch decimal.Decimal
	}{
		{"ambiguous_amount_minor", tenantSum.AmbiguousAmountMinor, batchSum.AmbiguousAmountMinor},
		{"value_at_risk_minor", tenantSum.ValueAtRiskMinor, batchSum.ValueAtRiskMinor},
	}
	for _, f := range decimalFields {
		if !f.tenant.Equal(f.batch) {
			out = append(out, ConsistencyViolation{"AMBIGUITY", f.name, f.tenant, f.batch})
		}
	}
	intFields := []struct {
		name          string
		tenant, batch int
	}{
		{"ambiguous_intent_count", tenantSum.AmbiguousIntentCount, batchSum.AmbiguousIntentCount},
		{"unresolved_settlement_count", tenantSum.UnresolvedSettlementCount, batchSum.UnresolvedSettlementCount},
		{"confidence_count", tenantSum.ConfidenceCount, batchSum.ConfidenceCount},
		{"provider_ref_missing_count", tenantSum.ProviderRefMissingCount, batchSum.ProviderRefMissingCount},
		{"total_decisions", tenantSum.TotalDecisions, batchSum.TotalDecisions},
		{"low_confidence_count", tenantSum.LowConfidenceCount, batchSum.LowConfidenceCount},
		{"candidate_collision_count", tenantSum.CandidateCollisionCount, batchSum.CandidateCollisionCount},
		{"score_margin_count", tenantSum.ScoreMarginCount, batchSum.ScoreMarginCount},
		{"successful_decision_count", tenantSum.SuccessfulDecisionCount, batchSum.SuccessfulDecisionCount},
	}
	for _, f := range intFields {
		if f.tenant != f.batch {
			out = append(out, ConsistencyViolation{"AMBIGUITY", f.name, decimal.NewFromInt(int64(f.tenant)), decimal.NewFromInt(int64(f.batch))})
		}
	}
	floatFields := []struct {
		name          string
		tenant, batch float64
	}{
		{"confidence_sum", tenantSum.ConfidenceSum, batchSum.ConfidenceSum},
		{"score_margin_sum", tenantSum.ScoreMarginSum, batchSum.ScoreMarginSum},
	}
	for _, f := range floatFields {
		if diff := f.tenant - f.batch; diff > 1e-6 || diff < -1e-6 {
			out = append(out, ConsistencyViolation{"AMBIGUITY", f.name, decimal.NewFromFloat(f.tenant), decimal.NewFromFloat(f.batch)})
		}
	}
	return out
}

func diffDefensibility(tenantSum, batchSum models.DefensibilityValue) []ConsistencyViolation {
	var out []ConsistencyViolation
	intFields := []struct {
		name          string
		tenant, batch int
	}{
		{"total_intents", tenantSum.TotalIntents, batchSum.TotalIntents},
		{"with_evidence_pack", tenantSum.WithEvidencePack, batchSum.WithEvidencePack},
		{"with_governance_decision", tenantSum.WithGovernanceDecision, batchSum.WithGovernanceDecision},
		{"with_replay_equivalence", tenantSum.WithReplayEquivalence, batchSum.WithReplayEquivalence},
		{"with_kyc_checked", tenantSum.WithKYCChecked, batchSum.WithKYCChecked},
		{"with_aml_checked", tenantSum.WithAMLChecked, batchSum.WithAMLChecked},
		{"governance_approved_count", tenantSum.GovernanceApprovedCount, batchSum.GovernanceApprovedCount},
		{"governance_rejected_count", tenantSum.GovernanceRejectedCount, batchSum.GovernanceRejectedCount},
		{"governance_escalated_count", tenantSum.GovernanceEscalatedCount, batchSum.GovernanceEscalatedCount},
		{"pack_completeness_count", tenantSum.PackCompletenessCount, batchSum.PackCompletenessCount},
		{"with_settlement_leaf", tenantSum.WithSettlementLeaf, batchSum.WithSettlementLeaf},
		{"with_attachment_leaf", tenantSum.WithAttachmentLeaf, batchSum.WithAttachmentLeaf},
		{"weak_evidence_count", tenantSum.WeakEvidenceCount, batchSum.WeakEvidenceCount},
		{"intent_quality_count", tenantSum.IntentQualityCount, batchSum.IntentQualityCount},
		{"mapping_confidence_count", tenantSum.MappingConfidenceCount, batchSum.MappingConfidenceCount},
	}
	for _, f := range intFields {
		if f.tenant != f.batch {
			out = append(out, ConsistencyViolation{"DEFENSIBILITY", f.name, decimal.NewFromInt(int64(f.tenant)), decimal.NewFromInt(int64(f.batch))})
		}
	}
	floatFields := []struct {
		name          string
		tenant, batch float64
	}{
		{"pack_completeness_sum", tenantSum.PackCompletenessSum, batchSum.PackCompletenessSum},
		{"intent_quality_sum", tenantSum.IntentQualitySum, batchSum.IntentQualitySum},
		{"mapping_confidence_sum", tenantSum.MappingConfidenceSum, batchSum.MappingConfidenceSum},
	}
	for _, f := range floatFields {
		if diff := f.tenant - f.batch; diff > 1e-6 || diff < -1e-6 {
			out = append(out, ConsistencyViolation{"DEFENSIBILITY", f.name, decimal.NewFromFloat(f.tenant), decimal.NewFromFloat(f.batch)})
		}
	}
	return out
}

// RecordConsistencyViolations persists violations found by
// FindConsistencyViolations into projection_consistency_violations.
func (r *ProjectionRepo) RecordConsistencyViolations(ctx context.Context, tenantID string, violations []ConsistencyViolation) error {
	for _, v := range violations {
		diff := v.ExpectedValue.Sub(v.ActualValue)
		_, err := r.q(ctx).Exec(ctx, `
			INSERT INTO projection_consistency_violations
				(tenant_id, projection_family, metric_key, expected_value, actual_value, difference)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, tenantID, v.ProjectionFamily, v.MetricKey, v.ExpectedValue, v.ActualValue, diff)
		if err != nil {
			return fmt.Errorf("consistency_check.RecordConsistencyViolations tenant=%s family=%s metric=%s: %w",
				tenantID, v.ProjectionFamily, v.MetricKey, err)
		}
	}
	return nil
}

// ListDistinctTenants returns every tenant_id with at least one projection_state
// row — the candidate set the scheduled consistency job iterates.
func (r *ProjectionRepo) ListDistinctTenants(ctx context.Context) ([]string, error) {
	rows, err := r.q(ctx).Query(ctx, `SELECT DISTINCT tenant_id FROM projection_state`)
	if err != nil {
		return nil, fmt.Errorf("consistency_check.ListDistinctTenants: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, fmt.Errorf("consistency_check.ListDistinctTenants scan: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
