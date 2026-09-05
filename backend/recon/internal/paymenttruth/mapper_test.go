package paymenttruth

import (
	"testing"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/internal/recon"
)

func sampleItem(status string, amount int64) razorpay.NeutralPayment {
	return razorpay.NeutralPayment{
		PaymentID:   "pay_ABC",
		OrderID:     "order_1",
		AmountMinor: amount,
		Currency:    "INR",
		Status:      status,
		Captured:    status == recon.PaymentCaptured,
		PayloadHash: "sha256:" + status,
		CreatedAt:   time.Unix(1725000000, 0).UTC(),
	}
}

func TestMapNeutralCaptured(t *testing.T) {
	obs, err := MapNeutral("t1", "c1", "razorpay", "test", "webhook", "evt_1", "33333333-3333-3333-3333-333333333333", sampleItem("captured", 50000), false, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if obs.CanonicalStatus != recon.PaymentCaptured || obs.ProviderStatus != "captured" || !obs.Captured {
		t.Fatalf("%+v", obs)
	}
	if obs.RawReference != "receipt:33333333-3333-3333-3333-333333333333" {
		t.Fatalf("raw_reference=%s", obs.RawReference)
	}
	if obs.IdentityHash == "" {
		t.Fatal("missing identity hash")
	}
}

func TestMapNeutralAuthorizedFailedUnknown(t *testing.T) {
	auth, err := MapNeutral("t1", "c1", "", "test", "api_backfill", "", "", sampleItem("authorized", 100), false, time.Now())
	if err != nil || auth.CanonicalStatus != recon.PaymentAuthorized {
		t.Fatalf("auth=%+v err=%v", auth, err)
	}
	failed, err := MapNeutral("t1", "c1", "", "test", "webhook", "evt_f", "", sampleItem("failed", 100), false, time.Now())
	if err != nil || failed.CanonicalStatus != recon.PaymentFailed {
		t.Fatalf("failed=%+v err=%v", failed, err)
	}
	unknown, err := MapNeutral("t1", "c1", "", "test", "webhook", "evt_u", "", sampleItem("nope", 100), false, time.Now())
	if err != nil || unknown.CanonicalStatus != recon.PaymentUnknown || unknown.ProviderStatus != "nope" {
		t.Fatalf("unknown=%+v err=%v", unknown, err)
	}
}

func TestMapNeutralMissingOrderAndFeeTax(t *testing.T) {
	item := sampleItem("captured", 100)
	item.OrderID = ""
	item.FeeMinor = 200
	item.TaxMinor = 30
	obs, err := MapNeutral("t1", "c1", "razorpay", "test", "api_backfill", "", "r1", item, true, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if obs.OrderID != "" || obs.FeeMinor != 200 || obs.TaxMinor != 30 {
		t.Fatalf("%+v", obs)
	}
}

func TestMapNeutralRejectsNegativeAmount(t *testing.T) {
	_, err := MapNeutral("t1", "c1", "razorpay", "test", "webhook", "evt", "", sampleItem("captured", -1), false, time.Now())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestMapNeutralRequiresPaymentID(t *testing.T) {
	item := sampleItem("captured", 1)
	item.PaymentID = ""
	if _, err := MapNeutral("t1", "c1", "razorpay", "test", "webhook", "evt", "", item, false, time.Now()); err == nil {
		t.Fatal("expected error")
	}
}
