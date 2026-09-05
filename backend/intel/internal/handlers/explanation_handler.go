package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/services"
)

// ExplanationHandler serves the new Explanation endpoints for Phase 7.
type ExplanationHandler struct {
	explanationService *services.ExplanationService
}

// NewExplanationHandler creates a new ExplanationHandler.
func NewExplanationHandler(service *services.ExplanationService) *ExplanationHandler {
	return &ExplanationHandler{
		explanationService: service,
	}
}

// GetExplanation handles GET /v1/intelligence/explanations/{snapshot_id}
func (h *ExplanationHandler) GetExplanation(w http.ResponseWriter, r *http.Request) {
	snapshotID := chi.URLParam(r, "snapshot_id")
	if snapshotID == "" {
		writeError(w, http.StatusBadRequest, "snapshot_id is required")
		return
	}

	expl, err := h.explanationService.GetOrGenerateExplanation(r.Context(), snapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if expl == nil {
		writeError(w, http.StatusNotFound, "snapshot explanation could not be generated")
		return
	}

	writeJSON(w, http.StatusOK, expl)
}

// ExplainBatchRequest defines the payload for POST /v1/intelligence/explain-batch
type ExplainBatchRequest struct {
	TenantID string `json:"tenant_id"`
	BatchID  string `json:"batch_id"`
}

// ExplainBatch handles POST /v1/intelligence/explain-batch
func (h *ExplanationHandler) ExplainBatch(w http.ResponseWriter, r *http.Request) {
	var req ExplainBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}

	if req.TenantID == "" || req.BatchID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id and batch_id are required")
		return
	}

	expl, err := h.explanationService.ExplainBatch(r.Context(), req.TenantID, req.BatchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if expl == nil {
		writeError(w, http.StatusNotFound, "batch explanation could not be generated")
		return
	}

	writeJSON(w, http.StatusOK, expl)
}
