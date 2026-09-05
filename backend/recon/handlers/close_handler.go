package handlers

import (
	"net/http"
	"strings"

	"zord-outcome-engine/internal/auth"
	"zord-outcome-engine/internal/close"

	"github.com/gin-gonic/gin"
)

type CloseHandler struct {
	Service *close.Service
}

func (h *CloseHandler) Run(c *gin.Context) {
	if h == nil || h.Service == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "finance close not configured"})
		return
	}
	var body struct {
		TenantID       string `json:"tenant_id"`
		ConnectorID    string `json:"connector_id"`
		AccountID      string `json:"account_id"`
		BatchID        string `json:"batch_id"`
		MaxInvestigate int    `json:"max_investigate"`
	}
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
	if body.BatchID == "" {
		body.BatchID = strings.TrimSpace(c.Query("batch_id"))
	}
	if body.TenantID == "" || body.ConnectorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and connector_id are required"})
		return
	}
	if !auth.EnsureBodyTenant(c, body.TenantID) {
		return
	}
	rep, err := h.Service.Run(c.Request.Context(), close.RunRequest{
		TenantID: body.TenantID, ConnectorID: body.ConnectorID, AccountID: body.AccountID,
		BatchID: body.BatchID, MaxInvestigate: body.MaxInvestigate,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rep)
}

func (h *CloseHandler) Get(c *gin.Context) {
	if h == nil || h.Service == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "finance close not configured"})
		return
	}
	tenantID := strings.TrimSpace(c.Query("tenant_id"))
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id is required"})
		return
	}
	rep, err := h.Service.Get(c.Request.Context(), tenantID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, rep)
}

func (h *CloseHandler) Accuracy(c *gin.Context) {
	if h == nil || h.Service == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "finance close not configured"})
		return
	}
	tenantID := strings.TrimSpace(c.Query("tenant_id"))
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id is required"})
		return
	}
	acc, err := h.Service.Accuracy(c.Request.Context(), tenantID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, acc)
}
