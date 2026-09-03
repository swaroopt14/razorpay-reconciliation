package investigate

import (
	"strings"

	"zord-prompt-layer/tools"
)

func BuildPlan(entityType, reason string) []string {
	reason = strings.ToLower(strings.TrimSpace(reason))
	if strings.EqualFold(entityType, "payout") {
		return []string{
			tools.GetPayout,
			tools.GetPayoutEvents,
			tools.GetSLAPolicy,
			tools.SearchBankTxns,
			tools.GetException,
			tools.GetEvidence,
			tools.GetLedgerEntry,
			tools.GetCalculationTrace,
			tools.VerifyEvidenceTool,
		}
	}
	switch reason {
	case "amount_mismatch":
		return []string{
			tools.GetPayment,
			tools.GetPaymentEvents,
			tools.SearchSettlements,
			tools.SearchBankTxns,
			tools.GetCalculationTrace,
			tools.GetException,
			tools.GetEvidence,
			tools.GetLedgerEntry,
			tools.VerifyEvidenceTool,
		}
	case "captured_missing_settlement":
		return []string{
			tools.GetPayment,
			tools.GetPaymentEvents,
			tools.SearchSettlements,
			tools.SearchBankTxns,
			tools.GetRefund,
			tools.GetException,
			tools.GetEvidence,
			tools.GetLedgerEntry,
			tools.VerifyEvidenceTool,
		}
	default:
		return []string{
			tools.GetPayment,
			tools.GetPaymentEvents,
			tools.SearchSettlements,
			tools.SearchBankTxns,
			tools.GetRefund,
			tools.GetLedgerEntry,
			tools.GetReconciliation,
			tools.GetException,
			tools.GetEvidence,
			tools.VerifyEvidenceTool,
		}
	}
}

func ClassifyReason(reason, entityType string) string {
	switch strings.ToLower(strings.TrimSpace(reason)) {
	case "failed_with_bank_movement":
		return ClassFailedMovement
	case "payout_failed_with_bank_movement":
		return ClassPayoutFailedMove
	case "captured_missing_settlement":
		return ClassMissingSettlement
	case "settlement_without_bank", "orphan_bank_credit":
		return ClassBankMismatch
	case "payout_missing_bank":
		return ClassPayoutMissingBank
	case "amount_mismatch":
		return ClassAmountVariance
	case "ambiguous_bank_candidates", "shared_utr_or_bank_candidates":
		return ClassAmbiguousBank
	case "payout_open_past_sla":
		return ClassPayoutOpenSLA
	case "open_status_no_downstream", "payout_reversed_unexplained":
		return ClassProviderConflict
	default:
		if strings.EqualFold(entityType, "payout") {
			return ClassUnknown
		}
		return ClassUnknown
	}
}

func Recommend(reason string) string {
	switch strings.ToLower(strings.TrimSpace(reason)) {
	case "failed_with_bank_movement":
		return "REQUEST_REVIEW"
	case "payout_failed_with_bank_movement", "payout_reversed_unexplained":
		return "ESCALATE"
	case "payout_missing_bank", "payout_open_past_sla", "open_status_no_downstream", "captured_missing_settlement", "settlement_without_bank":
		return "MONITOR"
	case "amount_mismatch", "ambiguous_bank_candidates", "shared_utr_or_bank_candidates", "orphan_bank_credit":
		return "REQUEST_REVIEW"
	default:
		return "REQUEST_REVIEW"
	}
}

func isMatchedReason(result, reason string) bool {
	if strings.EqualFold(result, "MATCHED") {
		return true
	}
	switch strings.ToLower(reason) {
	case "failed_no_money_movement", "failed_no_movement":
		return true
	}
	return false
}
