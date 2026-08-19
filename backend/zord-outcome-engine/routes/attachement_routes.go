package routes

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT ROUTES
//
// All Service 5C routes are registered here, separate from the Service 5B
// settlement ingestion routes in outcome_route.go.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"zord-outcome-engine/handlers"
	"zord-outcome-engine/internal/auth"

	"github.com/gin-gonic/gin"
)

// AttachmentRoutes registers all Service 5C HTTP endpoints on the given router.
// Called from main.go after Routes() so the two service surfaces are cleanly separated.
func AttachmentRoutes(router *gin.Engine, h *handlers.Handler) {
	protected := router.Group("/v1")
	protected.Use(auth.GinProtect())
	{
		protected.POST("/attachment/run", h.RunAttachmentHandler)
		protected.GET("/attachment/decision/intent/:intent_id", h.GetAttachmentDecisionByIntentHandler)
		protected.GET("/attachment/batch/:batch_ref", h.GetBatchAttachmentSummaryHandler)
		protected.POST("/intent", h.RegisterIntentHandler)
	}
}
