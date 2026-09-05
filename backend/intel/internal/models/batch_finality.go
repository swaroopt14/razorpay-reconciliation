package models

import "strings"

// Canonical batch_contracts.batch_finality_status values (see db/init.sql).
const (
	BatchFinalityProcessing          = "PROCESSING"
	BatchFinalityFullyReconciled     = "FULLY_RECONCILED"
	BatchFinalityPartiallyReconciled = "PARTIALLY_RECONCILED"
	BatchFinalityFailed              = "FAILED"
	BatchFinalityRequiresReview      = "REQUIRES_REVIEW"
	BatchFinalityClosed              = "CLOSED"
)

// NormalizeBatchFinalityStatus maps legacy settlement vocabulary and aliases to the
// canonical reconciliation values persisted in batch_contracts.
func NormalizeBatchFinalityStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "", "PENDING", "OPEN":
		return BatchFinalityProcessing
	case "FULLY_SETTLED", "SETTLED", BatchFinalityFullyReconciled:
		return BatchFinalityFullyReconciled
	case "PARTIALLY_SETTLED", BatchFinalityPartiallyReconciled:
		return BatchFinalityPartiallyReconciled
	case BatchFinalityFailed, "CANCELLED":
		return BatchFinalityFailed
	case BatchFinalityRequiresReview:
		return BatchFinalityRequiresReview
	case BatchFinalityClosed:
		return BatchFinalityClosed
	case BatchFinalityProcessing:
		return BatchFinalityProcessing
	default:
		return BatchFinalityProcessing
	}
}

// IsTerminalBatchFinalityStatus reports whether a batch has left the in-flight
// processing state. Accepts both legacy SETTLED and canonical RECONCILED labels.
func IsTerminalBatchFinalityStatus(status string) bool {
	switch NormalizeBatchFinalityStatus(status) {
	case BatchFinalityFullyReconciled, BatchFinalityPartiallyReconciled,
		BatchFinalityFailed, BatchFinalityRequiresReview, BatchFinalityClosed:
		return true
	default:
		return false
	}
}

// BatchFinalityStatusForQuery maps API / filter aliases to the stored value.
func BatchFinalityStatusForQuery(filter string) string {
	switch strings.ToUpper(strings.TrimSpace(filter)) {
	case "SETTLED", "FULLY_SETTLED":
		return BatchFinalityFullyReconciled
	case "PARTIALLY_SETTLED":
		return BatchFinalityPartiallyReconciled
	case "PENDING":
		return BatchFinalityProcessing
	default:
		return NormalizeBatchFinalityStatus(filter)
	}
}
