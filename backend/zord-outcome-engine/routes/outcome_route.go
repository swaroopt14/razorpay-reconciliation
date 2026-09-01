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

func ReconRoutes(router *gin.Engine, h *handlers.ReconHandler, imp *handlers.ImportHandler) {
	protected := router.Group("/v1")
	protected.Use(auth.GinProtect())
	{
		protected.POST("/bank-statements/upload", imp.OneShotBankUpload)
		protected.GET("/bank-statements/:upload_id", h.GetUpload)
		protected.POST("/merchant/imports", imp.Upload)
		protected.GET("/merchant/imports/:import_id", imp.Get)
		protected.POST("/merchant/imports/:import_id/validate", imp.Validate)
		protected.GET("/merchant/imports/:import_id/rows", imp.Rows)
		protected.POST("/merchant/imports/:import_id/commit", imp.Commit)
		protected.POST("/merchant/imports/:import_id/cancel", imp.Cancel)
		protected.GET("/merchant/transactions/:payment_id/proof", h.GetProof)
		protected.GET("/merchant/transactions", h.Transactions)
		protected.GET("/merchant/reconciliation/summary", h.Summary)
		protected.GET("/merchant/reconciliation/gaps", h.Gaps)
		protected.GET("/merchant/settlements/:settlement_id/breakdown", h.Breakdown)
		protected.GET("/merchant/freshness", h.Freshness)
		protected.GET("/merchant/evidence/:id/verify", h.VerifyEvidence)
		protected.GET("/merchant/ask/proof", h.AskProof)
	}
	internal := router.Group("/internal")
	{
		internal.POST("/recon/run", h.Run)
		internal.GET("/recon/gaps", h.InternalGaps)
	}
}

func BackfillRoutes(router *gin.Engine, h *handlers.BackfillHandler) {
	internal := router.Group("/internal")
	{
		internal.POST("/backfill/payments", h.CreatePayments)
		internal.POST("/backfill/settlements", h.CreateSettlements)
		internal.GET("/backfill/jobs/:job_id", h.GetJob)
		internal.POST("/backfill/jobs/:job_id/resume", h.ResumeJob)
		internal.POST("/backfill/jobs/:job_id/cancel", h.CancelJob)
		internal.GET("/freshness/:job_id", h.GetFreshness)
	}
}
