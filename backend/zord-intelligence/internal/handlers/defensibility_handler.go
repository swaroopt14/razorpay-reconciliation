package handlers

import (
	"net/http"
)

// DefensibilityHandler serves the GET /v1/intelligence/defensibility endpoint.
type DefensibilityHandler struct {
	base *IntelligenceBase
}

// NewDefensibilityHandler creates a DefensibilityHandler.
func NewDefensibilityHandler(base *IntelligenceBase) *DefensibilityHandler {
	return &DefensibilityHandler{base: base}
}

// GetDefensibility handles GET /v1/intelligence/defensibility?tenant_id=X
func (h *DefensibilityHandler) GetDefensibility(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID := r.URL.Query().Get("batch_id"); batchID != "" {
		resp := h.base.buildSnapshotResponse(r, tenantID, "DEFENSIBILITY", "BATCH", &batchID)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp := h.base.buildSnapshotResponse(r, tenantID, "DEFENSIBILITY", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}
