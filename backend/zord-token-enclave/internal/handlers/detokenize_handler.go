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

// DetokenizeRequest requires caller context for every detokenize call.
// No anonymous detokenization is permitted.
type DetokenizeRequest struct {
	TenantID      string            `json:"tenant_id"`
	Caller        string            `json:"caller"`        // service principal
	PurposeCode   string            `json:"purpose_code"`  // declared purpose
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

	// All four context fields are mandatory
	if req.TenantID == "" || req.Caller == "" || req.PurposeCode == "" || req.ObjectRef == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "tenant_id, caller, purpose_code, and object_ref are required",
		})
		return
	}

	if len(req.Tokens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tokens map must not be empty"})
		return
	}

	dctx := services.DetokenizeContext{
		TenantID:      req.TenantID,
		Caller:        req.Caller,
		PurposeCode:   req.PurposeCode,
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
