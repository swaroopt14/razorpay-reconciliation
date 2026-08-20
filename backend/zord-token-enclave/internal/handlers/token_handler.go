package handlers

import (
	"net/http"

	"zord-token-enclave/internal/crypto"
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
		TraceID       string            `json:"trace_id"`
		ObjectRef     string            `json:"object_ref"`
		CorrelationID string            `json:"correlation_id"`
		PII           map[string]string `json:"pii"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// TOK-04: tenant_id/caller/purpose_code come SOLELY from the verified
	// service JWT (set by serviceAuthMiddleware) -- never from the request
	// body. object_ref/correlation_id are still caller-supplied (they're
	// tracing identifiers, not identity/authorization claims) but are now
	// mandatory ("enforce object_ref and correlation"); a missing one is
	// denied and audited, not silently allowed through.
	tenantID := c.GetString("tenant_id")
	actor := c.GetString("caller_id")
	purposeCode := c.GetString("purpose_code")

	if len(req.PII) == 0 || req.ObjectRef == "" || req.CorrelationID == "" {
		h.svc.WriteAuthzDenialAudit(c.Request.Context(), tenantID, actor, "AUTHZ_DENIED",
			purposeCode, req.ObjectRef, req.CorrelationID, "pii, object_ref, and correlation_id are required")
		c.JSON(http.StatusBadRequest, gin.H{"error": "pii, object_ref, and correlation_id are required"})
		return
	}

	tokens, err := h.svc.TokenizePII(
		c.Request.Context(),
		tenantID,
		req.TraceID,
		actor,
		req.PII,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// TOK-08: normalization_version is purely additive -- existing callers
	// that don't read this field are unaffected. Every tokenize call in a
	// given deployed build uses the same active version uniformly.
	c.JSON(http.StatusOK, gin.H{
		"tokens":                tokens,
		"normalization_version": crypto.CurrentNormalizationVersion,
	})
}
