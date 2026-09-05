package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"zord-outcome-engine/internal/auth"
	"zord-outcome-engine/internal/close"
	"zord-outcome-engine/internal/recon"

	"github.com/gin-gonic/gin"
)

func TestCloseRunJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, store := financeRouter(t)
	fin := recon.NewFinancialService(store)
	h := &CloseHandler{Service: close.NewService(fin, nil, store)}
	r := gin.New()
	r.POST("/v1/finance-close/run", h.Run)

	req := httptest.NewRequest(http.MethodPost, "/v1/finance-close/run", strings.NewReader(`{"tenant_id":"t","connector_id":"c"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithPrincipalForTest(req.Context(), "t"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	ct := w.Header().Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("content-type=%s", ct)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{
		"close_run_id", "records", "matched", "exceptions", "match_rate",
		"false_resolutions", "exception_list", "accuracy", "cash_position",
	} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing %s in %v", k, body)
		}
	}
	if body["currency"] != "INR" {
		t.Fatalf("currency=%v", body["currency"])
	}
	acc, ok := body["accuracy"].(map[string]any)
	if !ok {
		t.Fatalf("accuracy=%v", body["accuracy"])
	}
	for _, k := range []string{"precision", "recall", "f1", "false_match_rate"} {
		if _, ok := acc[k]; !ok {
			t.Fatalf("accuracy missing %s", k)
		}
	}
	cash, ok := body["cash_position"].(map[string]any)
	if !ok {
		t.Fatalf("cash_position=%v", body["cash_position"])
	}
	if _, ok := cash["bank_credited_proven_minor"]; !ok {
		t.Fatalf("%v", cash)
	}
	if _, ok := body["fully_reconciled"]; ok {
		t.Fatal("must not emit fully_reconciled")
	}
}

func TestCloseRunRequiresTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &CloseHandler{Service: close.NewService(recon.NewFinancialService(recon.NewMemoryFinancialStore()), nil, recon.NewMemoryFinancialStore())}
	r := gin.New()
	r.POST("/v1/finance-close/run", h.Run)
	req := httptest.NewRequest(http.MethodPost, "/v1/finance-close/run", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithPrincipalForTest(req.Context(), "t"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("code=%d", w.Code)
	}
}
