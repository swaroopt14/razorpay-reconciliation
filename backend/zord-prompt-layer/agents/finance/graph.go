package finance

import (
	"strings"

	"zord-prompt-layer/tools"
)

func IsFinanceQuery(q string) bool {
	s := strings.ToLower(q)
	if tools.ExtractPayoutID(q) != "" {
		return true
	}
	if strings.Contains(s, "payout") || strings.Contains(s, "ledger") {
		return true
	}
	return tools.IsInvestigationQuery(q)
}

func isBatchPayoutQuery(q string) bool {
	s := strings.ToLower(q)
	if tools.ExtractPayoutID(q) != "" {
		return false
	}
	if !strings.Contains(s, "payout") {
		return false
	}
	return strings.Contains(s, "failed") || strings.Contains(s, "show") ||
		strings.Contains(s, "list") || strings.Contains(s, "exceptions") ||
		strings.Contains(s, "reconcil")
}

// Investigate walks Classify → LoadPrimary → LoadLifecycle → LoadFinancialLinks
// → LoadBankSettlement → CheckSLA → VerifyEvidence → Draft.
func Investigate(c *tools.OutcomeClient, tenantID, connectorID, query string) (string, bool) {
	if c == nil || strings.TrimSpace(query) == "" {
		return "", false
	}
	if !IsFinanceQuery(query) {
		return "", false
	}
	st := Classify(query, tenantID, connectorID)
	LoadPrimary(c, st)
	LoadLifecycle(c, st)
	LoadFinancialLinks(c, st)
	LoadBankSettlement(c, st)
	CheckSLA(c, st)
	VerifyEvidence(c, st)
	return Draft(st), true
}

func Classify(query, tenantID, connectorID string) *FinanceInvestigationState {
	st := newState(tenantID, connectorID, query)
	if pout := tools.ExtractPayoutID(query); pout != "" {
		st.EntityType = "payout"
		st.EntityID = pout
		return st
	}
	if isBatchPayoutQuery(query) {
		st.EntityType = "payout"
		st.Batch = true
		return st
	}
	if pay := tools.ExtractPaymentID(query); pay != "" {
		st.EntityType = "payment"
		st.EntityID = pay
		return st
	}
	if strings.Contains(strings.ToLower(query), "payout") {
		st.EntityType = "payout"
		st.Batch = true
		return st
	}
	st.EntityType = "payment"
	st.Batch = true
	return st
}

func LoadPrimary(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	ledger, _ := c.GetLedgerEntry(st.TenantID, st.ConnectorID, st.EntityID)
	if tools.LedgerEmpty(ledger) {
		st.LedgerBlocked = true
		st.Findings = append(st.Findings, "No derived ledger lines were returned. Do not invent a ledger entry.")
	}
	if st.Batch {
		body, _ := c.GetSimilarCases(st.TenantID, st.ConnectorID, st.EntityType, "")
		st.Exceptions = exceptionMaps(body)
		return
	}
	switch st.EntityType {
	case "payout":
		body, _ := c.GetPayout(st.TenantID, st.ConnectorID, st.EntityID)
		st.Primary = body
		if noneRecord(body) || errCode(body) == "not_found" {
			st.MissingPrimary = true
			st.PayoutUnknown = true
			st.Findings = append(st.Findings, "UNKNOWN: no payout record was returned. Do not invent a payout.")
			return
		}
		st.Status = stringField(body, "status")
		if rec, ok := body["reconciliation"].(map[string]any); ok {
			st.Reconciliation = rec
			st.ReconResult = strings.ToUpper(stringField(rec, "result"))
			st.VarianceAmount = intField(rec, "variance_amount")
			st.ExceptionReason = stringField(rec, "reason")
		}
	default:
		body, _ := c.GetPayment(st.TenantID, st.ConnectorID, st.EntityID)
		st.Primary = body
		if noneRecord(body) || errCode(body) == "not_found" {
			st.MissingPrimary = true
			st.Findings = append(st.Findings, "UNKNOWN: no payment record was returned. Do not invent a payment.")
			return
		}
		st.Status = stringField(body, "status")
		if rec, ok := body["reconciliation"].(map[string]any); ok {
			st.Reconciliation = rec
			st.ReconResult = strings.ToUpper(stringField(rec, "result"))
			st.VarianceAmount = intField(rec, "variance_amount")
			st.ExceptionReason = stringField(rec, "reason")
		}
	}
}

func LoadLifecycle(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	if st.MissingPrimary || st.Batch || st.EntityID == "" {
		return
	}
	if st.EntityType == "payout" {
		st.Lifecycle, _ = c.GetPayoutEvents(st.TenantID, st.ConnectorID, st.EntityID)
		return
	}
	st.Lifecycle, _ = c.GetPaymentEvents(st.TenantID, st.ConnectorID, st.EntityID)
}

func LoadFinancialLinks(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	if st.Batch {
		return
	}
	exs, _ := c.GetException(st.TenantID, st.ConnectorID, "")
	if list, ok := exs["exceptions"].([]any); ok {
		for _, raw := range list {
			m, _ := raw.(map[string]any)
			if stringField(m, "entity_id") == st.EntityID {
				st.Exception = m
				st.ExceptionReason = stringField(m, "reason")
				if st.VarianceAmount == 0 {
					st.VarianceAmount = intField(m, "variance_amount")
				}
			}
		}
	}
	if st.EntityID != "" {
		st.Similar, _ = c.GetSimilarCases(st.TenantID, st.ConnectorID, st.EntityType, st.ExceptionReason)
	}
}

func LoadBankSettlement(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	if st.Batch {
		return
	}
	if st.EntityType == "payment" {
		setl, _ := c.GetSettlement(st.TenantID, st.ConnectorID, st.EntityID)
		st.Settlement = setl
		st.HasSettlement = tools.HasRecords(setl, "settlements")
		if !st.HasSettlement {
			st.Findings = append(st.Findings, "No settlement line was returned for this payment.")
		}
	}
	banks, _ := c.SearchBankTransactions(st.TenantID, st.ConnectorID, "", "")
	st.Bank = banks
	st.HasBank = tools.HasRecords(banks, "bank_transactions")
	if !st.HasBank {
		if st.EntityType == "payout" {
			st.Findings = append(st.Findings, "No bank transaction was returned for this payout.")
		} else {
			st.Findings = append(st.Findings, "No bank transaction was returned for this payment.")
		}
	}
}

func CheckSLA(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	st.SLA, _ = c.GetSLAPolicy(st.TenantID, st.ConnectorID)
	if st.ExceptionReason == "payout_open_past_sla" {
		st.Findings = append(st.Findings, "SLA check (code): payout remains open past the configured SLA. Razorpay status is unchanged.")
		st.Recommendation = "MONITOR"
	}
	if st.ExceptionReason == "open_status_no_downstream" {
		st.Findings = append(st.Findings, "SLA check (code): payment remains in an open Razorpay status past 72h. Status is unchanged.")
		st.Recommendation = "WAIT"
	}
}

func VerifyEvidence(c *tools.OutcomeClient, st *FinanceInvestigationState) {
	if st.Batch || st.EntityID == "" {
		return
	}
	var ev map[string]any
	if st.EntityType == "payout" {
		ev, _ = c.GetPayoutEvidence(st.TenantID, st.ConnectorID, st.EntityID)
	} else {
		ev, _ = c.GetEvidence(st.TenantID, st.ConnectorID, st.EntityID)
	}
	st.EvidenceIDs = stringSlice(ev, "evidence_ids")
	if refs, ok := ev["evidence_refs"].(map[string]any); ok {
		for _, k := range []string{"bank_observation_id", "settlement_line_id", "canonical_payment_id"} {
			if id := stringField(refs, k); id != "" {
				st.EvidenceIDs = appendUnique(st.EvidenceIDs, id)
			}
		}
	}
	if rec, ok := st.Primary["evidence_refs"].(map[string]any); ok {
		if id := stringField(rec, "bank_observation_id"); id != "" {
			st.EvidenceIDs = appendUnique(st.EvidenceIDs, id)
		}
	}

	fin, _ := c.ListFinanceEvidence(st.TenantID, st.EntityType, st.EntityID)
	for _, id := range tools.CollectFinanceEvidenceIDs(fin) {
		st.EvidenceIDs = appendUnique(st.EvidenceIDs, id)
	}
	if tools.FinanceEvidenceNone(fin) {
		st.Findings = append(st.Findings, "No finance evidence pack was returned. Do not invent evidence IDs.")
	}
	calcs, _ := c.GetCalculationTrace(st.TenantID, st.EntityType, st.EntityID)
	if v, ok := tools.StructuredCalcVariance(calcs); ok && v != 0 {
		st.VarianceAmount = v
	}
	if st.InvestigationID == "" {
		if id := stringField(st.Exception, "investigation_id"); id != "" {
			st.InvestigationID = id
		}
	}
	if st.InvestigationID != "" {
		pack, _ := c.GetEvidencePack(st.TenantID, st.InvestigationID)
		for _, id := range tools.CollectFinanceEvidenceIDs(pack) {
			st.EvidenceIDs = appendUnique(st.EvidenceIDs, id)
		}
		if doc, ok := pack["document"].(map[string]any); ok {
			if inv, ok := doc["investigation"].(map[string]any); ok {
				if stringField(inv, "certainty") == "UNKNOWN" || stringField(inv, "root_cause") == "UNKNOWN" {
					st.Findings = append(st.Findings, "Evidence pack root cause remains UNKNOWN.")
				}
			}
			if integ, ok := doc["integrity"].(map[string]any); ok {
				st.PackIntegrity = stringField(integ, "status")
			}
		}
		if h, ok := pack["pack_hash"].(string); ok && h != "" && st.PackIntegrity == "" {
			st.PackIntegrity = "VALID"
		}
	}
	if len(st.EvidenceIDs) > 0 {
		first := st.EvidenceIDs[0]
		if strings.HasPrefix(first, "ev_") {
			ver, _ := c.VerifyEvidence(st.TenantID, first)
			if stringField(ver, "integrity") == "INVALID" {
				st.Findings = append(st.Findings, "Evidence integrity is INVALID. Do not treat the snapshot as authoritative.")
			}
		}
	}
	if st.ExceptionReason == "failed_with_bank_movement" || st.ExceptionReason == "payout_failed_with_bank_movement" {
		st.Findings = append(st.Findings, "Root cause remains UNKNOWN. Bank movement is proven; why it happened is not. Certainty stays UNKNOWN; do not treat as PROVEN.")
	}
}