package recon

import "testing"

func TestAskBankQuestionRequiresBankRow(t *testing.T) {
	sub := ProofSubject{
		PaymentID: "pay_test_001", PaymentState: PaymentCaptured,
		ProviderSettlementState: SettlementSettled, BankCreditState: BankNotFound,
		ReconciliationState: ReconSettlementConfirmedBankPending,
		ProofState: ProofProviderSettlementProvenBankUnproven,
		Message: "provider settlement proven; bank credit unresolved",
	}
	body := ProofJSON(sub, nil)
	ans := GetBankMatchAnswer(body)
	if !containsAll(ans, "not proven") && !containsAll(ans, "No matching") {
		t.Fatalf("must not claim bank credit: %s", ans)
	}
	if containsAll(ans, "fully reconciled") {
		t.Fatal("must not say fully reconciled")
	}
}

func TestAskSettledCitesReconNotBankWhenPending(t *testing.T) {
	sub := ProofSubject{
		PaymentID: "pay_test_001", PaymentState: PaymentCaptured,
		ProviderSettlementState: SettlementSettled, BankCreditState: BankNotFound,
		ReconciliationState: ReconSettlementConfirmedBankPending,
		ProofState: ProofProviderSettlementProvenBankUnproven,
		Message: "bank credit unresolved",
	}
	ans := GetTransactionProofAnswer(ProofJSON(sub, nil))
	if containsAll(ans, "fully reconciled") {
		t.Fatal(ans)
	}
}

func containsAll(s, n string) bool {
	return len(s) >= len(n) && (s == n || len(n) == 0 || (len(s) > 0 && stringIndex(s, n) >= 0))
}

func stringIndex(s, n string) int {
	for i := 0; i+len(n) <= len(s); i++ {
		if s[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}
