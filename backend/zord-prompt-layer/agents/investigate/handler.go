package investigate

import (
	"net/http"
	"strings"
	"sync"

	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/tools"

	"github.com/gin-gonic/gin"
)

type stored struct {
	State  *InvestigationState
	Report Report
}

type Handler struct {
	Client      *tools.OutcomeClient
	ConnectorID string
	Persist     bool
	mu          sync.Mutex
	byID        map[string]stored
}

func NewHandler(c *tools.OutcomeClient, connectorID string) *Handler {
	return &Handler{Client: c, ConnectorID: connectorID, Persist: true, byID: map[string]stored{}}
}

type createBody struct {
	ExceptionID string `json:"exception_id"`
	EntityType  string `json:"entity_type"`
	EntityID    string `json:"entity_id"`
	PaymentID   string `json:"payment_id"`
	PayoutID    string `json:"payout_id"`
}

type batchBody struct {
	ReconciliationRunID string `json:"reconciliation_run_id"`
	MaxCases            int    `json:"max_cases"`
	MinFinancialImpact  int64  `json:"min_financial_impact"`
}

func (h *Handler) Create(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	var body createBody
	_ = c.ShouldBindJSON(&body)
	if body.EntityID == "" {
		body.EntityID = body.PaymentID
	}
	if body.EntityID == "" {
		body.EntityID = body.PayoutID
	}
	if body.ExceptionID == "" && body.EntityID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "exception_id or entity_id is required"})
		return
	}
	req := Request{
		TenantID:    tenantID,
		ConnectorID: h.ConnectorID,
		ExceptionID: body.ExceptionID,
		EntityType:  body.EntityType,
		EntityID:    body.EntityID,
		Limits:      DefaultLimits(),
		Persist:     h.Persist,
	}
	st := Run(h.Client, req)
	rep := persistIfRequested(h.Client, req, BuildReport(st), st)
	h.put(rep, st)
	c.JSON(http.StatusOK, rep)
}

func (h *Handler) Get(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	item, found := h.get(c.Param("id"))
	if !found || (item.Report.TenantID != "" && item.Report.TenantID != tenantID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, item.Report)
}

func (h *Handler) Trace(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	item, found := h.get(c.Param("id"))
	if !found || (item.Report.TenantID != "" && item.Report.TenantID != tenantID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	if item.Report.Trace == nil {
		c.JSON(http.StatusOK, gin.H{"investigation_id": item.Report.InvestigationID, "plan": []string{}, "tool_calls": []ToolCall{}, "hypotheses": []Hypothesis{}})
		return
	}
	c.JSON(http.StatusOK, item.Report.Trace)
}

func (h *Handler) Run(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	item, found := h.get(c.Param("id"))
	if !found || (item.Report.TenantID != "" && item.Report.TenantID != tenantID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	rep := item.Report
	if item.State != nil && item.State.Status != StatusCompleted && item.State.Status != StatusRefused {
		rep = Resume(h.Client, item.State, h.Persist)
	}
	h.put(rep, item.State)
	c.JSON(http.StatusOK, rep)
}

func (h *Handler) BatchHTTP(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	var body batchBody
	_ = c.ShouldBindJSON(&body)
	sum := Batch(h.Client, BatchRequest{
		TenantID:            tenantID,
		ConnectorID:         h.ConnectorID,
		MaxCases:            body.MaxCases,
		MinFinancialImpact:  body.MinFinancialImpact,
		ReconciliationRunID: body.ReconciliationRunID,
		Persist:             h.Persist,
		Limits:              DefaultLimits(),
	})
	for _, rep := range sum.Investigations {
		h.put(rep, nil)
	}
	c.JSON(http.StatusOK, sum)
}

func (h *Handler) put(rep Report, st *InvestigationState) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.byID == nil {
		h.byID = map[string]stored{}
	}
	h.byID[rep.InvestigationID] = stored{State: st, Report: rep}
}

func (h *Handler) get(id string) (stored, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	item, ok := h.byID[id]
	return item, ok
}

func tenantFrom(c *gin.Context) (string, bool) {
	ctxTenant, ok := c.Get(plmiddleware.TenantIDContextKey)
	if !ok {
		plmiddleware.SafeError(c, http.StatusUnauthorized, "unauthorized", "Missing tenant context. Please login again.")
		return "", false
	}
	tenantID, ok := ctxTenant.(string)
	if !ok || strings.TrimSpace(tenantID) == "" {
		plmiddleware.SafeError(c, http.StatusUnauthorized, "unauthorized", "Invalid tenant context. Please login again.")
		return "", false
	}
	return tenantID, true
}
