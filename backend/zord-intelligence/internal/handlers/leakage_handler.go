package handlers

import (
	"net/http"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// LeakageHandler serves the GET /v1/intelligence/leakage endpoint.
type LeakageHandler struct {
	base     *IntelligenceBase
	projRepo *persistence.ProjectionRepo
}

// NewLeakageHandler creates a LeakageHandler.
func NewLeakageHandler(base *IntelligenceBase, projRepo *persistence.ProjectionRepo) *LeakageHandler {
	return &LeakageHandler{base: base, projRepo: projRepo}
}

// leakageResponse wraps the standard intelligence response and promotes
// total_amount_minor and over_settlement_amount_minor from
// projection_state.value_json (leakage.total) to the top level so callers
// do not need to parse the data blob to get these figures.
type leakageResponse struct {
	intelligenceResponse
	TotalAmountMinor          decimal.Decimal `json:"total_amount_minor"`
	OverSettlementAmountMinor decimal.Decimal `json:"over_settlement_amount_minor"`
}

// GetLeakage handles GET /v1/intelligence/leakage?tenant_id=X
func (h *LeakageHandler) GetLeakage(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	snap := h.base.buildSnapshotResponse(r, tenantID, "LEAKAGE", "TENANT", nil)

	var totalAmountMinor, overSettlementAmountMinor decimal.Decimal
	if lv, err := h.projRepo.GetLeakageSummary(r.Context(), tenantID); err == nil && lv != nil {
		totalAmountMinor = lv.TotalAmountMinor
		overSettlementAmountMinor = lv.OverSettlementAmountMinor
	}

	writeJSON(w, http.StatusOK, leakageResponse{
		intelligenceResponse:      snap,
		TotalAmountMinor:          totalAmountMinor,
		OverSettlementAmountMinor: overSettlementAmountMinor,
	})
}
