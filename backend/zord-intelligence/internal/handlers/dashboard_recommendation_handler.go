package handlers

// dashboard_recommendation_handler.go
//
// GET /v1/intelligence/dashboard/recommendations
//
// Serves the 2 Recommendation KPIs for the frontend dashboard:
//   KPI 15  action_acceptance_rate = Accepted / Total
//   KPI 16  action_resolution_rate = Resolved / Total
//
// Data source: action_contracts table (direct aggregate query).
//
// Definitions:
//   Total    = all non-EXPIRED contracts for the tenant in the window
//   Accepted = contracts with contract_status = 'APPROVED'
//   Resolved = contracts with contract_status IN ('APPROVED', 'DISMISSED')
//              (human acted on them — not left as PENDING or auto-expired)
//
// These are computed by ActionContractRepo.GetRateSummary — raw aggregates
// from the DB. Division happens here in the service layer (not in SQL)
// per the formula implementation rule.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by action created_at >= from
//   to_date     optional — ISO-8601 date; filters by action created_at <= to
//   batch_id    optional — not applicable for actions; accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardRecommendationHandler serves GET /v1/intelligence/dashboard/recommendations.
type DashboardRecommendationHandler struct {
	actionRepo      *persistence.ActionContractRepo
	snapshotRepo    *persistence.IntelligenceSnapshotRepo
	intelligenceMode string
}

// NewDashboardRecommendationHandler creates a DashboardRecommendationHandler.
func NewDashboardRecommendationHandler(
	actionRepo *persistence.ActionContractRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mode string,
) *DashboardRecommendationHandler {
	return &DashboardRecommendationHandler{actionRepo: actionRepo, snapshotRepo: snapshotRepo, intelligenceMode: mode}
}

// recSnapshotFields reads Rec1/Rec2 fields from RecommendationSnapshot JSON.
type recSnapshotFields struct {
	RecommendationPriorityScore       float64         `json:"recommendation_priority_score"`
	RecommendationImpactEstimateMinor decimal.Decimal `json:"recommendation_impact_estimate_minor"`
}

// DashboardRecommendationResponse is the frontend-ready payload for the recommendation dashboard card.
type DashboardRecommendationResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 15 — action_acceptance_rate = accepted / total
	ActionAcceptanceRate float64 `json:"action_acceptance_rate"`
	// KPI 16 — action_resolution_rate = resolved / total
	ActionResolutionRate float64 `json:"action_resolution_rate"`

	// Raw counts for frontend context (avoids double-fetching)
	TotalActions    int `json:"total_actions"`
	AcceptedActions int `json:"accepted_actions"`
	ResolvedActions int `json:"resolved_actions"`

	// Rec1 — recommendation_priority_score: max priority score across active recommendation cards
	RecommendationPriorityScore float64 `json:"recommendation_priority_score"`
	// Rec2 — recommendation_impact_estimate_minor: sum of impact amounts for CRITICAL + HIGH cards
	RecommendationImpactEstimateMinor decimal.Decimal `json:"recommendation_impact_estimate_minor"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`
}

// GetRecommendationKPIs handles GET /v1/intelligence/dashboard/recommendations
func (h *DashboardRecommendationHandler) GetRecommendationKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	summary, err := h.actionRepo.GetRateSummary(r.Context(), tenantID, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch recommendation summary")
		return
	}

	now := time.Now().UTC()
	pct := func(v float64) float64 { return math.Round(v*10000) / 100 }

	resp := DashboardRecommendationResponse{
		TenantID:        tenantID,
		IntelligenceMode: h.intelligenceMode,
		ComputedAt:      &now,
		TotalActions:    summary.Total,
		AcceptedActions: summary.Accepted,
		ResolvedActions: summary.Resolved,
	}

	// ── Rec1 / Rec2: fetch RECOMMENDATION snapshot ────────────────────────────
	// Fetched unconditionally — these KPIs are written by the intelligence service
	// independently of whether any action contracts exist yet.
	if h.snapshotRepo != nil {
		recSnap, recErr := h.snapshotRepo.GetLatestByTypeFiltered(
			r.Context(), tenantID, "RECOMMENDATION", "TENANT", nil, from, to,
		)
		if recErr == nil && recSnap != nil {
			var recKPIs recSnapshotFields
			if jsonErr := json.Unmarshal(recSnap.SnapshotJSON, &recKPIs); jsonErr == nil {
				resp.RecommendationPriorityScore = pct(recKPIs.RecommendationPriorityScore)
				resp.RecommendationImpactEstimateMinor = recKPIs.RecommendationImpactEstimateMinor
			}
		}
	}

	hasRecData := resp.RecommendationPriorityScore > 0 || !resp.RecommendationImpactEstimateMinor.IsZero()
	resp.DataAvailable = summary.Total > 0 || hasRecData

	if summary.Total == 0 {
		if !hasRecData {
			resp.Reason = "No recommendation data available for this period"
		}
		// KPI 15/16 stay zero — no action contracts to compute rates from.
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// KPI 15 — action_acceptance_rate = accepted / total_recommendations
	resp.ActionAcceptanceRate = pct(float64(summary.Accepted) / float64(summary.Total))

	// KPI 16 — action_resolution_rate = resolved / total_accepted_actions
	// "resolved" = reached a terminal decision (APPROVED or DISMISSED).
	// "total_accepted_actions" = all non-EXPIRED contracts accepted for review = Total.
	resp.ActionResolutionRate = pct(float64(summary.Resolved) / float64(summary.Total))

	writeJSON(w, http.StatusOK, resp)
}
