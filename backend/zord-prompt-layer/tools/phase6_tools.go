package tools

import (
	"fmt"
	"net/url"
	"strings"
)

const (
	GetPayment         = "get_payment"
	GetPaymentEvents   = "get_payment_events"
	GetSettlement      = "get_settlement"
	SearchSettlements  = "search_settlements"
	GetBankTransaction = "get_bank_transaction"
	SearchBankTxns     = "search_bank_transactions"
	GetReconciliation  = "get_reconciliation"
	GetException       = "get_exception"
	GetRefund          = "get_refund"
	GetEvidence        = "get_evidence"
	GetPayout          = "get_payout"
	GetPayoutEvents    = "get_payout_events"
	GetSLAPolicy       = "get_sla_policy"
	GetSimilarCases    = "get_similar_cases"
	GetLedgerEntry     = "get_ledger_entry"
)

func Phase6Names() []string {
	return []string{
		GetPayment, GetPaymentEvents, GetSettlement, SearchSettlements,
		GetBankTransaction, SearchBankTxns, GetReconciliation, GetException,
		GetRefund, GetEvidence, GetPayout, GetPayoutEvents, GetSLAPolicy, GetSimilarCases,
		GetLedgerEntry,
	}
}

func Names() []string {
	return append([]string{
		GetTransactionProof, GetSettlementBreakdown, GetBankMatch, GetPaymentGaps, GetFreshnessStatus,
	}, Phase6Names()...)
}

func SourceNotInThisPhase(tool string) map[string]any {
	return map[string]any{
		"tool":    tool,
		"error":   "source_not_in_this_phase",
		"message": "This source is not implemented in Phase 6. Do not invent records.",
	}
}

func tenantQ(tenantID, connectorID string) url.Values {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return q
}

func (c *OutcomeClient) GetPayment(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.get("/v1/reconciliation/payments/"+paymentID, tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetPaymentEvents(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.GetPayment(tenantID, connectorID, paymentID)
}

func (c *OutcomeClient) SearchSettlements(tenantID, connectorID, paymentID, lineType string) (map[string]any, error) {
	q := tenantQ(tenantID, connectorID)
	if paymentID != "" {
		q.Set("payment_id", paymentID)
	}
	if lineType != "" {
		q.Set("line_type", lineType)
	}
	return c.get("/v1/reconciliation/settlements", q)
}

func (c *OutcomeClient) GetSettlement(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.SearchSettlements(tenantID, connectorID, paymentID, "")
}

func (c *OutcomeClient) SearchBankTransactions(tenantID, connectorID, id, utr string) (map[string]any, error) {
	q := tenantQ(tenantID, connectorID)
	if id != "" {
		q.Set("id", id)
	}
	if utr != "" {
		q.Set("utr", utr)
	}
	return c.get("/v1/reconciliation/bank-transactions", q)
}

func (c *OutcomeClient) GetBankTransaction(tenantID, connectorID, id string) (map[string]any, error) {
	return c.get("/v1/reconciliation/bank-transactions/"+id, tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetReconciliation(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.GetPayment(tenantID, connectorID, paymentID)
}

func (c *OutcomeClient) GetException(tenantID, connectorID, id string) (map[string]any, error) {
	if id == "" {
		return c.get("/v1/reconciliation/exceptions", tenantQ(tenantID, connectorID))
	}
	return c.get("/v1/reconciliation/exceptions/"+id, tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetRefund(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.SearchSettlements(tenantID, connectorID, paymentID, "refund")
}

func (c *OutcomeClient) GetEvidence(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.get("/v1/reconciliation/payments/"+paymentID+"/evidence", tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetPayout(tenantID, connectorID, payoutID string) (map[string]any, error) {
	return c.getOptional("/v1/reconciliation/payouts/"+payoutID, tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetPayoutEvents(tenantID, connectorID, payoutID string) (map[string]any, error) {
	return c.GetPayout(tenantID, connectorID, payoutID)
}

func (c *OutcomeClient) GetPayoutEvidence(tenantID, connectorID, payoutID string) (map[string]any, error) {
	return c.getOptional("/v1/reconciliation/payouts/"+payoutID+"/evidence", tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetSLAPolicy(tenantID, connectorID string) (map[string]any, error) {
	return c.getOptional("/v1/reconciliation/sla-policy", tenantQ(tenantID, connectorID))
}

func (c *OutcomeClient) GetSimilarCases(tenantID, connectorID, entityType, reason string) (map[string]any, error) {
	q := tenantQ(tenantID, connectorID)
	if entityType != "" {
		q.Set("entity_type", entityType)
	}
	if reason != "" {
		q.Set("reason", reason)
	}
	return c.getOptional("/v1/reconciliation/exceptions", q)
}

func (c *OutcomeClient) GetLedgerEntry(_, _, _ string) (map[string]any, error) {
	return SourceNotInThisPhase(GetLedgerEntry), nil
}

func CallTool(c *OutcomeClient, name, tenantID, connectorID, id string) (map[string]any, error) {
	switch name {
	case GetPayment, GetPaymentEvents, GetReconciliation:
		return c.GetPayment(tenantID, connectorID, id)
	case GetSettlement, SearchSettlements:
		return c.GetSettlement(tenantID, connectorID, id)
	case GetBankTransaction, SearchBankTxns:
		if id == "" {
			return c.SearchBankTransactions(tenantID, connectorID, "", "")
		}
		return c.GetBankTransaction(tenantID, connectorID, id)
	case GetException:
		return c.GetException(tenantID, connectorID, id)
	case GetRefund:
		return c.GetRefund(tenantID, connectorID, id)
	case GetEvidence:
		return c.GetEvidence(tenantID, connectorID, id)
	case GetPayout, GetPayoutEvents:
		return c.GetPayout(tenantID, connectorID, id)
	case GetSLAPolicy:
		return c.GetSLAPolicy(tenantID, connectorID)
	case GetSimilarCases:
		return c.GetSimilarCases(tenantID, connectorID, "payout", id)
	case GetLedgerEntry:
		return c.GetLedgerEntry(tenantID, connectorID, id)
	default:
		return nil, fmt.Errorf("unknown tool %s", name)
	}
}

func HasRecords(body map[string]any, keys ...string) bool {
	if body == nil {
		return false
	}
	for _, k := range keys {
		switch v := body[k].(type) {
		case []any:
			if len(v) > 0 {
				return true
			}
		case map[string]any:
			if len(v) > 0 {
				return true
			}
		case string:
			if strings.TrimSpace(v) != "" {
				return true
			}
		}
	}
	return false
}
