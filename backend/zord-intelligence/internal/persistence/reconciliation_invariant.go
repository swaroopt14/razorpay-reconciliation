package persistence

// reconciliation_invariant.go — INTEL-11.
//
// The ticket's acceptance test is worded "submitted = accepted + held +
// rejected + failed per currency". That exact vocabulary does not exist in
// this service (confirmed by exhaustive search — no ACCEPTED/HELD/
// SUBMITTED status anywhere). zord-intelligence's real reconciliation
// counts are total_count/success_count/failed_count/pending_count/
// reversed_count/partial_recon_count, already stored per-row (one row per
// batch_contract_id) together with a currency column on
// batch_reconciliation_summary. Mapped onto those real fields (decision
// confirmed with the ticket owner — see PHASE_1_TO_5_TECHNICAL_REFERENCE.md
// conventions for how prior INTEL tickets were localized the same way),
// this service's equivalent invariant is:
//
//	total_count == success_count + failed_count + pending_count + reversed_count + partial_recon_count
//
// checked per row (each row already carries its own currency), which is
// exactly "per currency" since nothing here sums across rows first.

import (
	"context"
	"fmt"
)

// ReconciliationCountRow is one batch_reconciliation_summary row's
// identity and counts.
type ReconciliationCountRow struct {
	BatchContractID   string
	Currency          string
	TotalCount        int
	SuccessCount      int
	FailedCount       int
	PendingCount      int
	ReversedCount     int
	PartialReconCount int
}

// checkReconciliationCounts reports whether row.TotalCount equals the sum
// of its five sub-counts. ok=false means total_count has silently drifted
// from its own components — the exact class of bug the ticket's acceptance
// test is meant to catch. Mirrors checkRatioMetric's (expected, stored)
// shape from metric_registry.go for a consistent violation-reporting style.
func checkReconciliationCounts(row ReconciliationCountRow) (ok bool, expected, stored int) {
	expected = row.SuccessCount + row.FailedCount + row.PendingCount + row.ReversedCount + row.PartialReconCount
	stored = row.TotalCount
	return expected == stored, expected, stored
}

// ReconciliationViolation names one batch_reconciliation_summary row whose
// total_count doesn't reconcile to its own sub-counts.
type ReconciliationViolation struct {
	BatchContractID string
	Currency        string
	Expected        int
	Stored          int
}

// FindReconciliationViolations queries every batch_reconciliation_summary
// row for tenantID and returns one ReconciliationViolation per row that
// fails checkReconciliationCounts. Unlike FindConsistencyViolations
// (consistency_check.go), this never sums across rows — each row is
// already the authoritative per-batch, per-currency record, so per-row
// self-consistency IS the per-currency check the ticket asks for.
func (r *BatchContractRepo) FindReconciliationViolations(ctx context.Context, tenantID string) ([]ReconciliationViolation, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT batch_contract_id, currency, total_count, success_count, failed_count, pending_count, reversed_count, partial_recon_count
		FROM batch_reconciliation_summary
		WHERE tenant_id = $1
	`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("reconciliation_invariant.FindReconciliationViolations tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var out []ReconciliationViolation
	for rows.Next() {
		var row ReconciliationCountRow
		if err := rows.Scan(
			&row.BatchContractID, &row.Currency, &row.TotalCount,
			&row.SuccessCount, &row.FailedCount, &row.PendingCount,
			&row.ReversedCount, &row.PartialReconCount,
		); err != nil {
			return nil, fmt.Errorf("reconciliation_invariant.FindReconciliationViolations scan tenant=%s: %w", tenantID, err)
		}
		if ok, expected, stored := checkReconciliationCounts(row); !ok {
			out = append(out, ReconciliationViolation{
				BatchContractID: row.BatchContractID,
				Currency:        row.Currency,
				Expected:        expected,
				Stored:          stored,
			})
		}
	}
	return out, rows.Err()
}
