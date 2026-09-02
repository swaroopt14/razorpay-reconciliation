package observe

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/models"
)

func capturedEnvelope(t *testing.T) Envelope {
	t.Helper()
	created := time.Unix(1725000000, 0).UTC()
	return Envelope{
		EventName:          EventObservationReceived,
		SchemaVersion:      "v1",
		TenantID:           "11111111-1111-1111-1111-111111111111",
		ConnectorID:        "22222222-2222-2222-2222-222222222222",
		Provider:           "razorpay",
		ProviderMode:       "test",
		ProviderEventID:    "evt_1",
		ProviderEventType:  "payment.captured",
		ProviderEntityType: "payment",
		ProviderEntityID:   "pay_test_123",
		ReceiptID:          "33333333-3333-3333-3333-333333333333",
		RawBodyHash:        "sha256:abc",
		Amount:             50000,
		Currency:           "INR",
		Status:             "captured",
		OrderID:            "order_1",
		Captured:           true,
		ProviderCreatedAt:  &created,
		TraceID:            "trace-1",
	}
}

func TestNormalizePaymentCaptured(t *testing.T) {
	item, ok, err := NormalizePayment(capturedEnvelope(t))
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if item.PaymentID != "pay_test_123" || item.AmountMinor != 50000 || !item.Captured || item.Status != "captured" {
		t.Fatalf("item=%+v", item)
	}
	if item.PayloadHash == "" {
		t.Fatal("missing hash")
	}
}

func TestNormalizeSkipsRefund(t *testing.T) {
	env := capturedEnvelope(t)
	env.ProviderEventType = "refund.created"
	env.ProviderEntityType = "refund"
	env.ProviderEntityID = "rfnd_1"
	_, ok, err := NormalizePayment(env)
	if err != nil || ok {
		t.Fatalf("refund should skip ok=%v err=%v", ok, err)
	}
}

func TestApplyInsertsObservationAndOutbox(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	res, err := p.Apply(context.Background(), capturedEnvelope(t))
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultInserted {
		t.Fatalf("kind=%s", res.Kind)
	}
	if len(store.Payments) != 1 {
		t.Fatalf("payments=%d", len(store.Payments))
	}
	if len(store.Outbox) != 1 {
		t.Fatalf("outbox=%d", len(store.Outbox))
	}
	if store.Outbox[0].EventType != models.EventTypePaymentObservationNormalizedV1 {
		t.Fatalf("event=%s", store.Outbox[0].EventType)
	}
	var payload map[string]any
	if err := json.Unmarshal(store.Outbox[0].Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["source"] != SourceWebhook {
		t.Fatalf("source=%v", payload["source"])
	}
	if payload["status"] != "captured" {
		t.Fatalf("status=%v", payload["status"])
	}
}

func TestApplyDuplicateDoesNotSecondOutbox(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	env := capturedEnvelope(t)
	if _, err := p.Apply(context.Background(), env); err != nil {
		t.Fatal(err)
	}
	res, err := p.Apply(context.Background(), env)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultDuplicate {
		t.Fatalf("kind=%s", res.Kind)
	}
	if len(store.Outbox) != 1 {
		t.Fatalf("outbox=%d", len(store.Outbox))
	}
}

func TestApplyAuthorizedThenCapturedUpdates(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	env := capturedEnvelope(t)
	env.ProviderEventType = "payment.authorized"
	env.Status = "authorized"
	env.Captured = false
	env.ProviderEventID = "evt_auth"
	if _, err := p.Apply(context.Background(), env); err != nil {
		t.Fatal(err)
	}
	env.ProviderEventType = "payment.captured"
	env.Status = "captured"
	env.Captured = true
	env.ProviderEventID = "evt_cap"
	res, err := p.Apply(context.Background(), env)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultUpdated {
		t.Fatalf("kind=%s", res.Kind)
	}
	var got string
	for _, obs := range store.Payments {
		got = obs.Item.Status
		if !obs.Item.Captured {
			t.Fatal("expected captured")
		}
		if obs.Source != SourceWebhook {
			t.Fatalf("source=%s", obs.Source)
		}
	}
	if got != "captured" {
		t.Fatalf("status=%s", got)
	}
	if len(store.Outbox) != 2 {
		t.Fatalf("outbox=%d", len(store.Outbox))
	}
}

func TestApplyFailedIsNotBankCredited(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	env := capturedEnvelope(t)
	env.ProviderEventType = "payment.failed"
	env.Status = "failed"
	env.Captured = false
	res, err := p.Apply(context.Background(), env)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultInserted {
		t.Fatalf("kind=%s", res.Kind)
	}
	for _, obs := range store.Payments {
		if obs.Item.Status != "failed" || obs.Item.Captured {
			t.Fatalf("item=%+v", obs.Item)
		}
	}
}

func TestApplySkipsRefundEvent(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	env := capturedEnvelope(t)
	env.ProviderEventType = "refund.created"
	env.ProviderEntityType = "refund"
	env.ProviderEntityID = "rfnd_1"
	res, err := p.Apply(context.Background(), env)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultSkipped {
		t.Fatalf("kind=%s", res.Kind)
	}
	if len(store.Payments) != 0 || len(store.Outbox) != 0 {
		t.Fatal("refund should not persist payment observation")
	}
}

func TestApplyBytesIgnoresOtherEvents(t *testing.T) {
	store := poll.NewMemoryStore()
	p := NewProcessor(store)
	res, err := p.ApplyBytes(context.Background(), []byte(`{"event_type":"intent.created.v1"}`))
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != ResultIgnored {
		t.Fatalf("kind=%s", res.Kind)
	}
}

func TestApplyBytesMalformedIgnored(t *testing.T) {
	p := NewProcessor(poll.NewMemoryStore())
	res, err := p.ApplyBytes(context.Background(), []byte(`not-json`))
	if err != nil || res.Kind != ResultIgnored {
		t.Fatalf("kind=%s err=%v", res.Kind, err)
	}
}

func TestApplyRequiresTenant(t *testing.T) {
	p := NewProcessor(poll.NewMemoryStore())
	env := capturedEnvelope(t)
	env.TenantID = ""
	if _, err := p.Apply(context.Background(), env); err == nil {
		t.Fatal("expected error")
	}
}
