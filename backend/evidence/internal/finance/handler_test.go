package finance

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
)

func testToken(t *testing.T, secret, tenant string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"tenant_id": tenant,
		"role":      "ops",
		"exp":       time.Now().Add(time.Hour).Unix(),
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestHandlerTenantIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := NewService(NewMemoryStore())
	ev := failedBankEvent()
	if _, err := svc.IngestDecision(context.Background(), ev); err != nil {
		t.Fatal(err)
	}
	h := &Handler{Service: svc}
	r := gin.New()
	RegisterRoutes(r, h, "secret", "")
	req := httptest.NewRequest(http.MethodGet, "/v1/finance-evidence/entities/payment/pay_123", nil)
	req.Header.Set("Authorization", "Bearer "+testToken(t, "secret", "tenant-b"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if raw, ok := body["evidence"].([]any); ok && len(raw) != 0 {
		t.Fatalf("leaked %v", raw)
	}
}

func TestHandlerIngestAndPack(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{Service: NewService(NewMemoryStore())}
	r := gin.New()
	RegisterRoutes(r, h, "", "")
	ev := failedBankEvent()
	ev.InvestigationID = "inv_123"
	raw, _ := json.Marshal(ev)
	req := httptest.NewRequest(http.MethodPost, "/internal/finance-evidence/ingest", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("code=%d %s", w.Code, w.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/v1/finance-evidence/packs/inv_123?tenant_id=tenant-a", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("pack code=%d %s", w.Code, w.Body.String())
	}
}
