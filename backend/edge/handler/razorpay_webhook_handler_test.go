package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/validator"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const handlerWebhookSecret = "whsec_test_razorpay"

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

func loadHandlerFixture(t *testing.T, name string) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "testdata", "razorpay", name))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func webhookHandler(t *testing.T, store *services.MemoryWebhookStore, connector, tenant uuid.UUID) *Handler {
	t.Helper()
	svc := services.NewRazorpayWebhookServiceWithStore(store)
	return &Handler{
		ReceiveRazorpayWebhook: svc.Receive,
		LookupRazorpayConnector: func(id uuid.UUID) (uuid.UUID, string, string, error) {
			if id != connector {
				return uuid.Nil, "", "", sql.ErrNoRows
			}
			return tenant, "test", handlerWebhookSecret, nil
		},
	}
}

func postWebhook(h *Handler, connector uuid.UUID, eventID, signature string, body []byte) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/v1/webhooks/razorpay/:connectorID", h.HandleRazorpayWebhook)
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/razorpay/"+connector.String(), bytes.NewReader(body))
	if eventID != "" {
		req.Header.Set("x-razorpay-event-id", eventID)
	}
	if signature != "" {
		req.Header.Set("X-Razorpay-Signature", signature)
	}
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHandleRazorpayWebhook_Valid(t *testing.T) {
	store := services.NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	tenant := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, store, connector, tenant)
	body := loadHandlerFixture(t, "payment_captured.json")
	sig := validator.SignRazorpayWebhook(body, handlerWebhookSecret)

	w := postWebhook(h, connector, "evt_http_ok", sig, body)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["status"] != "accepted" {
		t.Fatalf("status=%v", resp["status"])
	}
	if resp["receipt_id"] == nil || resp["trace_id"] == nil {
		t.Fatalf("resp=%v", resp)
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
}

func TestHandleRazorpayWebhook_InvalidSignature(t *testing.T) {
	store := services.NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, store, connector, uuid.Must(uuid.NewV7()))
	body := loadHandlerFixture(t, "payment_captured.json")

	w := postWebhook(h, connector, "evt_http_sig", "ab", body)
	if w.Code != 401 {
		t.Fatalf("code=%d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "INVALID_WEBHOOK_SIGNATURE") {
		t.Fatalf("body=%s", w.Body.String())
	}
	if store.ReceiptCount() != 0 {
		t.Fatal("persisted")
	}
}

func TestHandleRazorpayWebhook_MissingSignature(t *testing.T) {
	h := webhookHandler(t, services.NewMemoryWebhookStore(), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))
	w := postWebhook(h, uuid.Must(uuid.NewV7()), "evt_1", "", []byte(`{}`))
	if w.Code != 400 {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestHandleRazorpayWebhook_MissingEventID(t *testing.T) {
	h := webhookHandler(t, services.NewMemoryWebhookStore(), uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()))
	connector := uuid.Must(uuid.NewV7())
	w := postWebhook(h, connector, "", "sig", []byte(`{}`))
	if w.Code != 400 {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestHandleRazorpayWebhook_MalformedJSON(t *testing.T) {
	store := services.NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, store, connector, uuid.Must(uuid.NewV7()))
	body := loadHandlerFixture(t, "malformed.json")
	sig := validator.SignRazorpayWebhook(body, handlerWebhookSecret)

	w := postWebhook(h, connector, "evt_malformed", sig, body)
	if w.Code != 400 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "INVALID_WEBHOOK_PAYLOAD") {
		t.Fatalf("body=%s", w.Body.String())
	}
	if store.ReceiptCount() != 0 {
		t.Fatal("persisted")
	}
}

func TestHandleRazorpayWebhook_TooLarge(t *testing.T) {
	connector := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, services.NewMemoryWebhookStore(), connector, uuid.Must(uuid.NewV7()))
	body := bytes.Repeat([]byte("a"), (1<<20)+2)
	w := postWebhook(h, connector, "evt_big", "ab", body)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestHandleRazorpayWebhook_Duplicate(t *testing.T) {
	store := services.NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, store, connector, uuid.Must(uuid.NewV7()))
	body := loadHandlerFixture(t, "payment_captured.json")
	sig := validator.SignRazorpayWebhook(body, handlerWebhookSecret)

	first := postWebhook(h, connector, "evt_dup_http", sig, body)
	second := postWebhook(h, connector, "evt_dup_http", sig, body)
	if first.Code != 200 || second.Code != 200 {
		t.Fatalf("codes %d %d", first.Code, second.Code)
	}
	var a, b map[string]any
	_ = json.Unmarshal(first.Body.Bytes(), &a)
	_ = json.Unmarshal(second.Body.Bytes(), &b)
	if a["receipt_id"] != b["receipt_id"] {
		t.Fatalf("receipt ids %v %v", a["receipt_id"], b["receipt_id"])
	}
	if b["status"] != "duplicate" {
		t.Fatalf("status=%v", b["status"])
	}
	if store.OutboxCount() != 1 {
		t.Fatalf("outbox=%d", store.OutboxCount())
	}
}

func TestHandleRazorpayWebhook_UnknownConnector(t *testing.T) {
	known := uuid.Must(uuid.NewV7())
	h := webhookHandler(t, services.NewMemoryWebhookStore(), known, uuid.Must(uuid.NewV7()))
	other := uuid.Must(uuid.NewV7())
	body := loadHandlerFixture(t, "payment_captured.json")
	sig := validator.SignRazorpayWebhook(body, handlerWebhookSecret)
	w := postWebhook(h, other, "evt_unknown", sig, body)
	if w.Code != 404 {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestHandleRazorpayWebhook_TenantIsolation(t *testing.T) {
	store := services.NewMemoryWebhookStore()
	connector := uuid.Must(uuid.NewV7())
	tenant := uuid.Must(uuid.NewV7())
	var seenTenant uuid.UUID
	svc := services.NewRazorpayWebhookServiceWithStore(store)
	h := &Handler{
		ReceiveRazorpayWebhook: func(ctx context.Context, req services.WebhookRequest) (model.ReceiptResult, int, error) {
			seenTenant = req.TenantID
			return svc.Receive(ctx, req)
		},
		LookupRazorpayConnector: func(id uuid.UUID) (uuid.UUID, string, string, error) {
			if id != connector {
				return uuid.Nil, "", "", sql.ErrNoRows
			}
			return tenant, "test", handlerWebhookSecret, nil
		},
	}
	body := loadHandlerFixture(t, "payment_captured.json")
	sig := validator.SignRazorpayWebhook(body, handlerWebhookSecret)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/v1/webhooks/razorpay/:connectorID", h.HandleRazorpayWebhook)
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/razorpay/"+connector.String(), bytes.NewReader(body))
	req.Header.Set("x-razorpay-event-id", "evt_tenant")
	req.Header.Set("X-Razorpay-Signature", sig)
	req.Header.Set("X-Tenant-Id", uuid.Must(uuid.NewV7()).String())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("code=%d", w.Code)
	}
	if seenTenant != tenant {
		t.Fatalf("tenant spoofed: got %s want %s", seenTenant, tenant)
	}
}

func TestHandleRazorpayWebhook_DBFailure(t *testing.T) {
	connector := uuid.Must(uuid.NewV7())
	h := &Handler{
		ReceiveRazorpayWebhook: func(ctx context.Context, req services.WebhookRequest) (model.ReceiptResult, int, error) {
			return model.ReceiptResult{}, 500, services.ErrWebhookPersist
		},
		LookupRazorpayConnector: func(id uuid.UUID) (uuid.UUID, string, string, error) {
			return uuid.Must(uuid.NewV7()), "test", handlerWebhookSecret, nil
		},
	}
	body := loadHandlerFixture(t, "payment_captured.json")
	w := postWebhook(h, connector, "evt_db", validator.SignRazorpayWebhook(body, handlerWebhookSecret), body)
	if w.Code != 500 {
		t.Fatalf("code=%d", w.Code)
	}
	if strings.Contains(w.Body.String(), "webhook receipt persist") {
		t.Fatalf("leaked internal error: %s", w.Body.String())
	}
}
