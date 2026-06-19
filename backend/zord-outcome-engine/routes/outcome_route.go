package routes

import (
	"zord-outcome-engine/handlers"

	"github.com/gin-gonic/gin"
)

func Routes(router *gin.Engine, h *handlers.Handler) {

	router.GET("/v1/health", handlers.HealthCheck)
	router.POST("/v1/settlement/upload", h.SettlementUploadHandler)

	// Job status query — allows callers to re-check progress after upload.
	router.GET("/v1/settlement/jobs/:job_id", h.GetSettlementJobHandler)
	// Supported PSPs — returns the live list of registered PSP keys and their file formats.
	router.GET("/v1/settlement/supported-psps", handlers.GetSupportedPSPs)

	router.GET("/v1/settlement/errors", handlers.SettlementParseErrors)
	// 2-mode batch observations endpoint:
	// 1) tenant_id only -> list client_batch_id values
	// 2) tenant_id + client_batch_id -> full canonical settlement observation rows
	router.GET("/v1/settlement/observations/batches", h.GetSettlementObservationBatchesHandler)
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
