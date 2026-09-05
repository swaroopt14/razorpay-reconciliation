package handlers

// dashboard_bubble_map_handler.go
//
// GET /v1/intelligence/dashboard/bubble-map?tenant_id=X[&limit=50]
//
// Returns per-batch summary data for the frontend bubble map dashboard.
// Each row contains:
//   - batch_id        — the batch identifier
//   - amount_value    — total_intended_amount_minor (total amount for this batch)
//   - amount_at_risk  — unmatched_amount_minor + reversal_exposure_minor +
//                       unexplained_variance_minor (real risk, whitelisted fees excluded)

import (
	"fmt"
	"net/http"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardBubbleMapHandler serves GET /v1/intelligence/dashboard/bubble-map.
type DashboardBubbleMapHandler struct {
	batchRepo        *persistence.BatchContractRepo
	intelligenceMode string
}

// NewDashboardBubbleMapHandler creates a DashboardBubbleMapHandler.
func NewDashboardBubbleMapHandler(batchRepo *persistence.BatchContractRepo, mode string) *DashboardBubbleMapHandler {
	return &DashboardBubbleMapHandler{batchRepo: batchRepo, intelligenceMode: mode}
}

// bubbleMapBatchItem is one row in the bubble map response.
type bubbleMapBatchItem struct {
	BatchID      string          `json:"batch_id"`
	AmountValue  decimal.Decimal `json:"amount_value"`
	AmountAtRisk decimal.Decimal `json:"amount_at_risk"`
}

// GetBubbleMap handles GET /v1/intelligence/dashboard/bubble-map?tenant_id=X[&limit=50]
func (h *DashboardBubbleMapHandler) GetBubbleMap(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsed int
		if _, err := fmt.Sscanf(l, "%d", &parsed); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	batches, err := h.batchRepo.ListByTenant(r.Context(), tenantID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch data")
		return
	}

	items := make([]bubbleMapBatchItem, 0, len(batches))
	for _, b := range batches {
		amountAtRisk := b.UnmatchedAmountMinor.
			Add(b.ReversalExposureMinor).
			Add(b.UnexplainedVarianceMinor)

		items = append(items, bubbleMapBatchItem{
			BatchID:      b.BatchID,
			AmountValue:  b.TotalIntendedAmountMinor,
			AmountAtRisk: amountAtRisk,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": h.intelligenceMode,
		"data_available":    len(items) > 0,
		"count":             len(items),
		"batches":           items,
	})
}
