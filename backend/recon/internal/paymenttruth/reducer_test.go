package paymenttruth

import (
	"testing"
	"time"

	"zord-outcome-engine/internal/recon"
)

func obs(status string) Observation {
	return Observation{
		TenantID:        "t1",
		ConnectorID:     "c1",
		Provider:        "razorpay",
		PaymentID:       "pay_ABC",
		CanonicalStatus: status,
		ProviderStatus:  status,
		AmountMinor:     100,
		Currency:        "INR",
		Captured:        status == recon.PaymentCaptured,
		Source:          "webhook",
		ObservedAt:      time.Unix(1725000000, 0).UTC(),
	}
}

func TestReduceAuthorizedThenCaptured(t *testing.T) {
	cur := ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentAuthorized))
	got := ReducePaymentState(cur, obs(recon.PaymentCaptured))
	if got.CanonicalStatus != recon.PaymentCaptured || !got.Captured {
		t.Fatalf("%+v", got)
	}
}

func TestReduceCapturedThenAuthorizedStaysCaptured(t *testing.T) {
	cur := ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentCaptured))
	got := ReducePaymentState(cur, obs(recon.PaymentAuthorized))
	if got.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("status=%s", got.CanonicalStatus)
	}
}

func TestReduceCapturedThenFailedStaysCaptured(t *testing.T) {
	cur := ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentCaptured))
	got := ReducePaymentState(cur, obs(recon.PaymentFailed))
	if got.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("status=%s", got.CanonicalStatus)
	}
}

func TestReduceFailedBeatsAuthorized(t *testing.T) {
	cur := ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentAuthorized))
	got := ReducePaymentState(cur, obs(recon.PaymentFailed))
	if got.CanonicalStatus != recon.PaymentFailed {
		t.Fatalf("status=%s", got.CanonicalStatus)
	}
}

func TestReduceRefundedOnlyFromCaptured(t *testing.T) {
	fromAuth := ReducePaymentState(ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentAuthorized)), obs(recon.PaymentRefunded))
	if fromAuth.CanonicalStatus != recon.PaymentAuthorized {
		t.Fatalf("authorized must not become refunded, got %s", fromAuth.CanonicalStatus)
	}
	fromCap := ReducePaymentState(ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentCaptured)), obs(recon.PaymentRefunded))
	if fromCap.CanonicalStatus != recon.PaymentRefunded {
		t.Fatalf("captured should refund, got %s", fromCap.CanonicalStatus)
	}
}

func TestReduceOrderIndependence(t *testing.T) {
	forward := ReducePaymentState(ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentAuthorized)), obs(recon.PaymentCaptured))
	reverse := ReducePaymentState(ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentCaptured)), obs(recon.PaymentAuthorized))
	if forward.CanonicalStatus != recon.PaymentCaptured || reverse.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("forward=%s reverse=%s", forward.CanonicalStatus, reverse.CanonicalStatus)
	}
}

func TestReduceDoesNotInventCreated(t *testing.T) {
	got := ReducePaymentState(CanonicalPayment{}, obs(recon.PaymentCaptured))
	if got.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("status=%s", got.CanonicalStatus)
	}
}
