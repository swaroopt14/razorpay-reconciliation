package finance

import "zord-prompt-layer/tools"

// FinanceInvestigationState is structured investigation state, not a chat transcript.
type FinanceInvestigationState struct {
	TenantID         string
	ConnectorID      string
	Query            string
	EntityType       string
	EntityID         string
	Batch            bool
	Primary          map[string]any
	Lifecycle        map[string]any
	Reconciliation   map[string]any
	Exception        map[string]any
	Exceptions       []map[string]any
	Bank             map[string]any
	Settlement       map[string]any
	SLA              map[string]any
	Similar          map[string]any
	EvidenceIDs      []string
	Findings         []string
	Status           string
	ReconResult      string
	ExceptionReason  string
	VarianceAmount   int64
	Recommendation   string
	MissingPrimary   bool
	HasSettlement    bool
	HasBank          bool
	LedgerBlocked    bool
	PayoutUnknown    bool
}

func newState(tenantID, connectorID, query string) *FinanceInvestigationState {
	return &FinanceInvestigationState{
		TenantID: tenantID, ConnectorID: connectorID, Query: query,
	}
}

func noneRecord(body map[string]any) bool {
	if body == nil {
		return true
	}
	if err, _ := body["error"].(string); err == "not_found" || err == "source_not_in_this_phase" {
		return true
	}
	if tools.HasRecords(body, "payout_id", "payment_id", "status", "exceptions", "policies", "bank_transactions", "settlements", "data") {
		return false
	}
	return len(body) == 0
}
