package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/zord/zord-intelligence/internal/mlclient"
)

// RCAHandler serves the GET /v1/intelligence/rca/clusters endpoint.
type RCAHandler struct {
	base *IntelligenceBase
}

// NewRCAHandler creates an RCAHandler.
func NewRCAHandler(base *IntelligenceBase) *RCAHandler {
	return &RCAHandler{base: base}
}

// GetRCAClusters handles GET /v1/intelligence/rca/clusters
//
// Query params:
//   - tenant_id (required)
//   - batch_id  (optional) — if supplied, returns BATCH-scope snapshot for that batch;
//     otherwise falls back to the most-recent TENANT-scope snapshot.
//   - limit     (optional, default 10, max 50) — caps the TopClusters list returned.
//
// Internal-only clusters (ARP) are stripped from the response before the limit is applied.
func (h *RCAHandler) GetRCAClusters(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	limit := 10
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if n, err := strconv.Atoi(lStr); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}

	batchID := r.URL.Query().Get("batch_id")

	var snap *intelligenceResponse
	if batchID != "" {
		resp := h.base.buildSnapshotResponse(r, tenantID, "RCA_CLUSTER", "BATCH", &batchID)
		snap = &resp
	} else {
		// No batch_id: return the most recent tenant-scope RCA_CLUSTER snapshot.
		resp := h.base.buildSnapshotResponse(r, tenantID, "RCA_CLUSTER", "TENANT", nil)
		snap = &resp
	}

	if !snap.DataAvailable {
		writeJSON(w, http.StatusOK, snap)
		return
	}

	// Parse the RCA snapshot, supporting both the wrapped TENANT shape and the
	// flat BATCH shape before filtering internal clusters.
	result, err := mlclient.UnmarshalRCAClusterResult(snap.Data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse RCA cluster snapshot")
		return
	}

	filtered := make([]mlclient.RCAClusterSummary, 0, len(result.TopClusters))
	for _, c := range result.TopClusters {
		if !c.InternalOnly {
			filtered = append(filtered, c)
		}
	}
	if limit < len(filtered) {
		filtered = filtered[:limit]
	}
	result.TopClusters = filtered

	filteredJSON, err := json.Marshal(result)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialise RCA cluster result")
		return
	}
	snap.Data = filteredJSON
	writeJSON(w, http.StatusOK, snap)
}
