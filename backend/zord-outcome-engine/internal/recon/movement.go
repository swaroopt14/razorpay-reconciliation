package recon

import "strings"

func HasBankMovement(banks []BankTxn) bool {
	for _, b := range banks {
		if b.CreditMinor > 0 || b.DebitMinor > 0 {
			return true
		}
	}
	return false
}

func BankMovementMinor(banks []BankTxn) int64 {
	var n int64
	for _, b := range banks {
		if b.CreditMinor > 0 {
			n += b.CreditMinor
			continue
		}
		n += b.DebitMinor
	}
	return n
}

func IsCredit(b BankTxn) bool {
	if strings.EqualFold(b.CreditDebit, "DEBIT") {
		return false
	}
	if strings.EqualFold(b.CreditDebit, "CREDIT") {
		return true
	}
	return b.CreditMinor > 0 && b.DebitMinor == 0
}

func UnusedCreditBanks(banks []BankTxn, used map[string]struct{}) []BankTxn {
	var out []BankTxn
	for _, b := range banks {
		if !IsCredit(b) {
			continue
		}
		if _, ok := used[b.ID]; ok {
			continue
		}
		out = append(out, b)
	}
	return out
}
