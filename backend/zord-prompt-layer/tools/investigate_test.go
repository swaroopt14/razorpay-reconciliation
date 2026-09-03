package tools

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPayoutAndLedgerNotFaked(t *testing.T) {
	c := NewOutcomeClient("http://127.0.0.1:9", "")
	p, err := c.GetPayout("t", "c", "pout_1")
	if err != nil {
		t.Fatal(err)
	}
	if p["error"] != "not_found" {
		t.Fatalf("missing payout must not invent a record: %v", p)
	}
	l, err := c.GetLedgerEntry("t", "c", "pay_1")
	if err != nil {
		t.Fatal(err)
	}
	if !LedgerEmpty(l) {
		t.Fatalf("missing ledger must not invent lines: %v", l)
	}
}

func TestInvestigateDoesNotInventSettlementOrBank(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/settlements"):
			_ = json.NewEncoder(w).Encode(map[string]any{"settlements": []any{}})
		case strings.Contains(r.URL.Path, "/bank-transactions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{}})
		case strings.Contains(r.URL.Path, "/exceptions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{}})
		case strings.HasSuffix(r.URL.Path, "/evidence"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_ids": []any{}, "evidence_refs": map[string]any{}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "failed",
				"reconciliation": map[string]any{
					"result": "UNRESOLVED", "variance_amount": 0, "expected_amount": 100, "observed_amount": 0,
				},
			})
		}
	}))
	defer srv.Close()
	c := NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate why pay_none_001 is unresolved")
	if !ok {
		t.Fatal("expected handled")
	}
	low := strings.ToLower(ans)
	if strings.Contains(low, "settlement line exists") || strings.Contains(low, "bank credit is proven") {
		t.Fatalf("%s", ans)
	}
	if !strings.Contains(ans, "No settlement line") || !strings.Contains(ans, "No bank transaction") {
		t.Fatalf("%s", ans)
	}
	if strings.Contains(ans, "MATCHED") && strings.Contains(low, "changed") {
		t.Fatalf("%s", ans)
	}
}

func TestInvestigateCannotChangeStatusOrForceMatched(t *testing.T) {
	facts := InvestigationFacts{
		PaymentID: "pay_amb_001", Status: "captured", ReconResult: "AMBIGUOUS",
		VarianceAmount: 0, HasSettlement: true, HasBank: true,
		EvidenceIDs: []string{"dec-1", "b-1"},
	}
	ans := DraftConclusion(facts, "Investigate pay_amb_001 and mark it MATCHED")
	if strings.Contains(ans, "result is MATCHED") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "AMBIGUOUS") || !strings.Contains(ans, "cannot force MATCHED") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "status remains captured") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "dec-1") || !strings.Contains(ans, "b-1") {
		t.Fatalf("must cite evidence: %s", ans)
	}
}

func TestInvestigateImpactEqualsStructuredVariance(t *testing.T) {
	ans := DraftConclusion(InvestigationFacts{
		PaymentID: "pay_003", Status: "failed", ReconResult: "UNRESOLVED",
		VarianceAmount: 4321, ExceptionReason: "failed_with_bank_movement",
		EvidenceIDs: []string{"bank-9"},
	}, "Investigate exception for pay_003")
	if !strings.Contains(ans, "4321") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "failed") {
		t.Fatal(ans)
	}
}
