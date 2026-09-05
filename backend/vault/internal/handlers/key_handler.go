package handlers

import (
	"zord-token-enclave/internal/services"

	"github.com/gin-gonic/gin"
)

type KeyHandler struct {
	svc *services.TokenService
}

func NewKeyHandler(s *services.TokenService) *KeyHandler {
	return &KeyHandler{svc: s}
}

func (h *KeyHandler) RotateKey(c *gin.Context) {

	var req struct {
		TenantID string `json:"tenant_id"`
		Actor    string `json:"actor"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	rotated, err := h.svc.RotateKey(c.Request.Context(), req.TenantID, req.Actor)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if !rotated {
		// Another replica is already rotating this tenant right now
		// (TOK-07 advisory lock) -- not a failure, just not our turn.
		c.JSON(409, gin.H{"error": "rotation already in progress for this tenant"})
		return
	}

	c.JSON(200, gin.H{"status": "key rotated"})
}
