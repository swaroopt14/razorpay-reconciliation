package handler

import (
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"zord-prompt-layer/dto"
	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/services"
)

type QueryHandler struct {
	rag services.RAGService
}

var sessionUUIDRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

const sessionHeader = "X-Session-ID"

func NewQueryHandler(rag services.RAGService) *QueryHandler {
	return &QueryHandler{rag: rag}
}

func (h *QueryHandler) Query(c *gin.Context) {
	var req dto.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request",
			"details": err.Error(),
		})
		return
	}
	ctxTenant, ok := c.Get(plmiddleware.TenantIDContextKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"details": "Missing tenant context. Please login again.",
		})
		return
	}
	tenantID, ok := ctxTenant.(string)
	if !ok || strings.TrimSpace(tenantID) == "" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "forbidden",
			"details": "Invalid tenant context.",
		})
		return
	}
	ctxUser, ok := c.Get(plmiddleware.UserIDContextKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"details": "Missing user context. Please login again.",
		})
		return
	}
	userID, ok := ctxUser.(string)
	if !ok || strings.TrimSpace(userID) == "" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "forbidden",
			"details": "Invalid user context.",
		})
		return
	}
	// Optional hardening: if body tenant_id is sent and mismatches auth tenant, reject.
	if strings.TrimSpace(req.TenantID) != "" && !strings.EqualFold(strings.TrimSpace(req.TenantID), tenantID) {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "forbidden",
			"details": "Tenant mismatch with authenticated context.",
		})
		return
	}

	// Canonical tenant is always from auth context.
	sessionID := strings.TrimSpace(c.GetHeader(sessionHeader))
	if !sessionUUIDRe.MatchString(sessionID) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request",
			"details": "x-session-id header must be a valid UUID v4.",
		})
		return
	}
	req.SessionID = strings.ToLower(sessionID)
	req.TenantID = tenantID
	req.UserID = userID
	if req.TopK <= 0 {
		req.TopK = 5
	}

	resp, err := h.rag.Query(req)
	if err != nil {
		log.Printf(
			"[prompt-layer][query] failed tenant=%s user=%s session=%s err=%v",
			tenantID,
			userID,
			req.SessionID,
			err,
		)

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "query failed",
			"details": "Prompt-layer could not complete the request safely. Please retry or contact support with server logs.",
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}
