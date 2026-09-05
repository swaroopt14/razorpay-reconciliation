package handlers

import (
	"net/http"
)

// PatternHandler serves the GET /v1/intelligence/pattern endpoint.
type PatternHandler struct {
	base *IntelligenceBase
}

// NewPatternHandler creates a PatternHandler.
func NewPatternHandler(base *IntelligenceBase) *PatternHandler {
	return &PatternHandler{base: base}
}

// GetPattern handles GET /v1/intelligence/pattern?tenant_id=X[&batch_id=Y]
//
// When batch_id is omitted, returns the most recently computed PATTERN snapshot
// for any batch belonging to this tenant. This is the "overview" view — callers
// wanting a specific batch should pass batch_id explicitly.
func (h *PatternHandler) GetPattern(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	batchID := r.URL.Query().Get("batch_id")
	if batchID != "" {
		resp := h.base.buildSnapshotResponse(r, tenantID, "PATTERN", "BATCH", &batchID)
		writeJSON(w, http.StatusOK, resp)
		return
	}
	// No batch_id: return the most recently scored batch snapshot for this tenant.
	resp := h.base.buildSnapshotResponseAnyScope(r, tenantID, "PATTERN", "BATCH")
	writeJSON(w, http.StatusOK, resp)
}
