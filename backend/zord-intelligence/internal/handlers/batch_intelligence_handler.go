package handlers

// batch_intelligence_handler.go
//
// GET /v1/intelligence/batches/{batch_id}/intelligence?tenant_id=X
//
// Serves all four batch-scoped intelligence layers (LEAKAGE, AMBIGUITY,
// DEFENSIBILITY, RECOMMENDATION) for one batch in a single response.
//
// NOTE ON ROUTE PATH: /v1/intelligence/batches/{batch_id} is already taken by
// BatchHandler.GetBatch (the batch_contracts row + batch.health projection).
// This endpoint is registered at .../batches/{batch_id}/intelligence to avoid
// colliding with that existing route.

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// BatchIntelligenceResponse bundles all four batch-scoped intelligence layers
// for one batch into a single response.
type BatchIntelligenceResponse struct {
	BatchID        string               `json:"batch_id"`
	TenantID       string               `json:"tenant_id"`
	Leakage        intelligenceResponse `json:"leakage"`
	Ambiguity      intelligenceResponse `json:"ambiguity"`
	Defensibility  intelligenceResponse `json:"defensibility"`
	Recommendation intelligenceResponse `json:"recommendation"`
}

// BatchIntelligenceHandler serves GET /v1/intelligence/batches/{batch_id}/intelligence.
type BatchIntelligenceHandler struct {
	base *IntelligenceBase
}

// NewBatchIntelligenceHandler creates a BatchIntelligenceHandler.
func NewBatchIntelligenceHandler(base *IntelligenceBase) *BatchIntelligenceHandler {
	return &BatchIntelligenceHandler{base: base}
}

// GetBatchIntelligence handles GET /v1/intelligence/batches/{batch_id}/intelligence?tenant_id=X
func (h *BatchIntelligenceHandler) GetBatchIntelligence(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	batchID := chi.URLParam(r, "batch_id")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID == "" {
		writeError(w, http.StatusBadRequest, "batch_id is required")
		return
	}

	resp := BatchIntelligenceResponse{
		BatchID:        batchID,
		TenantID:       tenantID,
		Leakage:        h.base.buildSnapshotResponse(r, tenantID, "LEAKAGE", "BATCH", &batchID),
		Ambiguity:      h.base.buildSnapshotResponse(r, tenantID, "AMBIGUITY", "BATCH", &batchID),
		Defensibility:  h.base.buildSnapshotResponse(r, tenantID, "DEFENSIBILITY", "BATCH", &batchID),
		Recommendation: h.base.buildSnapshotResponse(r, tenantID, "RECOMMENDATION", "BATCH", &batchID),
	}

	writeJSON(w, http.StatusOK, resp)
}
