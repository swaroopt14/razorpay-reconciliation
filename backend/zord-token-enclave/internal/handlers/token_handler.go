package handlers

import (
	"net/http"

	"zord-token-enclave/internal/services"

	"github.com/gin-gonic/gin"
)

type TokenHandler struct {
	svc *services.TokenService
}

func NewTokenHandler(s *services.TokenService) *TokenHandler {
	return &TokenHandler{svc: s}
}

func (h *TokenHandler) Tokenize(c *gin.Context) {
	var req struct {
		TenantID string            `json:"tenant_id"`
		TraceID  string            `json:"trace_id"`
		PII      map[string]string `json:"pii"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.TenantID == "" || len(req.PII) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and pii required"})
		return
	}

	// Actor comes from the authenticated caller header (set by middleware)
	actor := c.GetString("caller_id")
	if actor == "" {
		actor = c.GetHeader("X-Zord-Caller-ID")
	}
	if actor == "" {
		actor = "unknown"
	}

	tokens, err := h.svc.TokenizePII(
		c.Request.Context(),
		req.TenantID,
		req.TraceID,
		actor,
		req.PII,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}
