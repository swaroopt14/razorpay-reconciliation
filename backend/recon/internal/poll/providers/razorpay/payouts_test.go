package razorpay

import "testing"

func TestNormalizePayoutStatusExactNames(t *testing.T) {
	cases := []string{
		PayoutPending, PayoutScheduled, PayoutQueued, PayoutProcessing,
		PayoutProcessed, PayoutReversed, PayoutCancelled, PayoutRejected, PayoutFailed,
	}
	for _, s := range cases {
		if got := NormalizePayoutStatus(s); got != s {
			t.Fatalf("%s -> %s", s, got)
		}
	}
	if NormalizePayoutStatus("canceled") != PayoutCancelled {
		t.Fatal("canceled should map to cancelled")
	}
	if NormalizePayoutStatus("PROCESSED") != PayoutProcessed {
		t.Fatal("case fold")
	}
}

func TestPayoutRankDoesNotRegressProcessed(t *testing.T) {
	if PayoutRank(PayoutProcessing) >= PayoutRank(PayoutProcessed) {
		t.Fatal("processing must rank below processed")
	}
	if PayoutRank(PayoutFailed) >= PayoutRank(PayoutProcessed) {
		t.Fatal("failed must not outrank processed")
	}
}

func TestNeutralFromPayoutKeepsProviderStatus(t *testing.T) {
	item := NeutralFromPayout(PayoutResponse{
		ID: "pout_1", Amount: 25000000, Currency: "INR", Status: "processing", UTR: "UTR9", Mode: "IMPS",
	})
	if item.Status != PayoutProcessing || item.PayoutID != "pout_1" || item.AmountMinor != 25000000 {
		t.Fatalf("%+v", item)
	}
	if item.PayloadHash == "" {
		t.Fatal("missing hash")
	}
}
