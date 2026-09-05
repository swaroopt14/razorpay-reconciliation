package payouttruth

import (
	"testing"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

func payoutObs(status string) Observation {
	return Observation{
		TenantID: "t1", ConnectorID: "c1", Provider: "razorpay",
		PayoutID: "pout_ABC", ProviderStatus: status, AmountMinor: 100,
		Currency: "INR", Source: "webhook", ObservedAt: time.Unix(1725000000, 0).UTC(),
	}
}

func TestReduceLateProcessingDoesNotOverwriteProcessed(t *testing.T) {
	cur := Reduce(CanonicalPayout{}, payoutObs(razorpay.PayoutProcessed))
	got := Reduce(cur, payoutObs(razorpay.PayoutProcessing))
	if got.ProviderStatus != razorpay.PayoutProcessed {
		t.Fatalf("status=%s", got.ProviderStatus)
	}
}

func TestReduceFailedDoesNotOverwriteProcessed(t *testing.T) {
	cur := Reduce(CanonicalPayout{}, payoutObs(razorpay.PayoutProcessed))
	got := Reduce(cur, payoutObs(razorpay.PayoutFailed))
	if got.ProviderStatus != razorpay.PayoutProcessed {
		t.Fatalf("status=%s", got.ProviderStatus)
	}
}

func TestReduceQueuedThenProcessed(t *testing.T) {
	cur := Reduce(CanonicalPayout{}, payoutObs(razorpay.PayoutQueued))
	got := Reduce(cur, payoutObs(razorpay.PayoutProcessed))
	if got.ProviderStatus != razorpay.PayoutProcessed {
		t.Fatalf("status=%s", got.ProviderStatus)
	}
}

func TestReduceKeepsExactFailed(t *testing.T) {
	got := Reduce(CanonicalPayout{}, payoutObs(razorpay.PayoutFailed))
	if got.ProviderStatus != razorpay.PayoutFailed {
		t.Fatalf("status=%s", got.ProviderStatus)
	}
}
