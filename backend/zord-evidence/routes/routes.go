package routes

import (
	"net/http"
	"zord-evidence/handlers"
	"zord-evidence/internal/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterProofRoutes adds the spec §4–§7 enrichment, timeline, lineage,
// verify, and dispute-export endpoints. It is called from main() in addition
// to the existing Register() call — no existing routes are touched.
func RegisterProofRoutes(r *gin.Engine, ph *handlers.ProofHandler, jwtSecret string) {
	v1 := r.Group("/v1/evidence", middleware.RequireAuth(jwtSecret))
	{
		// Spec §4: enriched pack with proof status + score
		v1.GET("/packs/:packID", ph.GetEnrichedPack)
		// Spec §5 Engine A: operational timeline
		v1.GET("/packs/:packID/timeline", ph.GetTimeline)
		// Spec §5 Engine B: Merkle DAG lineage graph
		v1.GET("/packs/:packID/lineage-graph", ph.GetLineageGraph)
		// Spec §7: cryptographic verification
		v1.POST("/packs/:packID/verify", ph.VerifyPack)
		// Immutable audit trail of past /verify calls for this pack
		v1.GET("/packs/:packID/verification-runs", ph.GetVerificationRuns)
		// P2-02: export audit log (admin/ops)
		v1.GET("/packs/:packID/exports", ph.ListPackExports)
	}
	// Spec §6: dispute export (separate path prefix as per spec)
	dispute := r.Group("/v1/dispute", middleware.RequireAuth(jwtSecret))
	{
		dispute.POST("/export", ph.DisputeExport)
		// Spec §6 preview: structured JSON view, no file download
		// GET /v1/dispute/export/preview?export_type=FINANCE_SUMMARY&tenant_id=...&evidence_pack_id=...
		dispute.GET("/export/preview", ph.ExportPreview)
	}
}

func Register(r *gin.Engine, h *handlers.EvidenceHandler, outboxHandler *handlers.OutboxHandler, internalKey string, jwtSecret string) {
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	v1 := r.Group("/v1/evidence", middleware.RequireAuth(jwtSecret))
	{
		// Public read-only endpoints
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

	// Internal-only: pack generation is forbidden from public callers.
	// Only accessible with a valid X-Internal-Key header (admin recovery).
	internalV1 := r.Group("/internal/evidence", middleware.RequireInternalKey(internalKey))
	{
		internalV1.POST("/packs", h.AdminRecoverEvidencePack)
	}

	internal := r.Group("/internal/outbox")
	{
		internal.GET("/lease", outboxHandler.Lease)
		internal.POST("/ack", outboxHandler.Ack)
		internal.POST("/nack", outboxHandler.Nack)
	}
}
