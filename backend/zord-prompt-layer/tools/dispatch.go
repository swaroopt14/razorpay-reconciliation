package tools

import (
	"regexp"
	"strings"
)

var (
	payRe  = regexp.MustCompile(`(?i)\bpay_[A-Za-z0-9_]+\b`)
	poutRe = regexp.MustCompile(`(?i)\bpout_[A-Za-z0-9_]+\b`)
	setlRe = regexp.MustCompile(`(?i)\bsetl_[A-Za-z0-9_]+\b`)
)

func ExtractPaymentID(q string) string {
	return payRe.FindString(q)
}

func ExtractPayoutID(q string) string {
	return poutRe.FindString(q)
}

func ExtractSettlementID(q string) string {
	return setlRe.FindString(q)
}

func SelectTool(q string) string {
	s := strings.ToLower(q)
	switch {
	case strings.Contains(s, "fresh"):
		return GetFreshnessStatus
	case strings.Contains(s, "gap") || strings.Contains(s, "mismatch") || strings.Contains(s, "unresolved") || strings.Contains(s, "ambiguous"):
		return GetPaymentGaps
	case strings.Contains(s, "waterfall") || strings.Contains(s, "breakdown"):
		return GetSettlementBreakdown
	case strings.Contains(s, "reach the bank") || strings.Contains(s, "money reach") || strings.Contains(s, "bank credit") || strings.Contains(s, "in the bank"):
		return GetBankMatch
	case strings.Contains(s, "proof") || strings.Contains(s, "settled") || strings.Contains(s, "reconcil") || ExtractPaymentID(q) != "":
		return GetTransactionProof
	default:
		return ""
	}
}

// Answer calls Slice A proof APIs. Bank credit is cited only when bank_credited=proven.
func Answer(c *OutcomeClient, tenantID, connectorID, query string) (string, bool) {
	if c == nil || strings.TrimSpace(query) == "" {
		return "", false
	}
	tool := SelectTool(query)
	if tool == "" {
		return "", false
	}
	switch tool {
	case GetPaymentGaps:
		body, err := c.PaymentGaps(tenantID, connectorID)
		if err != nil {
			return "", false
		}
		return "Payment gaps list payments that are not fully reconciled. Provider settled is not bank credited. " + compactJSON(body), true
	case GetFreshnessStatus:
		body, err := c.FreshnessStatus(tenantID, connectorID)
		if err != nil {
			return "", false
		}
		return "Freshness is computed from stored API observations vs webhook receipts. " + compactJSON(body), true
	case GetSettlementBreakdown:
		sid := ExtractSettlementID(query)
		if sid == "" {
			return "", false
		}
		body, err := c.SettlementBreakdown(tenantID, connectorID, sid)
		if err != nil {
			return "", false
		}
		return "Settlement waterfall uses recon lines only. Expected net is not bank credit. " + compactJSON(body), true
	case GetBankMatch:
		pid := ExtractPaymentID(query)
		if pid == "" {
			return "", false
		}
		body, err := c.BankMatch(tenantID, connectorID, pid)
		if err != nil {
			return "", false
		}
		return formatBankAnswer(body), true
	default:
		pid := ExtractPaymentID(query)
		if pid == "" {
			return "", false
		}
		body, err := c.TransactionProof(tenantID, connectorID, pid)
		if err != nil {
			return "", false
		}
		return formatProofAnswer(body), true
	}
}

func formatBankAnswer(proof map[string]any) string {
	if BankCreditProven(proof) {
		return "Yes. A bank statement row is matched to this settlement, so bank credit is proven."
	}
	msg := proofMessage(proof)
	if providerSettled(proof) {
		return "Razorpay included this payment in settlement, but that is not bank credit. Did the money reach the bank? Not proven. " + msg
	}
	return "Did the money reach the bank? No matching bank observation is proven. " + msg
}

func formatProofAnswer(proof map[string]any) string {
	data, _ := proof["data"].(map[string]any)
	if data == nil {
		return "No proof record found."
	}
	summary, _ := data["proof_summary"].(map[string]any)
	msg, _ := data["message"].(string)
	if v, _ := summary["fully_reconciled"].(bool); v && BankCreditProven(proof) {
		return "Yes. Razorpay settlement reconciliation includes this payment and a matching bank credit was found, so the payment is fully reconciled. " + msg
	}
	if providerSettled(proof) && !BankCreditProven(proof) {
		return "Razorpay included this payment in settlement, but bank credit is not proven. " + msg
	}
	if msg != "" {
		return msg
	}
	return "Evidence is insufficient."
}

func providerSettled(proof map[string]any) bool {
	data, _ := proof["data"].(map[string]any)
	if data == nil {
		return false
	}
	summary, _ := data["proof_summary"].(map[string]any)
	v, _ := summary["provider_settled"].(string)
	return v == "proven"
}

func proofMessage(proof map[string]any) string {
	data, _ := proof["data"].(map[string]any)
	if data == nil {
		return ""
	}
	msg, _ := data["message"].(string)
	return msg
}

func compactJSON(body map[string]any) string {
	if body == nil {
		return ""
	}
	if msg, ok := body["status"].(string); ok && msg != "" {
		return "status=" + msg
	}
	if _, ok := body["counts"]; ok {
		return "gap counts are available from outcome-engine."
	}
	if _, ok := body["gaps"]; ok {
		return "gap rows are available from outcome-engine."
	}
	if _, ok := body["waterfall"]; ok {
		return "waterfall amounts are available from outcome-engine."
	}
	return "see outcome-engine proof APIs."
}
