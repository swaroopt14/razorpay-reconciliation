package handlers

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestJSONAmountsAreNumbersNotStrings(t *testing.T) {
	r, _ := financeRouter(t)
	for _, path := range []string{
		"/v1/reconciliation/summary?tenant_id=t&connector_id=c",
		"/v1/reconciliation/cash-position?tenant_id=t&connector_id=c",
		"/v1/reconciliation/tax-breakdown/pay_1?tenant_id=t&connector_id=c",
		"/v1/reconciliation/ledger?tenant_id=t&connector_id=c&entity_id=pay_1",
	} {
		_, body := getJSON(t, r, path)
		raw, _ := json.Marshal(body)
		assertAmountsNumeric(t, path, raw)
		if cur, ok := body["currency"].(string); ok && cur != "INR" {
			t.Fatalf("%s currency=%v", path, body["currency"])
		}
	}
}

func assertAmountsNumeric(t *testing.T, path string, raw []byte) {
	t.Helper()
	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatal(err)
	}
	for k, v := range generic {
		if !isAmountField(k) {
			continue
		}
		switch v.(type) {
		case float64, json.Number:
		default:
			t.Fatalf("%s field %s is %T, want number", path, k, v)
		}
	}
}

func isAmountField(k string) bool {
	return strings.HasSuffix(k, "_minor") || strings.HasSuffix(k, "_count") || k == "amount"
}
