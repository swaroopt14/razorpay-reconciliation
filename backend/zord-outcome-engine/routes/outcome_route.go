package routes

import (
	"zord-outcome-engine/handlers"
	"zord-outcome-engine/internal/auth"

	"github.com/gin-gonic/gin"
)

func Routes(router *gin.Engine, h *handlers.Handler) {

	router.GET("/v1/health", handlers.HealthCheck)
	router.GET("/v1/settlement/supported-psps", handlers.GetSupportedPSPs)

	// OUT-01: tenant-scoped settlement routes require verified JWT + tenant match.
	protected := router.Group("/v1")
	protected.Use(auth.GinProtect())
	{
		protected.POST("/settlement/upload", h.SettlementUploadHandler)
		protected.GET("/settlement/jobs/:job_id", h.GetSettlementJobHandler)
		protected.GET("/settlement/errors", handlers.SettlementParseErrors)
		protected.GET("/settlement/observations/batches", h.GetSettlementObservationBatchesHandler)
	}
}

// OutboxRoutes registers the internal relay-facing endpoints that zord-relay
// polls to lease, acknowledge, and nack outcome_outbox events.
// All three handlers are net/http compatible and wrapped via gin.WrapF.
func OutboxRoutes(router *gin.Engine, h *handlers.OutboxHandler) {
	internal := router.Group("/internal/outbox")
	{
		// GET /internal/outbox/lease?limit=500&lease_ttl_seconds=120
		internal.GET("/lease", gin.WrapF(h.Lease))
		// POST /internal/outbox/ack  body: { lease_id, event_ids }
		internal.POST("/ack", gin.WrapF(h.Ack))
		// POST /internal/outbox/nack body: { lease_id, event_ids }
		internal.POST("/nack", gin.WrapF(h.Nack))
	}
}
