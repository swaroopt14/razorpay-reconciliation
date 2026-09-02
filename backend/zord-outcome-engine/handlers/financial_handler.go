package handlers

import (
	"net/http"
	"strings"

	"zord-outcome-engine/internal/auth"
	"zord-outcome-engine/internal/recon"

	"github.com/gin-gonic/gin"
)

type FinancialHandler struct {
	Service *recon.FinancialService
	Store   recon.FinancialStore
}

func (h *FinancialHandler) Run(c *gin.Context) {
	var body reconRunBody
	_ = c.ShouldBindJSON(&body)
	if body.TenantID == "" {
		body.TenantID = strings.TrimSpace(c.Query("tenant_id"))
	}
	if body.ConnectorID == "" {
		body.ConnectorID = strings.TrimSpace(c.Query("connector_id"))
	}
	if body.AccountID == "" {
		body.AccountID = strings.TrimSpace(c.Query("account_id"))
	}
	if body.TenantID == "" || body.ConnectorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and connector_id are required"})
		return
	}
	if !auth.EnsureBodyTenant(c, body.TenantID) {
		return
	}
	h.run(c, body, false)
}

func (h *FinancialHandler) InternalRun(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var body reconRunBody
	_ = c.ShouldBindJSON(&body)
	if body.TenantID == "" {
		body.TenantID = strings.TrimSpace(c.Query("tenant_id"))
	}
	if body.ConnectorID == "" {
		body.ConnectorID = strings.TrimSpace(c.Query("connector_id"))
	}
	if body.AccountID == "" {
		body.AccountID = strings.TrimSpace(c.Query("account_id"))
	}
	h.run(c, body, true)
}

func (h *FinancialHandler) run(c *gin.Context, body reconRunBody, _ bool) {
	if h == nil || h.Service == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "financial recon not configured"})
		return
	}
	run, results, err := h.Service.Run(c.Request.Context(), recon.FinancialRunRequest{
		TenantID: body.TenantID, ConnectorID: body.ConnectorID, AccountID: body.AccountID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"run_id":           run.ID,
		"status":           run.Status,
		"payment_count":    run.PaymentCount,
		"matched_count":    run.MatchedCount,
		"exception_count":  run.ExceptionCount,
		"counts":           run.Counts,
		"result_count":     len(results),
		"rule_version":     recon.FinancialRuleVersion,
	})
}

func (h *FinancialHandler) GetRun(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	_ = connectorID
	run, err := h.Store.GetReconciliationRun(c.Request.Context(), tenantID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": run})
}

func (h *FinancialHandler) GetPayment(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	pay, fr, found, err := h.Service.GetPayment(c.Request.Context(), tenantID, connectorID, c.Param("payment_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status": pay.CanonicalStatus,
		"provider_status": pay.ProviderStatus,
		"payment_id": pay.PaymentID,
		"amount_minor": pay.AmountMinor,
		"currency": pay.Currency,
		"captured": pay.Captured,
		"reconciliation": gin.H{
			"result":             fr.Result,
			"reason":             fr.Reason,
			"expected_amount":    fr.ExpectedAmount,
			"observed_amount":    fr.ObservedAmount,
			"variance_amount":    fr.VarianceAmount,
			"confidence":         fr.Confidence,
			"bank_credit_proven": fr.BankCreditProven,
		},
		"evidence_refs": fr.EvidenceRefs,
	})
}

func (h *FinancialHandler) GetPayout(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	po, fr, found, err := h.Service.GetPayout(c.Request.Context(), tenantID, connectorID, c.Param("payout_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	var events []recon.ObservationFact
	if h.Store != nil {
		events, _ = h.Store.ListPayoutObservationFacts(c.Request.Context(), tenantID, connectorID, po.PayoutID)
	}
	obs := make([]gin.H, 0, len(events))
	for _, ev := range events {
		obs = append(obs, gin.H{
			"source_event_id": ev.SourceEventID,
			"source_hash":     ev.SourceHash,
			"utr":             ev.RawReference,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"status":          po.ProviderStatus,
		"provider_status": po.ProviderStatus,
		"payout_id":       po.PayoutID,
		"amount_minor":    po.AmountMinor,
		"currency":        po.Currency,
		"utr":             po.UTR,
		"mode":            po.Mode,
		"status_reason":   po.StatusReason,
		"observations":    obs,
		"reconciliation": gin.H{
			"result":          fr.Result,
			"reason":          fr.Reason,
			"expected_amount": fr.ExpectedAmount,
			"observed_amount": fr.ObservedAmount,
			"variance_amount": fr.VarianceAmount,
			"confidence":      fr.Confidence,
		},
		"evidence_refs": fr.EvidenceRefs,
	})
}

func (h *FinancialHandler) GetPayoutEvidence(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	_, fr, found, err := h.Service.GetPayout(c.Request.Context(), tenantID, connectorID, c.Param("payout_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"payout_id":     c.Param("payout_id"),
		"evidence_refs": fr.EvidenceRefs,
		"evidence_ids":  recon.EvidenceIDList(fr.EvidenceRefs),
	})
}

func (h *FinancialHandler) SLAPolicy(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"policies": []gin.H{
			{"entity": "payout", "mode": "IMPS", "sla_minutes": 15},
			{"entity": "payout", "mode": "NEFT", "sla_minutes": 60},
			{"entity": "payment", "open_status_hours": 72},
		},
	})
}

func (h *FinancialHandler) GetEvidence(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	_, fr, found, err := h.Service.GetPayment(c.Request.Context(), tenantID, connectorID, c.Param("payment_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"payment_id":    c.Param("payment_id"),
		"evidence_refs": fr.EvidenceRefs,
		"evidence_ids":  recon.EvidenceIDList(fr.EvidenceRefs),
	})
}

func (h *FinancialHandler) ListExceptions(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	list, err := h.Store.ListReconciliationExceptions(c.Request.Context(), tenantID, connectorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	entity := strings.TrimSpace(c.Query("entity_type"))
	reason := strings.TrimSpace(c.Query("reason"))
	var out []recon.ReconciliationException
	for _, ex := range list {
		if entity != "" && !strings.EqualFold(ex.EntityType, entity) {
			continue
		}
		if reason != "" && ex.Reason != reason {
			continue
		}
		out = append(out, ex)
	}
	c.JSON(http.StatusOK, gin.H{"exceptions": out})
}

func (h *FinancialHandler) GetException(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	ex, found, err := h.Store.GetReconciliationException(c.Request.Context(), tenantID, connectorID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ex})
}

func (h *FinancialHandler) CreateInvestigation(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	var body struct {
		ExceptionID string `json:"exception_id"`
		EntityID    string `json:"entity_id"`
		PaymentID   string `json:"payment_id"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.EntityID == "" {
		body.EntityID = body.PaymentID
	}
	rec, err := h.Service.Investigate(c.Request.Context(), tenantID, connectorID, body.ExceptionID, body.EntityID)
	if err != nil {
		if recon.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

func (h *FinancialHandler) GetInvestigation(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	rec, found, err := h.Store.GetInvestigation(c.Request.Context(), tenantID, connectorID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_failed"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

func (h *FinancialHandler) SearchSettlements(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	lines, err := h.Store.ListSettlementLines(c.Request.Context(), tenantID, connectorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	pid := strings.TrimSpace(c.Query("payment_id"))
	lineType := strings.TrimSpace(c.Query("line_type"))
	var out []recon.SettlementLine
	for _, l := range lines {
		if pid != "" && l.PaymentID != pid && l.EntityID != pid {
			continue
		}
		if lineType != "" && !strings.EqualFold(l.LineType, lineType) {
			continue
		}
		out = append(out, l)
	}
	c.JSON(http.StatusOK, gin.H{"settlements": out})
}

func (h *FinancialHandler) SearchBank(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	banks, err := h.Store.ListBankTxns(c.Request.Context(), tenantID, connectorID, c.Query("account_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id := strings.TrimSpace(c.Query("id"))
	utr := strings.TrimSpace(c.Query("utr"))
	var out []recon.BankTxn
	for _, b := range banks {
		if id != "" && b.ID != id && b.BankTxnID != id {
			continue
		}
		if utr != "" && !strings.EqualFold(b.UTR, utr) && !strings.EqualFold(b.UTRRaw, utr) {
			continue
		}
		out = append(out, b)
	}
	c.JSON(http.StatusOK, gin.H{"bank_transactions": out})
}

func (h *FinancialHandler) GetBank(c *gin.Context) {
	tenantID, connectorID, ok := h.scope(c)
	if !ok {
		return
	}
	banks, err := h.Store.ListBankTxns(c.Request.Context(), tenantID, connectorID, c.Query("account_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id := c.Param("id")
	for _, b := range banks {
		if b.ID == id || b.BankTxnID == id {
			c.JSON(http.StatusOK, gin.H{"data": b})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
}

func (h *FinancialHandler) scope(c *gin.Context) (string, string, bool) {
	tenantID := strings.TrimSpace(c.Query("tenant_id"))
	connectorID := strings.TrimSpace(c.Query("connector_id"))
	if tenantID == "" || connectorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and connector_id are required"})
		return "", "", false
	}
	return tenantID, connectorID, true
}
