package askzord

import "testing"

func TestRejectNumericHallucination(t *testing.T) {
	ctx := FinanceContext{
		Facts: []Fact{{Field: "exposure_minor", Value: int64(10000), Currency: "INR"}},
	}
	if !RejectRewrite("Exposure is 10500 INR", ctx) {
		t.Fatal("expected reject")
	}
	if RejectRewrite("Exposure is 10000 INR", ctx) {
		t.Fatal("expected accept")
	}
}

func TestRejectSettledAsBankCredit(t *testing.T) {
	ctx := FinanceContext{
		Facts: []Fact{{Field: "provider_status", Value: "settled"}, {Field: "reconciliation_result", Value: "UNRESOLVED"}},
	}
	if !RejectRewrite("Funds have reached the bank.", ctx) {
		t.Fatal("expected reject")
	}
	ok := "Razorpay reports the settlement as settled; no corresponding bank credit has been found."
	if RejectRewrite(ok, ctx) {
		t.Fatal(ok)
	}
}

func TestRejectMatchedAsFullyReconciled(t *testing.T) {
	ctx := FinanceContext{
		Facts: []Fact{{Field: "reconciliation_result", Value: "MATCHED"}},
	}
	if !RejectRewrite("The payment is fully reconciled.", ctx) {
		t.Fatal("expected reject")
	}
}

func TestRejectStuckRename(t *testing.T) {
	ctx := FinanceContext{Facts: []Fact{{Field: "provider_status", Value: "failed"}}}
	if !RejectRewrite("The payout is stuck.", ctx) {
		t.Fatal("expected reject")
	}
}

func TestRejectFabricatedEvidenceID(t *testing.T) {
	ctx := FinanceContext{Evidence: []string{"ev_real"}}
	if !RejectRewrite("See [Evidence: ev_invented]", ctx) {
		t.Fatal("expected reject")
	}
}
