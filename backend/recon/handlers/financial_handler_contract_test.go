package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"zord-outcome-engine/internal/auth"
	"zord-outcome-engine/internal/recon"

	"github.com/gin-gonic/gin"
)

func financeRouter(t *testing.T) (*gin.Engine, *recon.MemoryFinancialStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store := recon.NewMemoryFinancialStore()
	store.Payments = []recon.PaymentFact{{
		PaymentID: "pay_1", CanonicalStatus: recon.PaymentCaptured, ProviderStatus: "captured",
		Captured: true, AmountMinor: 10000, Currency: "INR", Sources: []string{"webhook"},
	}}
	store.Events["pay_1"] = []recon.ObservationFact{{
		Source: "webhook", ProviderStatus: "authorized", CanonicalStatus: "authorized", SourceEventID: "evt_1",
	}, {
		Source: "api", ProviderStatus: "captured", CanonicalStatus: "captured", SourceEventID: "evt_2",
	}}
	store.Lines = []recon.SettlementLine{{
		ID: "sl1", PaymentID: "pay_1", LineType: "payment", AmountMinor: 10000, CreditMinor: 9728, FeeMinor: 272, Currency: "INR",
	}}
	store.Results = []recon.FinancialResult{{
		EntityType: recon.EntityPayment, EntityID: "pay_1", Result: recon.ResultMatched,
		Reason: "captured_settlement_exact_bank", ExpectedAmount: 10000, ObservedAmount: 9728, BankCreditProven: true,
	}}
	svc := recon.NewFinancialService(store)
	h := &FinancialHandler{Service: svc, Store: store}
	r := gin.New()
	r.GET("/v1/reconciliation/payments/:payment_id", h.GetPayment)
	r.GET("/v1/reconciliation/summary", h.GetFinanceSummary)
	r.GET("/v1/reconciliation/cash-position", h.GetCashPosition)
	r.GET("/v1/reconciliation/cash-schedule", h.GetCashSchedule)
	r.GET("/v1/reconciliation/tax-breakdown/:payment_id", h.GetTaxBreakdown)
	r.GET("/v1/reconciliation/ledger", h.GetLedger)
	r.GET("/v1/reconciliation/refunds", h.ListRefunds)
	r.GET("/v1/reconciliation/sla-policy", h.SLAPolicy)
	r.POST("/v1/reconciliation/run", h.Run)
	return r, store
}

func getJSON(t *testing.T, r *gin.Engine, path string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	ct := w.Header().Get("Content-Type")
	if w.Code == 200 && ct != "" && ct[:16] != "application/json" {
		t.Fatalf("content-type=%s", ct)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v body=%s", err, w.Body.String())
	}
	return w.Code, body
}

func TestFinancePaymentJSONIncludesObservations(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/payments/pay_1?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d body=%v", code, body)
	}
	if body["status"] != "captured" || body["provider_status"] != "captured" {
		t.Fatalf("%v", body)
	}
	obs, ok := body["observations"].([]any)
	if !ok || len(obs) != 2 {
		t.Fatalf("observations=%v", body["observations"])
	}
	reconObj, _ := body["reconciliation"].(map[string]any)
	if reconObj["bank_credit_proven"] != true {
		t.Fatalf("recon=%v", reconObj)
	}
	if _, ok := body["fully_reconciled"]; ok {
		t.Fatal("must not emit fully_reconciled")
	}
}

func TestFinanceSummaryJSON(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/summary?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d", code)
	}
	for _, k := range []string{"scored_count", "matched_count", "exposure_minor", "currency", "result_counts"} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing %s in %v", k, body)
		}
	}
	if body["currency"] != "INR" {
		t.Fatalf("currency=%v", body["currency"])
	}
}

func TestCashPositionJSON(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/cash-position?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d %v", code, body)
	}
	for _, k := range []string{"gross_captured_minor", "settlement_expected_net_minor", "bank_credited_proven_minor", "in_flight_minor", "unresolved_exposure_minor", "currency"} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing %s", k)
		}
	}
}

func TestTaxBreakdownAndLedgerJSON(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/tax-breakdown/pay_1?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d %v", code, body)
	}
	if body["fee_minor"] != float64(272) || body["explained"] != true {
		t.Fatalf("%v", body)
	}
	code, body = getJSON(t, r, "/v1/reconciliation/ledger?tenant_id=t&connector_id=c&entity_id=pay_1")
	if code != 200 {
		t.Fatalf("ledger code=%d %v", code, body)
	}
	if _, ok := body["lines"]; !ok {
		t.Fatalf("ledger=%v", body)
	}
}

func TestRefundsJSONEmpty(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/refunds?tenant_id=t&connector_id=c&payment_id=pay_1")
	if code != 200 {
		t.Fatalf("code=%d", code)
	}
	if body["source"] != "provider_refund_observations" {
		t.Fatalf("%v", body)
	}
	if body["error"] != "not_found" {
		t.Fatalf("empty refunds must be not_found: %v", body)
	}
}

func TestSLAPolicyJSON(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/sla-policy?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d", code)
	}
	if _, ok := body["policies"]; !ok {
		t.Fatalf("%v", body)
	}
}

func TestCashScheduleKind(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/cash-schedule?tenant_id=t&connector_id=c")
	if code != 200 {
		t.Fatalf("code=%d %v", code, body)
	}
	if body["kind"] != "schedule_projection" {
		t.Fatalf("%v", body)
	}
	if _, ok := body["days"].([]any); !ok {
		t.Fatalf("days=%v", body["days"])
	}
	if _, ok := body["unknown_timing_minor"]; !ok {
		t.Fatalf("%v", body)
	}
}

func TestLedgerRequiresEntityID(t *testing.T) {
	r, _ := financeRouter(t)
	code, body := getJSON(t, r, "/v1/reconciliation/ledger?tenant_id=t&connector_id=c")
	if code != 400 {
		t.Fatalf("code=%d %v", code, body)
	}
}

func TestFinanceRunJSON(t *testing.T) {
	r, _ := financeRouter(t)
	req := httptest.NewRequest(http.MethodPost, "/v1/reconciliation/run", strings.NewReader(`{"tenant_id":"t","connector_id":"c"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithPrincipalForTest(req.Context(), "t"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"run_id", "matched_count", "exception_count"} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing %s in %v", k, body)
		}
	}
}
