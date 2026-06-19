package routes

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT ROUTES
//
// All Service 5C routes are registered here, separate from the Service 5B
// settlement ingestion routes in outcome_route.go.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"zord-outcome-engine/handlers"

	"github.com/gin-gonic/gin"
)

// AttachmentRoutes registers all Service 5C HTTP endpoints on the given router.
// Called from main.go after Routes() so the two service surfaces are cleanly separated.
func AttachmentRoutes(router *gin.Engine, h *handlers.Handler) {
	// ── Attachment engine ─────────────────────────────────────────────────
	//
	// POST /v1/attachment/run
	//   Trigger an attachment job (batch or single-observation scope).
	//   Body: { tenant_id, job_scope_type, settlement_batch_ref | settlement_observation_id }
	router.POST("/v1/attachment/run", h.RunAttachmentHandler)

	// ── Read endpoints ────────────────────────────────────────────────────
	//
	// GET /v1/attachment/decision/intent/:intent_id?tenant_id=uuid
	//   Fetch the latest attachment decision + variance for one canonical intent.
	router.GET("/v1/attachment/decision/intent/:intent_id", h.GetAttachmentDecisionByIntentHandler)

	// GET /v1/attachment/batch/:batch_ref?tenant_id=uuid
	//   Fetch the aggregated batch attachment summary for a settlement batch.
	router.GET("/v1/attachment/batch/:batch_ref", h.GetBatchAttachmentSummaryHandler)

	// ── Intent management ─────────────────────────────────────────────────
	//
	// POST /v1/intent
	//   Register (or upsert) a canonical intent for use by the matching engine.
	//   In production, intents would be replicated from Service 2.
	//   This endpoint exists for local testing and for organisations that submit
	//   intent-side data through this service directly.
	router.POST("/v1/intent", h.RegisterIntentHandler)
}
