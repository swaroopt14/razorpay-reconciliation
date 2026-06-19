package routes

import (
	"net/http"
	"zord-evidence/handlers"

	"github.com/gin-gonic/gin"
)

// RegisterProofRoutes adds the spec §4–§7 enrichment, timeline, lineage,
// verify, and dispute-export endpoints. It is called from main() in addition
// to the existing Register() call — no existing routes are touched.
func RegisterProofRoutes(r *gin.Engine, ph *handlers.ProofHandler) {
	v1 := r.Group("/v1/evidence")
	{
		// Spec §4: enriched pack with proof status + score
		v1.GET("/packs/:packID", ph.GetEnrichedPack)
		// Spec §5 Engine A: operational timeline
		v1.GET("/packs/:packID/timeline", ph.GetTimeline)
		// Spec §5 Engine B: Merkle DAG lineage graph
		v1.GET("/packs/:packID/lineage-graph", ph.GetLineageGraph)
		// Spec §7: cryptographic verification
		v1.POST("/packs/:packID/verify", ph.VerifyPack)
	}
	// Spec §6: dispute export (separate path prefix as per spec)
	r.POST("/v1/dispute/export", ph.DisputeExport)
	// Spec §6 preview: structured JSON view, no file download
	// GET /v1/dispute/export/preview?export_type=FINANCE_SUMMARY&tenant_id=...&evidence_pack_id=...
	r.GET("/v1/dispute/export/preview", ph.ExportPreview)
}

func Register(r *gin.Engine, h *handlers.EvidenceHandler, outboxHandler *handlers.OutboxHandler) {
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	v1 := r.Group("/v1/evidence")
	{
		// §13: Pack generation and retrieval
		v1.POST("/packs", h.GenerateEvidencePack)
		v1.GET("/packs", h.ListEvidencePacks) // ?tenant_id=&intent_id=  §17

		v1.GET("/packs/:packID/old", h.GetEvidencePack)

		// §18: role-specific projections — merchant, psp, bank, nbfc
		v1.GET("/packs/:packID/views/:viewType", h.GetEvidencePackView)

		// §14.4: Merkle inclusion proofs for selective disclosure
		v1.GET("/packs/:packID/inclusion-proofs", h.GetInclusionProofs)

		// List all intent-level evidence packs for a specific batch
		v1.GET("/batch/:batchID/intents", h.ListIntentPacksByBatch)

		// Get the batch-level summary evidence pack
		v1.GET("/batch/:batchID", h.GetBatchEvidencePack)

		// Get the batch-level lineage graph
		v1.GET("/batch/:batchID/lineage-graph", h.GetBatchLineageGraph)

		// §17: Replay and equivalence check
		v1.POST("/replay", h.ReplayEvidencePack)
	}

	internal := r.Group("/internal/outbox")
	{
		internal.GET("/lease", outboxHandler.Lease)
		internal.POST("/ack", outboxHandler.Ack)
		internal.POST("/nack", outboxHandler.Nack)
	}
}
