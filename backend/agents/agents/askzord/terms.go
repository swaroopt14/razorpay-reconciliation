package askzord

import "strings"

func FinancialState(status, result, reason string, bankProven bool) string {
	st := strings.ToLower(status)
	res := strings.ToUpper(result)
	switch {
	case reason == "failed_with_bank_movement" || reason == "payout_failed_with_bank_movement":
		return "MONEY_MOVEMENT_UNACCOUNTED"
	case res == "MATCHED" && (st == "failed" || st == "cancelled" || st == "rejected"):
		return "ACCOUNTED_NO_MOVEMENT"
	case st == "settled" && !bankProven:
		return "SETTLED_BANK_UNPROVEN"
	case res == "AMBIGUOUS":
		return "AMBIGUOUS_CANDIDATES"
	case res == "MATCHED" && bankProven:
		return "BANK_CREDIT_PROVEN"
	default:
		if res != "" {
			return "RECONCILED_" + res
		}
		return ""
	}
}
