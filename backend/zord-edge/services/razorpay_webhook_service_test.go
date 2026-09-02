package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"zord-edge/validator"

	"github.com/google/uuid"
)

const testWebhookSecret = "whsec_test_razorpay"

func loadRazorpayFixture(t *testing.T, name string) []byte {
	t.Helper()
	p := filepath.Join("..", "testdata", "razorpay", name)
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return raw
}

func signedRequest(t *testing.T, store *MemoryWebhookStore, body []byte, eventID string, connector, tenant uuid.UUID) (WebhookRequest, *RazorpayWebhookService) {
	t.Helper()
	svc := NewRazorpayWebhookServiceWithStore(store)
	return WebhookRequest{
		TenantID:      tenant,
		ConnectorID:   connector,
		Provider:      "razorpay",
		ProviderMode:  "test",
		RawBody:       body,
		EventID:       eventID,
		Signature:     validator.SignRazorpayWebhook(body, testWebhookSecret),
		WebhookSecret: testWebhookSecret,
		TraceID:       "trace-test",
	}, svc
}

func TestReceive_ValidWebhookPersistsReceipt(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	tenant := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, body, "evt_persist", connector, tenant)

	result, status, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if status != 200 {
		t.Fatalf("status=%d", status)
	}
	if result.Duplicate || result.Conflict || !result.Published {
		t.Fatalf("result=%+v", result)
	}
	rec, ok := store.Receipt(connector, "evt_persist")
	if !ok {
		t.Fatal("receipt not stored")
	}
	if rec.TenantID != tenant {
		t.Fatalf("tenant=%s", rec.TenantID)
	}
	if rec.BodyHash != HashWebhookBody(body) {
		t.Fatalf("hash=%s", rec.BodyHash)
	}
}

func TestReceive_ValidWebhookCreatesOutbox(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "payment_authorized.json")
	req, svc := signedRequest(t, store, body, "evt_outbox", connector, uuid.Must(uuid.NewV7()))

	if _, _, err := svc.Receive(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
	if store.Outbox[0].EventType != "payment.authorized" {
		t.Fatalf("event_type=%s", store.Outbox[0].EventType)
	}
}

func TestReceive_DuplicateEventDoesNotCreateSecondOutbox(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	tenant := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, body, "evt_dup", connector, tenant)

	first, _, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	second, status, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if status != 200 || !second.Duplicate {
		t.Fatalf("second=%+v status=%d", second, status)
	}
	if second.ReceiptID != first.ReceiptID {
		t.Fatalf("receipt id changed: %s vs %s", first.ReceiptID, second.ReceiptID)
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
}

func TestReceive_DuplicateEventIncrementsDeliveryCount(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "payment_failed.json")
	req, svc := signedRequest(t, store, body, "evt_count", connector, uuid.Must(uuid.NewV7()))

	if _, _, err := svc.Receive(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	second, _, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if second.DeliveryCount != 2 {
		t.Fatalf("delivery_count=%d", second.DeliveryCount)
	}
}

func TestReceive_InvalidSignatureDoesNotPersist(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, body, "evt_bad_sig", connector, uuid.Must(uuid.NewV7()))
	req.Signature = "aa"

	_, status, err := svc.Receive(context.Background(), req)
	if err == nil || status != 401 {
		t.Fatalf("status=%d err=%v", status, err)
	}
	if store.ReceiptCount() != 0 || store.OutboxCount() != 0 {
		t.Fatal("invalid signature persisted")
	}
}

func TestReceive_MalformedPayloadDoesNotPersist(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	body := loadRazorpayFixture(t, "malformed.json")
	req, svc := signedRequest(t, store, body, "evt_malformed", connector, uuid.Must(uuid.NewV7()))

	_, status, err := svc.Receive(context.Background(), req)
	if err == nil || status != 400 {
		t.Fatalf("status=%d err=%v", status, err)
	}
	if store.ReceiptCount() != 0 || store.OutboxCount() != 0 {
		t.Fatal("malformed payload persisted")
	}
}

func TestReceive_PayloadConflictDoesNotCreateSecondOutbox(t *testing.T) {
	store := NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	tenant := uuid.Must(uuid.NewV7())
	firstBody := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, firstBody, "evt_conflict", connector, tenant)
	first, _, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}

	secondBody := loadRazorpayFixture(t, "payment_failed.json")
	req.RawBody = secondBody
	req.Signature = validator.SignRazorpayWebhook(secondBody, testWebhookSecret)
	second, status, err := svc.Receive(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if status != 200 || !second.Conflict {
		t.Fatalf("second=%+v status=%d", second, status)
	}
	if second.ReceiptID != first.ReceiptID {
		t.Fatalf("conflict must keep stored receipt id")
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
	rec, _ := store.Receipt(connector, "evt_conflict")
	if rec.BodyHash != HashWebhookBody(firstBody) {
		t.Fatal("stored hash overwritten")
	}
	if rec.DeliveryCount != 1 {
		t.Fatalf("delivery_count=%d", rec.DeliveryCount)
	}
}

func TestReceive_TenantIsolation(t *testing.T) {
	store := NewMemoryWebhookStore()
	svc := NewRazorpayWebhookServiceWithStore(store)
	body := loadRazorpayFixture(t, "payment_captured.json")
	connA := uuid.Must(uuid.NewV7())
	connB := uuid.Must(uuid.NewV7())
	tenantA := uuid.Must(uuid.NewV7())
	tenantB := uuid.Must(uuid.NewV7())

	reqA, _ := signedRequest(t, store, body, "evt_shared", connA, tenantA)
	if _, _, err := svc.Receive(context.Background(), reqA); err != nil {
		t.Fatal(err)
	}
	reqB, _ := signedRequest(t, store, body, "evt_shared", connB, tenantB)
	if _, _, err := svc.Receive(context.Background(), reqB); err != nil {
		t.Fatal(err)
	}

	a, _ := store.Receipt(connA, "evt_shared")
	b, _ := store.Receipt(connB, "evt_shared")
	if a.TenantID != tenantA || b.TenantID != tenantB {
		t.Fatalf("tenants mixed: %s %s", a.TenantID, b.TenantID)
	}
	if store.OutboxCount() != 2 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
}

func TestReceive_DBFailureDoesNotPublishEvent(t *testing.T) {
	store := NewMemoryWebhookStore()
	store.FailPersist = true
	body := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, body, "evt_db", uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))

	_, status, err := svc.Receive(context.Background(), req)
	if err == nil || status != 500 {
		t.Fatalf("status=%d err=%v", status, err)
	}
	if store.OutboxCount() != 0 || store.ReceiptCount() != 0 {
		t.Fatal("persist failure published")
	}
}

func TestReceive_OutboxFailureRollsBackReceipt(t *testing.T) {
	store := NewMemoryWebhookStore()
	store.FailOutbox = true
	body := loadRazorpayFixture(t, "payment_captured.json")
	req, svc := signedRequest(t, store, body, "evt_outbox_fail", uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))

	_, status, err := svc.Receive(context.Background(), req)
	if err == nil || status != 500 {
		t.Fatalf("status=%d err=%v", status, err)
	}
	if store.ReceiptCount() != 0 || store.OutboxCount() != 0 {
		t.Fatal("outbox failure left a receipt")
	}
}

func TestReceive_RawBodyHashIsStable(t *testing.T) {
	body := loadRazorpayFixture(t, "payment_captured.json")
	if HashWebhookBody(body) != HashWebhookBody(body) {
		t.Fatal("hash not stable")
	}
	if HashWebhookBody(body) == HashWebhookBody(append([]byte{}, append(body, ' ')...)) {
		t.Fatal("hash ignored extra bytes")
	}
}

func TestReceive_UnknownEventTypeStillPersists(t *testing.T) {
	store := NewMemoryWebhookStore()
	body := []byte(`{"entity":"event","event":"order.paid","payload":{}}`)
	req, svc := signedRequest(t, store, body, "evt_unknown", uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))
	result, status, err := svc.Receive(context.Background(), req)
	if err != nil || status != 200 || !result.Published {
		t.Fatalf("status=%d err=%v result=%+v", status, err, result)
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
}

func TestReceive_VerifyBeforeParse(t *testing.T) {
	store := NewMemoryWebhookStore()
	body := loadRazorpayFixture(t, "malformed.json")
	req, svc := signedRequest(t, store, body, "evt_order", uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))
	req.Signature = "deadbeef"

	_, status, err := svc.Receive(context.Background(), req)
	if err == nil || status != 401 {
		t.Fatalf("unsigned malformed should be 401, got %d %v", status, err)
	}
}

var _ webhookObservationStore = (*MemoryWebhookStore)(nil)
