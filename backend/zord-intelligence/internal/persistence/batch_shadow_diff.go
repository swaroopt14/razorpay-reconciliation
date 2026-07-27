package persistence

// batch_shadow_diff.go — Phase 2 gap-fix pass (2026-07-13): compares
// batch_contracts (old) against the new split tables (batch_reconciliation_summary
// + batch_risk_summary) for every batch, recording mismatches into
// refactor_shadow_diffs. Implements docs/service_7_refactoring_clarifications.md
// §14 ("Concrete compare old vs new during cutover") for the one comparison
// target that's actually buildable today — batch_contracts old vs new summary
// tables. The other three targets listed there (projection_state,
// action_contracts, outbox) don't apply yet since those tables haven't been
// refactored.
//
// This never blocks or mutates data — purely observational, feeding the
// shadow-diff table that gates the eventual read cutover (§14 cutover rule:
// "P0 fields must have 0 mismatches").

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// batchShadowFields holds the fields dual-written 1:1 between batch_contracts
// and the new split tables — the ones a shadow-diff can honestly compare.
// The new blueprint-target v2 fields added in this same gap-fix pass (e.g.
// matched_pair_variance_minor) have no old-table equivalent and are excluded
// on purpose — comparing them would always show a "mismatch" against a field
// that was never meant to hold the same value.
type batchShadowFields struct {
	TotalCount, SuccessCount, FailedCount, PendingCount, ReversedCount, PartialReconCount int
	TotalIntendedAmountMinor, TotalConfirmedAmountMinor, OriginalSettledAmountMinor, TotalVarianceMinor decimal.Decimal
	BatchFinalityStatus string
	MatchConfidence     *float64

	TotalIntentCount, MatchedIntentCount, AmbiguousCount, UnresolvedIntentCount, ConflictedCount, OrphanObservationCount int
	OriginalIntendedAmountMinor, AmbiguousAmountMinor, UnresolvedIntendedAmountMinor, ConflictedAmountMinor, OrphanObservedAmountMinor, NetBatchDeltaMinor decimal.Decimal
	IntentCountCoverage, IntentValueCoverage, ObservedCountAllocationCoverage, ObservedValueAllocationCoverage float64

	AmbiguityScore                                                                                            *float64
	DefensibilityTier                                                                                         *string
	UnmatchedAmountMinor, ReversalExposureMinor, OrphanAmountMinor, DuplicateRiskExposureMinor                 decimal.Decimal
	UnexplainedVarianceMinor, WhitelistedDeductionMinor                                                        decimal.Decimal
	MissingRefCount, SettlementRefCount, BankRefPresentCount, DecisionRefCount, ClientRefPresentCount          int
}

func shadowFieldsFromOld(bc *BatchContract) batchShadowFields {
	return batchShadowFields{
		TotalCount: bc.TotalCount, SuccessCount: bc.SuccessCount, FailedCount: bc.FailedCount,
		PendingCount: bc.PendingCount, ReversedCount: bc.ReversedCount, PartialReconCount: bc.PartialReconCount,
		TotalIntendedAmountMinor: bc.TotalIntendedAmountMinor, TotalConfirmedAmountMinor: bc.TotalConfirmedAmountMinor,
		OriginalSettledAmountMinor: bc.OriginalSettledAmountMinor, TotalVarianceMinor: bc.TotalVarianceMinor,
		BatchFinalityStatus: bc.BatchFinalityStatus, MatchConfidence: bc.MatchConfidence,
		TotalIntentCount: bc.TotalIntentCount, MatchedIntentCount: bc.MatchedIntentCount, AmbiguousCount: bc.AmbiguousCount,
		UnresolvedIntentCount: bc.UnresolvedIntentCount, ConflictedCount: bc.ConflictedCount, OrphanObservationCount: bc.OrphanObservationCount,
		OriginalIntendedAmountMinor: bc.OriginalIntendedAmountMinor, AmbiguousAmountMinor: bc.AmbiguousAmountMinor,
		UnresolvedIntendedAmountMinor: bc.UnresolvedIntendedAmountMinor, ConflictedAmountMinor: bc.ConflictedAmountMinor,
		OrphanObservedAmountMinor: bc.OrphanObservedAmountMinor, NetBatchDeltaMinor: bc.NetBatchDeltaMinor,
		IntentCountCoverage: bc.IntentCountCoverage, IntentValueCoverage: bc.IntentValueCoverage,
		ObservedCountAllocationCoverage: bc.ObservedCountAllocationCoverage, ObservedValueAllocationCoverage: bc.ObservedValueAllocationCoverage,
		AmbiguityScore: bc.AmbiguityScore, DefensibilityTier: bc.DefensibilityTier,
		UnmatchedAmountMinor: bc.UnmatchedAmountMinor, ReversalExposureMinor: bc.ReversalExposureMinor,
		OrphanAmountMinor: bc.OrphanAmountMinor, DuplicateRiskExposureMinor: bc.DuplicateRiskExposureMinor,
		UnexplainedVarianceMinor: bc.UnexplainedVarianceMinor, WhitelistedDeductionMinor: bc.WhitelistedDeductionMinor,
		MissingRefCount: bc.MissingRefCount, SettlementRefCount: bc.SettlementRefCount,
		BankRefPresentCount: bc.BankRefPresentCount, DecisionRefCount: bc.DecisionRefCount, ClientRefPresentCount: bc.ClientRefPresentCount,
	}
}

// getShadowFieldsFromNew reads the old-shape comparison fields back out of
// the new split tables for one batch, joined by the resolved
// batch_contracts_core identity. This is the "translation layer" clarification
// doc §12 describes: match_confidence and observed_value_allocation_coverage
// no longer exist as stored columns on the new tables (blueprint-alignment
// pass, 2026-07-14 — they were true duplicates of matched_attachment_confidence
// and observed_value_coverage) so they're derived here instead, at comparison
// time, from the blueprint-named columns that now hold the real data.
// match_confidence needs an explicit ROUND: the old column was NUMERIC(4,3)
// (3 decimal places) but matched_attachment_confidence is NUMERIC(6,5) (5
// decimal places) — comparing the raw values would report a false mismatch
// on every batch purely from precision, not an actual data difference.
// observed_value_coverage needs no rounding: both old and new hold 6 decimal
// places, only the old column's unused integer-part width differed.
func (r *BatchContractRepo) getShadowFieldsFromNew(ctx context.Context, batchContractID string) (*batchShadowFields, error) {
	var f batchShadowFields
	row := r.q(ctx).QueryRow(ctx, `
		SELECT
			rs.total_count, rs.success_count, rs.failed_count, rs.pending_count, rs.reversed_count, rs.partial_recon_count,
			rs.total_intended_amount_minor::text, rs.total_confirmed_amount_minor::text, rs.original_settled_amount_minor::text, rs.total_variance_minor::text,
			rs.batch_finality_status, ROUND(rs.matched_attachment_confidence::numeric, 3),
			rs.total_intent_count, rs.matched_intent_count, rs.ambiguous_count, rs.unresolved_intent_count, rs.conflicted_count, rs.orphan_observation_count,
			rs.original_intended_amount_minor::text, rs.ambiguous_amount_minor::text, rs.unresolved_intended_amount_minor::text, rs.conflicted_amount_minor::text, rs.orphan_observed_amount_minor::text, rs.net_batch_delta_minor::text,
			rs.intent_count_coverage, rs.intent_value_coverage, rs.observed_count_allocation_coverage, rs.observed_value_coverage,
			rk.ambiguity_score, rk.defensibility_tier,
			rk.unmatched_amount_minor::text, rk.reversal_exposure_minor::text, rk.orphan_amount_minor::text, rk.duplicate_risk_exposure_minor::text,
			rk.unexplained_variance_minor::text, rk.whitelisted_deduction_minor::text,
			rk.missing_ref_count, rk.settlement_ref_count, rk.bank_ref_present_count, rk.decision_ref_count, rk.client_ref_present_count
		FROM batch_reconciliation_summary rs
		JOIN batch_risk_summary rk ON rk.batch_contract_id = rs.batch_contract_id
		WHERE rs.batch_contract_id = $1
	`, batchContractID)

	var totalIntended, totalConfirmed, originalSettled, totalVariance string
	var origIntended, ambiguousAmt, unresolvedIntended, conflictedAmt, orphanObserved, netDelta string
	var unmatchedAmt, reversalExp, orphanAmt, dupRiskExp, unexplainedVar, whitelistedDed string

	if err := row.Scan(
		&f.TotalCount, &f.SuccessCount, &f.FailedCount, &f.PendingCount, &f.ReversedCount, &f.PartialReconCount,
		&totalIntended, &totalConfirmed, &originalSettled, &totalVariance,
		&f.BatchFinalityStatus, &f.MatchConfidence,
		&f.TotalIntentCount, &f.MatchedIntentCount, &f.AmbiguousCount, &f.UnresolvedIntentCount, &f.ConflictedCount, &f.OrphanObservationCount,
		&origIntended, &ambiguousAmt, &unresolvedIntended, &conflictedAmt, &orphanObserved, &netDelta,
		&f.IntentCountCoverage, &f.IntentValueCoverage, &f.ObservedCountAllocationCoverage, &f.ObservedValueAllocationCoverage,
		&f.AmbiguityScore, &f.DefensibilityTier,
		&unmatchedAmt, &reversalExp, &orphanAmt, &dupRiskExp,
		&unexplainedVar, &whitelistedDed,
		&f.MissingRefCount, &f.SettlementRefCount, &f.BankRefPresentCount, &f.DecisionRefCount, &f.ClientRefPresentCount,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("batch_shadow_diff.getShadowFieldsFromNew batch_contract_id=%s: %w", batchContractID, err)
	}

	for _, pair := range []struct {
		dst *decimal.Decimal
		src string
	}{
		{&f.TotalIntendedAmountMinor, totalIntended}, {&f.TotalConfirmedAmountMinor, totalConfirmed},
		{&f.OriginalSettledAmountMinor, originalSettled}, {&f.TotalVarianceMinor, totalVariance},
		{&f.OriginalIntendedAmountMinor, origIntended}, {&f.AmbiguousAmountMinor, ambiguousAmt},
		{&f.UnresolvedIntendedAmountMinor, unresolvedIntended}, {&f.ConflictedAmountMinor, conflictedAmt},
		{&f.OrphanObservedAmountMinor, orphanObserved}, {&f.NetBatchDeltaMinor, netDelta},
		{&f.UnmatchedAmountMinor, unmatchedAmt}, {&f.ReversalExposureMinor, reversalExp},
		{&f.OrphanAmountMinor, orphanAmt}, {&f.DuplicateRiskExposureMinor, dupRiskExp},
		{&f.UnexplainedVarianceMinor, unexplainedVar}, {&f.WhitelistedDeductionMinor, whitelistedDed},
	} {
		d, err := decimal.NewFromString(pair.src)
		if err != nil {
			return nil, fmt.Errorf("batch_shadow_diff.getShadowFieldsFromNew parse decimal batch_contract_id=%s: %w", batchContractID, err)
		}
		*pair.dst = d
	}
	return &f, nil
}

// CompareBatchOldVsNew compares one batch's old batch_contracts row against
// its new split-table rows. Returns (matched=true, nil) if either side has no
// data yet (nothing to compare) or every compared field is equal. On a
// mismatch, writes one row to refactor_shadow_diffs and returns matched=false.
func (r *BatchContractRepo) CompareBatchOldVsNew(ctx context.Context, tenantID, externalBatchID string) (matched bool, err error) {
	old, err := r.GetByID(ctx, externalBatchID)
	if err != nil {
		return false, fmt.Errorf("batch_shadow_diff.CompareBatchOldVsNew GetByID batch=%s: %w", externalBatchID, err)
	}
	if old == nil || old.TenantID != tenantID {
		return true, nil // nothing to compare yet, or belongs to another tenant — not a mismatch
	}

	batchContractID, err := r.GetCoreID(ctx, tenantID, externalBatchID)
	if err != nil {
		return false, fmt.Errorf("batch_shadow_diff.CompareBatchOldVsNew GetCoreID batch=%s: %w", externalBatchID, err)
	}
	if batchContractID == nil {
		return true, nil // not backfilled/shadow-written yet — not a mismatch, just not comparable yet
	}

	newFields, err := r.getShadowFieldsFromNew(ctx, *batchContractID)
	if err != nil {
		return false, err
	}
	if newFields == nil {
		return true, nil
	}

	oldFields := shadowFieldsFromOld(old)

	oldJSON, err := json.Marshal(oldFields)
	if err != nil {
		return false, fmt.Errorf("batch_shadow_diff.CompareBatchOldVsNew marshal old batch=%s: %w", externalBatchID, err)
	}
	newJSON, err := json.Marshal(*newFields)
	if err != nil {
		return false, fmt.Errorf("batch_shadow_diff.CompareBatchOldVsNew marshal new batch=%s: %w", externalBatchID, err)
	}

	oldHash := sha256.Sum256(oldJSON)
	newHash := sha256.Sum256(newJSON)
	oldHashHex, newHashHex := hex.EncodeToString(oldHash[:]), hex.EncodeToString(newHash[:])

	if oldHashHex == newHashHex {
		return true, nil
	}

	// P0 fields (frozen v1 batch object per P0_FIELD_INVENTORY.md §2.9) must
	// have 0 mismatches per the cutover rule — every field compared here is
	// P0, so any mismatch is CRITICAL.
	diffJSON := fmt.Sprintf(`{"old":%s,"new":%s}`, string(oldJSON), string(newJSON))
	_, err = r.q(ctx).Exec(ctx, `
		INSERT INTO refactor_shadow_diffs
			(tenant_id, scope_type, scope_ref, diff_family, old_payload_hash, new_payload_hash, diff_json, severity)
		VALUES ($1, 'BATCH', $2, 'batch_contracts', $3, $4, $5::jsonb, 'CRITICAL')
	`, tenantID, externalBatchID, oldHashHex, newHashHex, diffJSON)
	if err != nil {
		return false, fmt.Errorf("batch_shadow_diff.CompareBatchOldVsNew insert diff batch=%s: %w", externalBatchID, err)
	}
	return false, nil
}

// ListAllExternalBatchIDs returns every (tenant_id, external_batch_id) pair
// known to batch_contracts_core — the candidate set the shadow-diff worker
// iterates.
func (r *BatchContractRepo) ListAllExternalBatchIDs(ctx context.Context) ([]struct{ TenantID, ExternalBatchID string }, error) {
	rows, err := r.q(ctx).Query(ctx, `SELECT tenant_id, external_batch_id FROM batch_contracts_core`)
	if err != nil {
		return nil, fmt.Errorf("batch_shadow_diff.ListAllExternalBatchIDs: %w", err)
	}
	defer rows.Close()
	var out []struct{ TenantID, ExternalBatchID string }
	for rows.Next() {
		var t, b string
		if err := rows.Scan(&t, &b); err != nil {
			return nil, fmt.Errorf("batch_shadow_diff.ListAllExternalBatchIDs scan: %w", err)
		}
		out = append(out, struct{ TenantID, ExternalBatchID string }{t, b})
	}
	return out, rows.Err()
}
