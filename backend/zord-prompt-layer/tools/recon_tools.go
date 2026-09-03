package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	GetTransactionProof    = "get_transaction_proof"
	GetSettlementBreakdown = "get_settlement_breakdown"
	GetBankMatch           = "get_bank_match"
	GetPaymentGaps         = "get_payment_gaps"
	GetFreshnessStatus     = "get_freshness_status"
)

func LegacyNames() []string {
	return []string{GetTransactionProof, GetSettlementBreakdown, GetBankMatch, GetPaymentGaps, GetFreshnessStatus}
}

type OutcomeClient struct {
	BaseURL             string
	Token               string
	EvidenceBaseURL     string
	EvidenceInternalKey string
	HTTP                *http.Client
}

func NewOutcomeClient(baseURL, token string) *OutcomeClient {
	return &OutcomeClient{BaseURL: strings.TrimRight(baseURL, "/"), Token: token, HTTP: &http.Client{Timeout: 10 * time.Second}}
}

func (c *OutcomeClient) WithEvidence(baseURL, internalKey string) *OutcomeClient {
	c.EvidenceBaseURL = strings.TrimRight(baseURL, "/")
	c.EvidenceInternalKey = internalKey
	return c
}

func (c *OutcomeClient) get(path string, q url.Values) (map[string]any, error) {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("outcome-engine HTTP %d", resp.StatusCode)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *OutcomeClient) post(path string, q url.Values, payload any) (map[string]any, error) {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("outcome-engine HTTP %d", resp.StatusCode)
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *OutcomeClient) CreateInvestigation(tenantID, connectorID, exceptionID, entityID string) (map[string]any, error) {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return c.post("/v1/reconciliation/investigations", q, map[string]string{
		"exception_id": exceptionID,
		"entity_id":    entityID,
	})
}

func (c *OutcomeClient) getOptional(path string, q url.Values) (map[string]any, error) {
	body, err := c.get(path, q)
	if err != nil {
		return map[string]any{
			"error":   "not_found",
			"message": "No record was returned. Do not invent one.",
		}, nil
	}
	return body, nil
}

func (c *OutcomeClient) TransactionProof(tenantID, connectorID, paymentID string) (map[string]any, error) {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return c.get("/v1/merchant/transactions/"+paymentID+"/proof", q)
}

func (c *OutcomeClient) BankMatch(tenantID, connectorID, paymentID string) (map[string]any, error) {
	return c.TransactionProof(tenantID, connectorID, paymentID)
}

func (c *OutcomeClient) SettlementBreakdown(tenantID, connectorID, settlementID string) (map[string]any, error) {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return c.get("/v1/merchant/settlements/"+settlementID+"/breakdown", q)
}

func (c *OutcomeClient) PaymentGaps(tenantID, connectorID string) (map[string]any, error) {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return c.get("/v1/merchant/reconciliation/gaps", q)
}

func (c *OutcomeClient) FreshnessStatus(tenantID, connectorID string) (map[string]any, error) {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	return c.get("/v1/merchant/freshness", q)
}

// BankCreditProven reports whether proof JSON marks bank_credited as proven.
func BankCreditProven(proof map[string]any) bool {
	data, _ := proof["data"].(map[string]any)
	if data == nil {
		return false
	}
	summary, _ := data["proof_summary"].(map[string]any)
	v, _ := summary["bank_credited"].(string)
	return v == "proven"
}
