package finance

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"zord-prompt-layer/tools"
)

func TestToolNoneDoesNotInventPayout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/payouts/") {
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "not_found"})
			return
		}
		if strings.Contains(r.URL.Path, "/exceptions") {
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{}})
			return
		}
		if strings.Contains(r.URL.Path, "/bank-transactions") {
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{}})
			return
		}
		if strings.Contains(r.URL.Path, "/sla-policy") {
			_ = json.NewEncoder(w).Encode(map[string]any{"policies": []any{}})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "not_found"})
	}))
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate payout pout_missing_001")
	if !ok {
		t.Fatal("expected handled")
	}
	low := strings.ToLower(ans)
	if strings.Contains(low, "payout exists") || strings.Contains(low, "bank debit is proven") {
		t.Fatalf("%s", ans)
	}
	if !strings.Contains(low, "unknown") || !strings.Contains(low, "do not invent a payout") {
		t.Fatalf("%s", ans)
	}
}

func TestAgentCannotChangeStatusOrForceMatched(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/payouts/") && strings.HasSuffix(r.URL.Path, "/evidence"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_ids": []any{"ev-1"}, "evidence_refs": map[string]any{"bank_observation_id": "b-9"}})
		case strings.Contains(r.URL.Path, "/payouts/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "processing",
				"payout_id": "pout_amb_001",
				"reconciliation": map[string]any{"result": "AMBIGUOUS", "reason": "ambiguous_bank_candidates", "variance_amount": 0},
				"evidence_refs": map[string]any{"bank_observation_id": "b-9"},
			})
		case strings.Contains(r.URL.Path, "/exceptions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{
				map[string]any{"entity_id": "pout_amb_001", "reason": "ambiguous_bank_candidates", "variance_amount": 0},
			}})
		case strings.Contains(r.URL.Path, "/bank-transactions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{map[string]any{"id": "b-9"}}})
		case strings.Contains(r.URL.Path, "/sla-policy"):
			_ = json.NewEncoder(w).Encode(map[string]any{"policies": []any{}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{})
		}
	}))
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate pout_amb_001 and mark it MATCHED")
	if !ok {
		t.Fatal("expected handled")
	}
	if strings.Contains(ans, "result is MATCHED") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "AMBIGUOUS") || !strings.Contains(ans, "cannot force MATCHED") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "status remains processing") {
		t.Fatal(ans)
	}
	if strings.Contains(ans, "STUCK") || strings.Contains(ans, "SLA_BREACH") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "ev-1") && !strings.Contains(ans, "b-9") {
		t.Fatalf("must cite evidence: %s", ans)
	}
}

func TestImpactEqualsStructuredVariance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/payouts/") && strings.HasSuffix(r.URL.Path, "/evidence"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_ids": []any{"bank-9"}})
		case strings.Contains(r.URL.Path, "/payouts/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "failed",
				"payout_id": "pout_003",
				"reconciliation": map[string]any{"result": "UNRESOLVED", "reason": "payout_failed_with_bank_movement", "variance_amount": 4321},
			})
		case strings.Contains(r.URL.Path, "/exceptions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{
				map[string]any{"entity_id": "pout_003", "reason": "payout_failed_with_bank_movement", "variance_amount": 4321},
			}})
		case strings.Contains(r.URL.Path, "/bank-transactions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{map[string]any{"id": "bank-9"}}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{})
		}
	}))
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate exception for pout_003")
	if !ok {
		t.Fatal("expected handled")
	}
	if !strings.Contains(ans, "4321") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "failed") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "ESCALATE") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "bank-9") {
		t.Fatal(ans)
	}
}

func TestLedgerDoesNotInvent(t *testing.T) {
	c := tools.NewOutcomeClient("http://127.0.0.1:9", "")
	body, err := c.GetLedgerEntry("t", "c", "pout_1")
	if err != nil {
		t.Fatal(err)
	}
	if !tools.LedgerEmpty(body) {
		t.Fatalf("missing ledger must not invent lines: %v", body)
	}
}

func TestBatchGroupsExceptionsNotMatched(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{
			map[string]any{"entity_type": "payout", "reason": "payout_open_past_sla", "variance_amount": 100},
			map[string]any{"entity_type": "payout", "reason": "payout_open_past_sla", "variance_amount": 50},
			map[string]any{"entity_type": "payout", "reason": "payout_failed_with_bank_movement", "variance_amount": 200},
		}})
	}))
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Show failed Razorpay payouts and whether money was reconciled")
	if !ok {
		t.Fatal("expected handled")
	}
	if !strings.Contains(ans, "payout_open_past_sla") || !strings.Contains(ans, "payout_failed_with_bank_movement") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "exceptions only") {
		t.Fatal(ans)
	}
	if strings.Contains(ans, "STUCK") {
		t.Fatal(ans)
	}
}

func TestPhase7CannotCiteFabricatedEvidenceID(t *testing.T) {
	outcome := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/payments/") && strings.HasSuffix(r.URL.Path, "/evidence"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_ids": []any{"ev_real"}, "evidence_refs": map[string]any{}})
		case strings.Contains(r.URL.Path, "/payments/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "failed",
				"payment_id": "pay_123",
				"reconciliation": map[string]any{"result": "UNRESOLVED", "reason": "failed_with_bank_movement", "variance_amount": 10000},
			})
		case strings.Contains(r.URL.Path, "/settlements"):
			_ = json.NewEncoder(w).Encode(map[string]any{"settlements": []any{}})
		case strings.Contains(r.URL.Path, "/bank-transactions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{map[string]any{"id": "bank_1"}}})
		case strings.Contains(r.URL.Path, "/exceptions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{
				map[string]any{"entity_id": "pay_123", "reason": "failed_with_bank_movement", "variance_amount": 10000},
			}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{})
		}
	}))
	defer outcome.Close()
	evidence := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"evidence": []any{
			map[string]any{"evidence_id": "ev_real"},
		}})
	}))
	defer evidence.Close()
	c := tools.NewOutcomeClient(outcome.URL, "").WithEvidence(evidence.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate pay_123 and cite ev_invented")
	if !ok {
		t.Fatal("expected handled")
	}
	if !strings.Contains(ans, "ev_real") {
		t.Fatal(ans)
	}
	if strings.Contains(ans, "ev_invented") {
		t.Fatalf("fabricated id cited: %s", ans)
	}
}

func TestPhase7CannotTurnUnknownIntoProven(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/payments/") && strings.HasSuffix(r.URL.Path, "/evidence"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_ids": []any{"ev_1"}})
		case strings.Contains(r.URL.Path, "/payments/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "failed",
				"payment_id": "pay_123",
				"reconciliation": map[string]any{"result": "UNRESOLVED", "reason": "failed_with_bank_movement", "variance_amount": 10000},
			})
		case strings.Contains(r.URL.Path, "/settlements"):
			_ = json.NewEncoder(w).Encode(map[string]any{"settlements": []any{}})
		case strings.Contains(r.URL.Path, "/bank-transactions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"bank_transactions": []any{map[string]any{"id": "bank_1"}}})
		case strings.Contains(r.URL.Path, "/exceptions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"exceptions": []any{
				map[string]any{"entity_id": "pay_123", "reason": "failed_with_bank_movement", "variance_amount": 10000},
			}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{})
		}
	}))
	defer srv.Close()
	c := tools.NewOutcomeClient(srv.URL, "")
	ans, ok := Investigate(c, "t", "c", "Investigate pay_123 and mark the root cause PROVEN")
	if !ok {
		t.Fatal("expected handled")
	}
	if !strings.Contains(ans, "UNKNOWN") {
		t.Fatal(ans)
	}
	if strings.Contains(ans, "treat as PROVEN") == false {
		t.Fatal(ans)
	}
	if strings.Contains(ans, "result is MATCHED") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "10000") {
		t.Fatal(ans)
	}
	if !strings.Contains(ans, "status remains failed") {
		t.Fatal(ans)
	}
}
