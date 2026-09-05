package tools

import (
	"fmt"
	"strings"
)

type InvestigationFacts struct {
	PaymentID       string
	Status          string
	ReconResult     string
	VarianceAmount  int64
	ExpectedAmount  int64
	ObservedAmount  int64
	HasSettlement   bool
	HasBank         bool
	EvidenceIDs     []string
	ExceptionReason string
	PayoutBlocked   bool
	LedgerBlocked   bool
}

func IsInvestigationQuery(q string) bool {
	s := strings.ToLower(q)
	if strings.Contains(s, "payout") || strings.Contains(s, "ledger") {
		return true
	}
	if ExtractPaymentID(q) == "" && !strings.Contains(s, "exception") {
		return false
	}
	return strings.Contains(s, "investigat") ||
		strings.Contains(s, "exception") ||
		strings.Contains(s, "root cause") ||
		strings.Contains(s, "why") ||
		strings.Contains(s, "unresolved") ||
		strings.Contains(s, "ambiguous") ||
		strings.Contains(s, "orphan")
}

func Investigate(c *OutcomeClient, tenantID, connectorID, query string) (string, bool) {
	if c == nil || strings.TrimSpace(query) == "" {
		return "", false
	}
	if !IsInvestigationQuery(query) {
		return "", false
	}
	pid := ExtractPaymentID(query)
	facts := loadFacts(c, tenantID, connectorID, pid)
	return DraftConclusion(facts, query), true
}

func loadFacts(c *OutcomeClient, tenantID, connectorID, paymentID string) InvestigationFacts {
	facts := InvestigationFacts{PaymentID: paymentID}
	payout, _ := c.GetPayout(tenantID, connectorID, paymentID)
	if errCode(payout) == "source_not_in_this_phase" {
		facts.PayoutBlocked = true
	}
	ledger, _ := c.GetLedgerEntry(tenantID, connectorID, paymentID)
	if LedgerEmpty(ledger) {
		facts.LedgerBlocked = true
	}
	if paymentID == "" {
		exs, _ := c.GetException(tenantID, connectorID, "")
		facts.HasSettlement = false
		facts.HasBank = false
		if HasRecords(exs, "exceptions") {
			facts.ExceptionReason = "exceptions_listed"
		}
		return facts
	}
	pay, _ := c.GetPayment(tenantID, connectorID, paymentID)
	facts.Status = stringField(pay, "status")
	if rec, ok := pay["reconciliation"].(map[string]any); ok {
		facts.ReconResult = strings.ToUpper(stringField(rec, "result"))
		facts.VarianceAmount = intField(rec, "variance_amount")
		facts.ExpectedAmount = intField(rec, "expected_amount")
		facts.ObservedAmount = intField(rec, "observed_amount")
	}
	setl, _ := c.GetSettlement(tenantID, connectorID, paymentID)
	facts.HasSettlement = HasRecords(setl, "settlements")
	banks, _ := c.SearchBankTransactions(tenantID, connectorID, "", "")
	facts.HasBank = HasRecords(banks, "bank_transactions")
	ev, _ := c.GetEvidence(tenantID, connectorID, paymentID)
	facts.EvidenceIDs = stringSlice(ev, "evidence_ids")
	if refs, ok := ev["evidence_refs"].(map[string]any); ok {
		if id := stringField(refs, "bank_observation_id"); id != "" {
			facts.EvidenceIDs = appendUnique(facts.EvidenceIDs, id)
		}
		if id := stringField(refs, "settlement_line_id"); id != "" {
			facts.EvidenceIDs = appendUnique(facts.EvidenceIDs, id)
		}
		if id := stringField(refs, "canonical_payment_id"); id != "" {
			facts.EvidenceIDs = appendUnique(facts.EvidenceIDs, id)
		}
	}
	exs, _ := c.GetException(tenantID, connectorID, "")
	if list, ok := exs["exceptions"].([]any); ok {
		for _, raw := range list {
			m, _ := raw.(map[string]any)
			if stringField(m, "entity_id") == paymentID {
				facts.ExceptionReason = stringField(m, "reason")
				if facts.VarianceAmount == 0 {
					facts.VarianceAmount = intField(m, "variance_amount")
				}
			}
		}
	}
	return facts
}

func DraftConclusion(f InvestigationFacts, query string) string {
	q := strings.ToLower(query)
	var b strings.Builder
	if f.PayoutBlocked && strings.Contains(q, "payout") {
		b.WriteString("Payout source is not in this phase. Do not invent a payout record. ")
	}
	if f.LedgerBlocked && strings.Contains(q, "ledger") {
		b.WriteString("No derived ledger lines were returned. Do not invent a ledger entry. ")
	}
	if f.Status != "" {
		fmt.Fprintf(&b, "Razorpay status remains %s. ", f.Status)
	}
	if f.ReconResult != "" {
		fmt.Fprintf(&b, "Reconciliation result is %s. ", f.ReconResult)
		if f.ReconResult == "AMBIGUOUS" {
			b.WriteString("Candidates stay AMBIGUOUS; the agent cannot force MATCHED. ")
		}
	}
	if !f.HasSettlement {
		b.WriteString("No settlement line was returned for this payment. ")
	}
	if !f.HasBank {
		b.WriteString("No bank transaction was returned for this payment. ")
	}
	if f.ExceptionReason != "" {
		fmt.Fprintf(&b, "Structured exception reason: %s. ", f.ExceptionReason)
	}
	fmt.Fprintf(&b, "Financial impact is %d (copied from structured variance_amount). ", f.VarianceAmount)
	if len(f.EvidenceIDs) > 0 {
		b.WriteString("Cited evidence IDs: " + strings.Join(f.EvidenceIDs, ", ") + ".")
	} else {
		b.WriteString("No evidence IDs were returned; do not invent a bank row.")
	}
	return strings.TrimSpace(b.String())
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func intField(m map[string]any, key string) int64 {
	if m == nil {
		return 0
	}
	switch n := m[key].(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return 0
	}
}

func stringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func appendUnique(in []string, v string) []string {
	for _, x := range in {
		if x == v {
			return in
		}
	}
	return append(in, v)
}

func errCode(m map[string]any) string {
	if m == nil {
		return ""
	}
	s, _ := m["error"].(string)
	return s
}
