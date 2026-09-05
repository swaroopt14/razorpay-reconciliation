package handlers

import (
	"net/http"
	"strings"
	"zord-evidence/internal/middleware"
	"zord-evidence/models"
	"zord-evidence/services"

	"github.com/gin-gonic/gin"
)

type EvidenceHandler struct {
	svc *services.EvidenceService
}

func NewEvidenceHandler(svc *services.EvidenceService) *EvidenceHandler {
	return &EvidenceHandler{svc: svc}
}

// POST /internal/evidence/packs — admin-only recovery: regenerate a pack from
// the trusted pending-leaf set already committed to the DB via the Kafka pipeline.
// Caller supplies only tenant_id + intent_id — NO hashes or items accepted.
// Protected by RequireInternalKey middleware; never reachable via public routes.
func (h *EvidenceHandler) AdminRecoverEvidencePack(c *gin.Context) {
	var req struct {
		TenantID string `json:"tenant_id" binding:"required"`
		IntentID string `json:"intent_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pack, err := h.svc.GeneratePackFromTrustedLeaves(c.Request.Context(), req.TenantID, req.IntentID)
	if err != nil {
		if strings.Contains(err.Error(), "no trusted leaves") ||
			strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, pack)
}

// GET /v1/evidence/packs/:packID — fetch a specific pack
func (h *EvidenceHandler) GetEvidencePack(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if pack.TenantID != tenantID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cross-tenant access denied"})
		return
	}
	c.JSON(http.StatusOK, pack)
}

// GET /v1/evidence/packs — list packs by intent_id or client_batch_id (spec §17)
// Query params: intent_id or client_batch_id (tenant_id derived from JWT)
func (h *EvidenceHandler) ListEvidencePacks(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	intentID := strings.TrimSpace(c.Query("intent_id"))
	clientBatchID := strings.TrimSpace(c.Query("client_batch_id"))

	if intentID == "" && clientBatchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "either intent_id or client_batch_id query param is required"})
		return
	}

	var resp *models.ListPacksResponse
	var err error

	if intentID != "" {
		resp, err = h.svc.ListPacksByIntentID(c.Request.Context(), tenantID, intentID)
	} else if clientBatchID != "" {
		resp, err = h.svc.ListPacksByBatchID(c.Request.Context(), tenantID, clientBatchID)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "intent_id or client_batch_id required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GET /v1/evidence/batch/:batchID/intents — list intent-level packs for a batch
func (h *EvidenceHandler) ListIntentPacksByBatch(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	batchID := c.Param("batchID")

	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batchID path param is required"})
		return
	}

	resp, err := h.svc.ListIntentPacksByBatchID(c.Request.Context(), tenantID, batchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GET /v1/evidence/batch/:batchID — fetch the batch-level summary pack
func (h *EvidenceHandler) GetBatchEvidencePack(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	batchID := c.Param("batchID")

	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batchID path param is required"})
		return
	}

	pack, err := h.svc.GetPackForBatch(c.Request.Context(), tenantID, batchID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "batch evidence pack not found: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, pack)
}

// GET /v1/evidence/batch/:batchID/lineage-graph — fetch the batch-level lineage graph
func (h *EvidenceHandler) GetBatchLineageGraph(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	batchID := c.Param("batchID")

	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batchID path param is required"})
		return
	}

	pack, err := h.svc.GetPackForBatch(c.Request.Context(), tenantID, batchID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "batch evidence pack not found: " + err.Error()})
		return
	}

	graph := services.BuildLineageGraph(pack)
	c.JSON(http.StatusOK, graph)
}

// GET /v1/evidence/packs/:packID/views/:viewType — role-specific projection (spec §18)
func (h *EvidenceHandler) GetEvidencePackView(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	packID := c.Param("packID")
	viewType := c.Param("viewType")

	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if pack.TenantID != tenantID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cross-tenant access denied"})
		return
	}

	view, err := h.svc.GetPackView(c.Request.Context(), packID, viewType)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported view_type") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

// GET /v1/evidence/packs/:packID/inclusion-proofs — selective disclosure (spec §14.4)
func (h *EvidenceHandler) GetInclusionProofs(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	packID := c.Param("packID")

	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if pack.TenantID != tenantID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cross-tenant access denied"})
		return
	}

	proofs, err := h.svc.GetInclusionProofs(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"evidence_pack_id": packID, "inclusion_proofs": proofs})
}

// POST /v1/evidence/replay — replay a pack and compare Merkle root (spec §17)
func (h *EvidenceHandler) ReplayEvidencePack(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	var req models.ReplayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TenantID != tenantID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cross-tenant replay denied"})
		return
	}

	resp, err := h.svc.ReplayPack(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
