package recon

import "testing"

func TestCashPositionSeparatesProvenBankFromInFlight(t *testing.T) {
	results := []FinancialResult{
		{EntityType: EntityPayment, EntityID: "pay_a", ExpectedAmount: 10000, Result: ResultMatched, ObservedAmount: 9728, BankCreditProven: true},
		{EntityType: EntityPayment, EntityID: "pay_b", ExpectedAmount: 5000, Result: ResultMatched, ObservedAmount: 0, BankCreditProven: false},
	}
	lines := []SettlementLine{
		{PaymentID: "pay_a", LineType: "payment", CreditMinor: 9728},
		{PaymentID: "pay_b", LineType: "payment", CreditMinor: 4900},
	}
	exceptions := []ReconciliationException{{VarianceAmount: 1000}}
	snap := CashPosition(results, lines, exceptions)
	if snap.GrossCapturedMinor != 15000 {
		t.Fatalf("gross=%d", snap.GrossCapturedMinor)
	}
	if snap.SettlementExpectedNetMinor != 14628 {
		t.Fatalf("settlement=%d", snap.SettlementExpectedNetMinor)
	}
	if snap.BankCreditedProvenMinor != 9728 {
		t.Fatalf("bank=%d", snap.BankCreditedProvenMinor)
	}
	if snap.InFlightMinor != 4900 {
		t.Fatalf("in_flight=%d", snap.InFlightMinor)
	}
	if snap.UnresolvedExposureMinor != 1000 {
		t.Fatalf("exposure=%d", snap.UnresolvedExposureMinor)
	}
}
