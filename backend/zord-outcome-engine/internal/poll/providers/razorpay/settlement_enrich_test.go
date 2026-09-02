package razorpay

import "testing"

func TestPaymentLinkForRules(t *testing.T) {
	if PaymentLinkFor("", 100, 100, true) != PaymentLinkUnlinked {
		t.Fatal("missing payment id")
	}
	if PaymentLinkFor("pay", 100, 100, false) != PaymentLinkUnlinked {
		t.Fatal("not found")
	}
	if PaymentLinkFor("pay", 90, 100, true) != PaymentLinkPartial {
		t.Fatal("partial")
	}
	if PaymentLinkFor("pay", 100, 100, true) != PaymentLinkLinked {
		t.Fatal("linked")
	}
}

func TestEnrichAdjustmentDoesNotChangeFee(t *testing.T) {
	line := NeutralSettlementLine{LineType: "adjustment", CreditMinor: 500, FeeMinor: 10, Settled: true}
	EnrichSettlementLine(&line)
	if line.FeeMinor != 10 {
		t.Fatalf("fee=%d", line.FeeMinor)
	}
	if line.AdjustmentMinor != 500 || line.CanonicalStatus != "adjusted" {
		t.Fatalf("%+v", line)
	}
}
