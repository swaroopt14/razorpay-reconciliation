package investigate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/tools"

	"github.com/gin-gonic/gin"
)

type caseSpec struct {
	ID                string   `json:"id"`
	EntityID          string   `json:"entity_id"`
	EntityType        string   `json:"entity_type"`
	TenantID          string   `json:"tenant_id"`
	Fixture           string   `json:"fixture"`
	RootCauseCategory string   `json:"root_cause_category"`
	Certainty         string   `json:"certainty"`
	Classification    string   `json:"classification"`
	Impact            int64    `json:"impact"`
	Status            string   `json:"status"`
	MaxIterations     int      `json:"max_iterations"`
	MustContain       []string `json:"must_contain"`
	MustNotContain    []string `json:"must_not_contain"`
}

func fixtureServer(t *testing.T, mode string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("tenant_id") == "tenant-b" {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "tenant_isolation"})
			return
		}
		if r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/investigations") {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": "out_inv_1"}})
			return
		}
		write := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		path := r.URL.Path
		switch {
		case strings.Contains(path, "/exceptions"):
			write(map[string]any{"exceptions": fixtureExceptions(mode)})
		case strings.Contains(path, "/payouts/") && strings.HasSuffix(path, "/evidence"):
			write(map[string]any{"evidence_ids": []any{"ev_p"}})
		case strings.Contains(path, "/payments/") && strings.HasSuffix(path, "/evidence"):
			write(map[string]any{"evidence_ids": []any{"ev_1"}, "evidence_refs": map[string]any{"bank_observation_id": "bank_1"}})
		case strings.Contains(path, "/payouts/"):
			write(fixturePayout(mode, path))
		case strings.Contains(path, "/payments/"):
			write(fixturePayment(mode, path))
		case strings.Contains(path, "/settlements"):
			write(map[string]any{"settlements": []any{}})
		case strings.Contains(path, "/bank-transactions"):
			write(map[string]any{"bank_transactions": fixtureBanks(mode)})
		case strings.Contains(path, "/sla-policy"):
			write(map[string]any{"policies": []any{map[string]any{"name": "payout", "hours": 24}}})
		default:
			write(map[string]any{})
		}
	}))
}

func fixtureExceptions(mode string) []any {
	switch mode {
	case "matched", "failed_no_movement":
		return []any{
			map[string]any{"id": "ex_ok", "entity_id": "pay_ok", "entity_type": "payment", "reason": "failed_no_money_movement", "reconciliation_result": "MATCHED", "variance_amount": 0},
			map[string]any{"id": "ex_fail_ok", "entity_id": "pay_fail_ok", "entity_type": "payment", "reason": "failed_no_money_movement", "reconciliation_result": "MATCHED", "variance_amount": 0},
		}
	case "payout_processing":
		return []any{map[string]any{"id": "ex_p", "entity_id": "pout_open", "entity_type": "payout", "reason": "payout_open_past_sla", "variance_amount": 5000}}
	case "payout_missing_bank":
		return []any{map[string]any{"id": "ex_pm", "entity_id": "pout_123", "entity_type": "payout", "reason": "payout_missing_bank", "variance_amount": 25000}}
	case "amount_mismatch":
		return []any{map[string]any{"id": "ex_v", "entity_id": "pay_var", "entity_type": "payment", "reason": "amount_mismatch", "variance_amount": 8000, "expected_amount": 100000, "observed_amount": 92000}}
	case "missing_settlement":
		return []any{map[string]any{"id": "ex_c", "entity_id": "pay_cap", "entity_type": "payment", "reason": "captured_missing_settlement", "variance_amount": 7500}}
	case "two_banks":
		return []any{map[string]any{"id": "ex_a", "entity_id": "pay_amb", "entity_type": "payment", "reason": "ambiguous_bank_candidates", "variance_amount": 10000}}
	case "batch":
		return []any{
			map[string]any{"id": "ex_hi", "entity_id": "pay_var", "entity_type": "payment", "reason": "amount_mismatch", "variance_amount": 25000},
			map[string]any{"id": "ex_mid", "entity_id": "pay_123", "entity_type": "payment", "reason": "failed_with_bank_movement", "variance_amount": 10000},
			map[string]any{"id": "ex_lo", "entity_id": "pay_cap", "entity_type": "payment", "reason": "captured_missing_settlement", "variance_amount": 200},
			map[string]any{"id": "ex_ok", "entity_id": "pay_ok", "entity_type": "payment", "reason": "failed_no_money_movement", "reconciliation_result": "MATCHED", "variance_amount": 0},
		}
	default:
		return []any{
			map[string]any{"id": "ex_1", "entity_id": "pay_123", "entity_type": "payment", "reason": "failed_with_bank_movement", "variance_amount": 10000, "observed_amount": 10000},
		}
	}
}

func fixturePayment(mode, path string) map[string]any {
	id := "pay_123"
	if i := strings.LastIndex(path, "/"); i >= 0 {
		id = path[i+1:]
	}
	status := "failed"
	result := "UNRESOLVED"
	reason := "failed_with_bank_movement"
	var variance int64 = 10000
	switch {
	case mode == "matched" || mode == "failed_no_movement" || id == "pay_ok" || id == "pay_fail_ok":
		result, reason, variance = "MATCHED", "failed_no_money_movement", 0
	case mode == "amount_mismatch" || id == "pay_var":
		status, reason, variance = "captured", "amount_mismatch", 8000
		if mode == "batch" && id == "pay_var" {
			variance = 25000
		}
	case mode == "missing_settlement" || id == "pay_cap":
		status, reason, variance = "captured", "captured_missing_settlement", 7500
		if mode == "batch" && id == "pay_cap" {
			variance = 200
		}
	case mode == "two_banks" || id == "pay_amb":
		reason = "ambiguous_bank_candidates"
	}
	return map[string]any{
		"payment_id": id, "status": status, "amount_minor": variance, "currency": "INR",
		"reconciliation": map[string]any{"result": result, "reason": reason, "variance_amount": variance, "observed_amount": variance},
	}
}

func fixturePayout(mode, path string) map[string]any {
	id := "pout_123"
	if i := strings.LastIndex(path, "/"); i >= 0 {
		id = path[i+1:]
	}
	status := "processed"
	reason := "payout_missing_bank"
	var variance int64 = 25000
	if mode == "payout_processing" || id == "pout_open" {
		status, reason, variance = "processing", "payout_open_past_sla", 5000
	}
	return map[string]any{
		"payout_id": id, "status": status, "amount_minor": variance, "currency": "INR",
		"reconciliation": map[string]any{"result": "UNRESOLVED", "reason": reason, "variance_amount": variance},
	}
}

func fixtureBanks(mode string) []any {
	switch mode {
	case "no_bank", "payout_missing_bank", "missing_settlement", "matched", "failed_no_movement":
		return []any{}
	case "two_banks":
		return []any{
			map[string]any{"id": "bank_1", "amount_minor": 10000},
			map[string]any{"id": "bank_2", "amount_minor": 10000},
		}
	case "payout_processing":
		return []any{}
	default:
		return []any{map[string]any{"id": "bank_1", "amount_minor": 10000, "utr": "123456"}}
	}
}

func runCase(t *testing.T, spec caseSpec) Report {
	t.Helper()
	srv := fixtureServer(t, spec.Fixture)
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	tenant := spec.TenantID
	if tenant == "" {
		tenant = "tenant-a"
	}
	lim := DefaultLimits()
	if spec.MaxIterations > 0 {
		lim.MaxIterations = spec.MaxIterations
	}
	return Investigate(c, Request{
		TenantID: tenant, ConnectorID: "conn",
		EntityType: spec.EntityType, EntityID: spec.EntityID,
		Limits: lim, Persist: false,
	})
}

func TestGoldenCases(t *testing.T) {
	dir := filepath.Join("testdata", "cases")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 12 {
		t.Fatalf("expected ~15 case files, got %d", len(entries))
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		var spec caseSpec
		if err := json.Unmarshal(raw, &spec); err != nil {
			t.Fatalf("%s: %v", e.Name(), err)
		}
		t.Run(spec.ID, func(t *testing.T) {
			rep := runCase(t, spec)
			if spec.Status != "" && rep.Status != spec.Status {
				t.Fatalf("status=%s want %s summary=%s", rep.Status, spec.Status, rep.Summary)
			}
			if spec.Certainty != "" && rep.RootCause.Certainty != spec.Certainty {
				t.Fatalf("certainty=%s want %s", rep.RootCause.Certainty, spec.Certainty)
			}
			if spec.RootCauseCategory != "" && rep.RootCause.Category != spec.RootCauseCategory {
				t.Fatalf("root=%s want %s", rep.RootCause.Category, spec.RootCauseCategory)
			}
			if spec.Classification != "" && rep.Classification != spec.Classification {
				t.Fatalf("class=%s want %s", rep.Classification, spec.Classification)
			}
			if spec.Impact != 0 && rep.FinancialImpact.Amount != spec.Impact {
				t.Fatalf("impact=%d want %d", rep.FinancialImpact.Amount, spec.Impact)
			}
			if spec.ID == "fabricated_ev" {
				for _, id := range rep.Evidence {
					if id == "ev_fake" {
						t.Fatal("fabricated evidence cited")
					}
				}
			}
			text := strings.ToLower(rep.Text())
			for _, n := range spec.MustContain {
				if !strings.Contains(text, strings.ToLower(n)) && !strings.Contains(rep.Summary, n) && !containsAny(rep, n) {
					t.Fatalf("missing %q in %s | %v", n, rep.Summary, rep.Limitations)
				}
			}
			for _, n := range spec.MustNotContain {
				if strings.Contains(text, strings.ToLower(n)) {
					t.Fatalf("must not contain %q: %s", n, rep.Text())
				}
			}
			if reportForcesMatched(rep) {
				t.Fatal("false MATCHED resolution")
			}
			if strings.EqualFold(rep.FinancialImpact.Type, "LOSS") {
				t.Fatal("impact must not be LOSS")
			}
		})
	}
}

func containsAny(rep Report, n string) bool {
	low := strings.ToLower(n)
	for _, l := range rep.Limitations {
		if strings.Contains(strings.ToLower(l), low) {
			return true
		}
	}
	for _, f := range rep.Findings {
		if strings.Contains(strings.ToLower(f.Finding), low) {
			return true
		}
	}
	return false
}

func TestHallucinationNoBank(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "no_bank"})
	low := strings.ToLower(rep.Text())
	if strings.Contains(low, "bank received") || strings.Contains(low, "₹10,000") && strings.Contains(low, "bank received") {
		t.Fatal(rep.Summary)
	}
	if !strings.Contains(low, "no bank") {
		t.Fatal(rep.Summary)
	}
}

func TestHallucinationNoSettlement(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "default"})
	if strings.Contains(strings.ToLower(rep.Text()), "payment was settled") {
		t.Fatal(rep.Summary)
	}
}

func TestHallucinationAmbiguousBank(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_amb", EntityType: "payment", Fixture: "two_banks"})
	low := strings.ToLower(rep.Text())
	if !strings.Contains(low, "not proven") {
		t.Fatal(rep.Summary)
	}
	if strings.Contains(low, "ownership is proven") {
		t.Fatal(rep.Summary)
	}
}

func TestHallucinationFailedBankNoProviderFault(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "default"})
	low := strings.ToLower(rep.Text())
	if strings.Contains(low, "incorrectly processed") || strings.Contains(low, "incorrectly settled") {
		t.Fatal(rep.Summary)
	}
	if rep.RootCause.Category != ClassUnknown || rep.RootCause.Certainty != CertaintyUnknown {
		t.Fatalf("%+v", rep.RootCause)
	}
}

func TestHallucinationExposureNotLoss(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "default"})
	low := strings.ToLower(rep.Text())
	if strings.Contains(low, "was lost") {
		t.Fatal(rep.Summary)
	}
	if !strings.Contains(low, "unresolved exposure") {
		t.Fatal(rep.Summary)
	}
	if rep.FinancialImpact.Amount != 10000 || rep.FinancialImpact.Type != ImpactUnresolved {
		t.Fatalf("%+v", rep.FinancialImpact)
	}
}

func TestHallucinationPayoutNotStuck(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pout_open", EntityType: "payout", Fixture: "payout_processing"})
	if strings.Contains(rep.Text(), "STUCK") {
		t.Fatal(rep.Summary)
	}
	if !strings.Contains(strings.ToLower(rep.Text()), "processing") {
		t.Fatal(rep.Summary)
	}
	if !strings.EqualFold(rep.ProviderStatus, "processing") {
		t.Fatalf("status=%s", rep.ProviderStatus)
	}
}

func TestPlanToolOrderAndRetryLimit(t *testing.T) {
	srv := fixtureServer(t, "default")
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	rep := Investigate(c, Request{TenantID: "tenant-a", ConnectorID: "conn", EntityID: "pay_123", EntityType: "payment", Persist: false})
	var names []string
	counts := map[string]int{}
	for _, tc := range rep.Trace.ToolCalls {
		names = append(names, tc.Name)
		counts[tc.Name+"|"+tc.Args]++
	}
	joined := strings.Join(names, ",")
	if !strings.Contains(joined, tools.GetPayment) || !strings.Contains(joined, tools.SearchBankTxns) || !strings.Contains(joined, tools.GetLedgerEntry) {
		t.Fatalf("plan tools missing: %v", names)
	}
	for k, n := range counts {
		if n > 2 {
			t.Fatalf("same tool+args %s called %d times", k, n)
		}
	}
	st := &InvestigationState{EntityType: "payment", EntityID: "pay_123", Plan: []string{tools.GetPayment}, Sources: map[string]map[string]any{}, Limits: Limits{MaxSameTool: 2}}
	st.ToolCalls = []ToolCall{{Name: tools.GetPayment, Args: "pay_123"}, {Name: tools.GetPayment, Args: "pay_123"}}
	if next := nextTool(st); next != "" {
		t.Fatalf("expected retry skip, got %s", next)
	}
}

func TestLimitReachedUnknown(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "default", MaxIterations: 1})
	if rep.Status != StatusLimitReached {
		t.Fatalf("status=%s", rep.Status)
	}
	if rep.RootCause.Certainty != CertaintyUnknown {
		t.Fatalf("certainty=%s", rep.RootCause.Certainty)
	}
}

func TestProvenNeverAssignedForFailedBank(t *testing.T) {
	rep := runCase(t, caseSpec{EntityID: "pay_123", EntityType: "payment", Fixture: "default"})
	for _, h := range rep.Hypotheses {
		if h.Status == HypProven {
			t.Fatalf("hypothesis %s marked PROVEN", h.ID)
		}
	}
	if h1 := hypByID(rep, "H1"); h1.Status != HypContradicted {
		t.Fatalf("H1=%s", h1.Status)
	}
	if h2 := hypByID(rep, "H2"); h2.Status != HypContradicted {
		t.Fatalf("H2=%s", h2.Status)
	}
	if h4 := hypByID(rep, "H4"); h4.Status != HypSupported {
		t.Fatalf("H4=%s", h4.Status)
	}
}

func hypByID(rep Report, id string) Hypothesis {
	for _, h := range rep.Hypotheses {
		if h.ID == id {
			return h
		}
	}
	return Hypothesis{}
}

func TestDropFabricatedEvidence(t *testing.T) {
	st := &InvestigationState{
		Evidence: []string{"ev_1", "ev_fake"},
		Sources: map[string]map[string]any{
			tools.GetEvidence: {"evidence_ids": []any{"ev_1"}},
		},
	}
	dropFabricatedEvidence(st)
	if len(st.Evidence) != 1 || st.Evidence[0] != "ev_1" {
		t.Fatalf("%v", st.Evidence)
	}
}

func TestBatchPriorityAndNoFalseMatch(t *testing.T) {
	srv := fixtureServer(t, "batch")
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	sum := Batch(c, BatchRequest{TenantID: "tenant-a", ConnectorID: "conn", MaxCases: 2, MinFinancialImpact: 1000, Persist: false})
	if sum.ExceptionsIn != 2 {
		t.Fatalf("exceptions_in=%d", sum.ExceptionsIn)
	}
	if sum.FalseResolutions != 0 {
		t.Fatal("false resolutions")
	}
	if len(sum.Investigations) != 2 {
		t.Fatalf("got %d", len(sum.Investigations))
	}
	if sum.Investigations[0].EntityID != "pay_var" {
		t.Fatalf("priority first=%s", sum.Investigations[0].EntityID)
	}
	for _, r := range sum.Investigations {
		if reportForcesMatched(r) {
			t.Fatalf("forced MATCHED: %s", r.Summary)
		}
		if r.Phase6Result == "MATCHED" {
			t.Fatal("MATCHED case should have been skipped")
		}
	}
}

func TestRegistryReadOnly(t *testing.T) {
	for _, d := range Registry() {
		if d.Risk != "READ_ONLY" {
			t.Fatalf("%s risk=%s", d.Name, d.Risk)
		}
	}
	if toolAllowed("run_recon", "payment") || toolAllowed("Match", "payment") {
		t.Fatal("forbidden tools must not be allowed")
	}
}

func TestHandlerTenantIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := fixtureServer(t, "default")
	defer srv.Close()
	h := NewHandler(tools.NewOutcomeClient(srv.URL, ""), "conn")
	h.Persist = false

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(plmiddleware.TenantIDContextKey, "tenant-a")
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/investigations", bytes.NewBufferString(`{"entity_id":"pay_123"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	h.Create(c)
	if w.Code != http.StatusOK {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	var created Report
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Set(plmiddleware.TenantIDContextKey, "tenant-b")
	c2.Params = gin.Params{{Key: "id", Value: created.InvestigationID}}
	c2.Request = httptest.NewRequest(http.MethodGet, "/v1/investigations/"+created.InvestigationID, nil)
	h.Get(c2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("tenant-b should not read tenant-a report: %d", w2.Code)
	}

	w3 := httptest.NewRecorder()
	c3, _ := gin.CreateTestContext(w3)
	c3.Set(plmiddleware.TenantIDContextKey, "tenant-a")
	c3.Params = gin.Params{{Key: "id", Value: created.InvestigationID}}
	c3.Request = httptest.NewRequest(http.MethodGet, "/v1/investigations/"+created.InvestigationID+"/trace", nil)
	h.Trace(c3)
	if w3.Code != http.StatusOK {
		t.Fatalf("trace %d", w3.Code)
	}
}

func TestPersistBestEffort(t *testing.T) {
	srv := fixtureServer(t, "default")
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	rep := Investigate(c, Request{TenantID: "tenant-a", ConnectorID: "conn", EntityID: "pay_123", Persist: true})
	if rep.OutcomeInvestigationID != "out_inv_1" {
		t.Fatalf("outcome id=%s", rep.OutcomeInvestigationID)
	}
}
