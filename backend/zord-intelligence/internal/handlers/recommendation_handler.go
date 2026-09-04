package handlers

import (
	"net/http"
)

// RecommendationHandler serves the GET /v1/intelligence/recommendation endpoint.
type RecommendationHandler struct {
	base *IntelligenceBase
}

// NewRecommendationHandler creates a RecommendationHandler.
func NewRecommendationHandler(base *IntelligenceBase) *RecommendationHandler {
	return &RecommendationHandler{base: base}
}

// GetRecommendation handles GET /v1/intelligence/recommendation?tenant_id=X
func (h *RecommendationHandler) GetRecommendation(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID := r.URL.Query().Get("batch_id"); batchID != "" {
		resp := h.base.buildSnapshotResponse(r, tenantID, "RECOMMENDATION", "BATCH", &batchID)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp := h.base.buildSnapshotResponse(r, tenantID, "RECOMMENDATION", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}
