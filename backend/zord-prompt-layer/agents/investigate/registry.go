package investigate

import (
	"strings"

	"zord-prompt-layer/tools"
)

type ToolDescriptor struct {
	Name            string
	Description     string
	Authority       string
	Risk            string
	AllowedEntities []string
}

func Registry() []ToolDescriptor {
	read := "READ_ONLY"
	return []ToolDescriptor{
		{Name: tools.GetPayment, Description: "Load canonical payment", Authority: "RAZORPAY", Risk: read, AllowedEntities: []string{"payment"}},
		{Name: tools.GetPaymentEvents, Description: "Load payment lifecycle", Authority: "RAZORPAY", Risk: read, AllowedEntities: []string{"payment"}},
		{Name: tools.GetPayout, Description: "Load canonical payout", Authority: "RAZORPAY", Risk: read, AllowedEntities: []string{"payout"}},
		{Name: tools.GetPayoutEvents, Description: "Load payout lifecycle", Authority: "RAZORPAY", Risk: read, AllowedEntities: []string{"payout"}},
		{Name: tools.GetSLAPolicy, Description: "Load payout SLA policy", Authority: "RECON", Risk: read, AllowedEntities: []string{"payout"}},
		{Name: tools.GetSettlement, Description: "Load settlement lines", Authority: "SETTLEMENT", Risk: read, AllowedEntities: []string{"payment"}},
		{Name: tools.SearchSettlements, Description: "Search settlement lines", Authority: "SETTLEMENT", Risk: read, AllowedEntities: []string{"payment"}},
		{Name: tools.GetBankTransaction, Description: "Get one bank row", Authority: "BANK", Risk: read, AllowedEntities: []string{"payment", "payout", "settlement"}},
		{Name: tools.SearchBankTxns, Description: "Search bank transactions", Authority: "BANK", Risk: read, AllowedEntities: []string{"payment", "payout", "settlement"}},
		{Name: tools.GetRefund, Description: "Search refund settlement lines", Authority: "SETTLEMENT", Risk: read, AllowedEntities: []string{"payment"}},
		{Name: tools.GetLedgerEntry, Description: "Ledger stub", Authority: "STUB", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.GetReconciliation, Description: "Load stored recon result", Authority: "RECON", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.GetException, Description: "Load stored exception", Authority: "RECON", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.GetEvidence, Description: "Load cited evidence IDs", Authority: "EVIDENCE", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.VerifyEvidenceTool, Description: "Verify a finance evidence ID", Authority: "EVIDENCE", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.GetCalculationTrace, Description: "Copy Phase 7 calculation variance", Authority: "EVIDENCE", Risk: read, AllowedEntities: []string{"payment", "payout"}},
		{Name: tools.GetDecisionTrace, Description: "Load Phase 7 decision trace", Authority: "EVIDENCE", Risk: read, AllowedEntities: []string{"payment", "payout"}},
	}
}

func lookupTool(name string) (ToolDescriptor, bool) {
	for _, t := range Registry() {
		if t.Name == name {
			return t, true
		}
	}
	return ToolDescriptor{}, false
}

func toolAllowed(name, entityType string) bool {
	desc, ok := lookupTool(name)
	if !ok || desc.Risk != "READ_ONLY" {
		return false
	}
	if entityType == "" {
		return true
	}
	for _, a := range desc.AllowedEntities {
		if strings.EqualFold(a, entityType) {
			return true
		}
	}
	return false
}

func executeTool(c *tools.OutcomeClient, st *InvestigationState, name string) (map[string]any, string, error) {
	args := st.EntityID
	switch name {
	case tools.GetException:
		if st.ExceptionID != "" {
			args = st.ExceptionID
		}
	case tools.VerifyEvidenceTool:
		if id := firstEvidenceID(st); id != "" {
			args = id
		} else {
			return map[string]any{"error": "skipped", "message": "No evidence ID to verify."}, args, nil
		}
	case tools.GetBankTransaction:
		if id := firstBankID(st); id != "" {
			args = id
		}
	case tools.GetSLAPolicy:
		args = ""
	case tools.SearchBankTxns:
		args = ""
	}

	var body map[string]any
	var err error
	switch name {
	case tools.GetEvidence:
		body, err = loadEvidence(c, st)
	case tools.GetPayout, tools.GetPayoutEvents:
		body, err = c.GetPayout(st.TenantID, st.ConnectorID, st.EntityID)
	case tools.GetSLAPolicy:
		body, err = c.GetSLAPolicy(st.TenantID, st.ConnectorID)
	case tools.SearchBankTxns:
		body, err = c.SearchBankTransactions(st.TenantID, st.ConnectorID, "", "")
	case tools.GetRefund:
		body, err = c.GetRefund(st.TenantID, st.ConnectorID, st.EntityID)
	case tools.GetLedgerEntry:
		body, err = c.GetLedgerEntry(st.TenantID, st.ConnectorID, st.EntityID)
	case tools.GetCalculationTrace:
		body, err = c.GetCalculationTrace(st.TenantID, st.EntityType, st.EntityID)
	case tools.GetDecisionTrace:
		body, err = c.GetDecisionTrace(st.TenantID, st.EntityType, st.EntityID)
	default:
		body, err = tools.CallTool(c, name, st.TenantID, st.ConnectorID, args)
	}
	if err != nil {
		return map[string]any{
			"error":   "unavailable",
			"message": err.Error(),
		}, args, err
	}
	if body == nil {
		body = map[string]any{"error": "none", "message": "No record was returned. Do not invent one."}
	}
	return body, args, nil
}

func loadEvidence(c *tools.OutcomeClient, st *InvestigationState) (map[string]any, error) {
	var body map[string]any
	var err error
	if strings.EqualFold(st.EntityType, "payout") {
		body, err = c.GetPayoutEvidence(st.TenantID, st.ConnectorID, st.EntityID)
	} else {
		body, err = c.GetEvidence(st.TenantID, st.ConnectorID, st.EntityID)
	}
	if err != nil {
		return map[string]any{"error": "unavailable", "message": err.Error()}, nil
	}
	extra, _ := c.ListFinanceEvidence(st.TenantID, st.EntityType, st.EntityID)
	if body == nil {
		body = map[string]any{}
	}
	ids := tools.CollectFinanceEvidenceIDs(body)
	ids = append(ids, tools.CollectFinanceEvidenceIDs(extra)...)
	var uniq []string
	for _, id := range ids {
		uniq = appendUnique(uniq, id)
	}
	if len(uniq) > 0 {
		body["evidence_ids"] = anyStrings(uniq)
	}
	return body, nil
}

func anyStrings(in []string) []any {
	out := make([]any, 0, len(in))
	for _, s := range in {
		out = append(out, s)
	}
	return out
}

func firstEvidenceID(st *InvestigationState) string {
	for _, id := range st.Evidence {
		if strings.HasPrefix(id, "ev_") {
			return id
		}
	}
	if ev := st.Sources[tools.GetEvidence]; ev != nil {
		for _, id := range tools.CollectFinanceEvidenceIDs(ev) {
			if strings.HasPrefix(id, "ev_") {
				return id
			}
		}
	}
	return ""
}

func firstBankID(st *InvestigationState) string {
	bank := st.Sources[tools.SearchBankTxns]
	for _, row := range sliceMaps(bank, "bank_transactions") {
		if id := stringField(row, "id", "ID", "bank_observation_id"); id != "" {
			return id
		}
	}
	return ""
}

func sameToolCount(st *InvestigationState, name, args string) int {
	n := 0
	for _, c := range st.ToolCalls {
		if c.Name == name && c.Args == args {
			n++
		}
	}
	return n
}
