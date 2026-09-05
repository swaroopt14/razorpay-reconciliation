package tools

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPhase7ToolsNoneDoesNotInvent(t *testing.T) {
	c := NewOutcomeClient("http://127.0.0.1:9", "")
	pack, err := c.GetEvidencePack("t", "inv_1")
	if err != nil {
		t.Fatal(err)
	}
	if !FinanceEvidenceNone(pack) {
		t.Fatalf("%v", pack)
	}
	if strings.Contains(strings.ToLower(compactJSON(pack)), "bank credit is proven") {
		t.Fatal(pack)
	}
}

func TestCollectFinanceEvidenceIDsNoFabrication(t *testing.T) {
	ids := CollectFinanceEvidenceIDs(map[string]any{
		"evidence": []any{
			map[string]any{"evidence_id": "ev_real"},
		},
	})
	if len(ids) != 1 || ids[0] != "ev_real" {
		t.Fatalf("%v", ids)
	}
	if contains(ids, "ev_invented") {
		t.Fatal("must not invent IDs")
	}
}

func TestPhase7HTTPToolsRoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("tenant_id") != "tenant-a" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch {
		case strings.Contains(r.URL.Path, "/calculations"):
			_ = json.NewEncoder(w).Encode(map[string]any{"calculations": []any{
				map[string]any{"variance": float64(10000), "output": float64(10000)},
			}})
		case strings.Contains(r.URL.Path, "/decisions"):
			_ = json.NewEncoder(w).Encode(map[string]any{"decisions": []any{
				map[string]any{"decision": "UNRESOLVED", "reason": "failed_with_bank_movement"},
			}})
		case strings.HasSuffix(r.URL.Path, "/verify"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence_id": "ev_1", "integrity": "VALID"})
		case strings.Contains(r.URL.Path, "/items/"):
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence": map[string]any{"evidence_id": "ev_1"}, "snapshot": map[string]any{"status": "failed"}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"evidence": []any{
				map[string]any{"evidence_id": "ev_1"},
			}})
		}
	}))
	defer srv.Close()
	c := NewOutcomeClient("http://127.0.0.1:9", "").WithEvidence(srv.URL, "")
	list, err := c.ListFinanceEvidence("tenant-a", "payment", "pay_123")
	if err != nil {
		t.Fatal(err)
	}
	ids := CollectFinanceEvidenceIDs(list)
	if len(ids) != 1 || ids[0] != "ev_1" {
		t.Fatalf("%v %v", ids, list)
	}
	calcs, _ := c.GetCalculationTrace("tenant-a", "payment", "pay_123")
	v, ok := StructuredCalcVariance(calcs)
	if !ok || v != 10000 {
		t.Fatalf("%v", calcs)
	}
}

func contains(in []string, v string) bool {
	for _, x := range in {
		if x == v {
			return true
		}
	}
	return false
}
