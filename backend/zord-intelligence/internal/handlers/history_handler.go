package handlers

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// HistoryHandler serves the /history route across intelligence types.
type HistoryHandler struct {
	projectionService *services.ProjectionService
	snapshotRepo      *persistence.IntelligenceSnapshotRepo
}

// NewHistoryHandler creates a HistoryHandler.
func NewHistoryHandler(
	projectionService *services.ProjectionService,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
) *HistoryHandler {
	return &HistoryHandler{
		projectionService: projectionService,
		snapshotRepo:      snapshotRepo,
	}
}

// GetSnapshotHistory handles GET /v1/intelligence/{type}/history?tenant_id=X&limit=N
func (h *HistoryHandler) GetSnapshotHistory(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	snapshotType := chi.URLParam(r, "type")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	typeMap := map[string]string{
		"leakage":        "LEAKAGE",
		"ambiguity":      "AMBIGUITY",
		"defensibility":  "DEFENSIBILITY",
		"rca":            "RCA",
		"pattern":        "PATTERN",
		"recommendation": "RECOMMENDATION",
	}
	canonicalType, ok := typeMap[snapshotType]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid snapshot type: must be one of leakage, ambiguity, defensibility, rca, pattern, recommendation")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsed int
		if _, err := fmt.Sscanf(l, "%d", &parsed); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	mode := h.projectionService.Mode()

	snapshots, err := h.snapshotRepo.ListByTenantAndType(r.Context(), tenantID, canonicalType, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch snapshot history")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"snapshot_type":     canonicalType,
		"snapshots":         snapshots,
		"count":             len(snapshots),
	})
}
