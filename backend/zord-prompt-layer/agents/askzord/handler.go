package askzord

import (
	"net/http"
	"strings"
	"sync"

	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/tools"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Client      *tools.OutcomeClient
	ConnectorID string
	mu          sync.Mutex
	lastEntity  map[string]EntityRef
}

func NewHandler(c *tools.OutcomeClient, connectorID string) *Handler {
	return &Handler{Client: c, ConnectorID: connectorID, lastEntity: map[string]EntityRef{}}
}

func (h *Handler) Query(c *gin.Context) {
	tenantID, ok := tenantFrom(c)
	if !ok {
		return
	}
	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Question) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "question is required"})
		return
	}
	inherit := req.Inherit
	if inherit.ID == "" && req.ConversationID != "" {
		h.mu.Lock()
		inherit = h.lastEntity[req.ConversationID]
		h.mu.Unlock()
	}
	resp := Ask(h.Client, tenantID, h.ConnectorID, req.Question, inherit)
	plan := Plan(req.Question, inherit)
	if plan.Entity.ID != "" && req.ConversationID != "" {
		h.mu.Lock()
		h.lastEntity[req.ConversationID] = plan.Entity
		h.mu.Unlock()
	}
	c.JSON(http.StatusOK, resp)
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
