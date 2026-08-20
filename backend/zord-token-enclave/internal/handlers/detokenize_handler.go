package handlers

import (
	"net/http"

	"zord-token-enclave/internal/services"

	"github.com/gin-gonic/gin"
)

type DetokenizeHandler struct {
	svc *services.TokenService
}

func NewDetokenizeHandler(s *services.TokenService) *DetokenizeHandler {
	return &DetokenizeHandler{svc: s}
}

// DetokenizeRequest requires object_ref/correlation_id for every detokenize
// call. No anonymous detokenization is permitted. TOK-04: tenant_id, caller,
// and purpose_code are intentionally NOT part of this request shape anymore
// -- deriving them from a request body field is exactly the audit's "caller
// can be supplied by request body" vulnerability. They now come solely from
// the verified service JWT (serviceAuthMiddleware); a body-supplied value
// would never even be read.
type DetokenizeRequest struct {
	ObjectRef     string            `json:"object_ref"`    // intent_id or tx ref
	CorrelationID string            `json:"correlation_id"`
	Tokens        map[string]string `json:"tokens"` // field → token_id
}

func (h *DetokenizeHandler) Detokenize(c *gin.Context) {
	var req DetokenizeRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Verified claims (TOK-04) -- never trust these from the request body.
	tenantID := c.GetString("tenant_id")
	caller := c.GetString("caller_id")
	purposeCode := c.GetString("purpose_code")

	if req.ObjectRef == "" || req.CorrelationID == "" || len(req.Tokens) == 0 {
		h.svc.WriteAuthzDenialAudit(c.Request.Context(), tenantID, caller, "AUTHZ_DENIED",
			purposeCode, req.ObjectRef, req.CorrelationID, "object_ref, correlation_id, and a non-empty tokens map are required")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "object_ref, correlation_id, and a non-empty tokens map are required",
		})
		return
	}

	dctx := services.DetokenizeContext{
		TenantID:      tenantID,
		Caller:        caller,
		PurposeCode:   purposeCode,
		ObjectRef:     req.ObjectRef,
		CorrelationID: req.CorrelationID,
	}

	resp, err := h.svc.DetokenizeFields(c.Request.Context(), dctx, req.Tokens)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "detokenization failed"})
		// Do not echo err.Error() — never leak internal state on detokenize failure
		return
	}

	c.JSON(http.StatusOK, resp)
}
