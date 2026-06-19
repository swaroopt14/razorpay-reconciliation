package handlers

// dashboard_leakage_handler.go
//
// GET /v1/intelligence/dashboard/leakage
//
// Serves the 6 Leakage KPIs for the frontend dashboard:
//   KPI 1  total_intended_volume        → total_intended_amount_minor
//   KPI 2  unmatched_intent_amount      → unmatched_amount_minor
//   KPI 3  under_settlement_amount      → under_settlement_amount_minor
//   KPI 4  orphan_settlement_amount     → orphan_amount_minor
//   KPI 5  reversal_exposure            → reversal_exposure_minor
//   KPI 6  leakage_rate                 → leakage_percentage
//
// Derived (not a separate snapshot field): total_observed_settled_volume_minor =
//   intended − unmatched − under_settlement − reversal_exposure
//   (complement of the leakage_percentage numerator; orphan is excluded there — projection_repo.recomputeLeakageTotals).
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'LEAKAGE'.
// The LeakageIntelligenceService writes these snapshots after every
// attachment decision / variance record event.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date (YYYY-MM-DD); filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date (YYYY-MM-DD); filters by snapshot created_at <= to
//   batch_id    optional — not applicable for leakage (TENANT-scoped); accepted and ignored
//   provider    optional — not applicable for leakage (TENANT-scoped); accepted and ignored

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ambiguityKPIsForLeakage holds the ambiguity snapshot fields needed to compute
// L4 (ambiguous_value_at_risk) and L10 (risk_adjusted_leakage).
type ambiguityKPIsForLeakage struct {
	AmbiguousAmountMinor    decimal.Decimal `json:"ambiguous_amount_minor"`
	ValueAtRiskMinor        decimal.Decimal `json:"value_at_risk_minor"`
	AvgAttachmentConfidence float64         `json:"avg_attachment_confidence"`
}

// DashboardLeakageHandler serves GET /v1/intelligence/dashboard/leakage.
type DashboardLeakageHandler struct {
	snapshotRepo    *persistence.IntelligenceSnapshotRepo
	intelligenceMode string
}

// NewDashboardLeakageHandler creates a DashboardLeakageHandler.
func NewDashboardLeakageHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo, mode string) *DashboardLeakageHandler {
	return &DashboardLeakageHandler{snapshotRepo: snapshotRepo, intelligenceMode: mode}
}

// leakageKPIFields contains the KPI fields extracted from LeakageSnapshot JSON.
// We unmarshal just these fields to avoid coupling to the full service snapshot struct.
type leakageKPIFields struct {
	TotalAmountMinor                decimal.Decimal `json:"total_amount_minor"`
	TotalIntendedAmountMinor        decimal.Decimal `json:"total_intended_amount_minor"`
	TotalObservedSettledAmountMinor decimal.Decimal `json:"total_observed_settled_amount_minor"`
	UnmatchedAmountMinor            decimal.Decimal `json:"unmatched_amount_minor"`
	UnderSettlementAmountMinor      decimal.Decimal `json:"under_settlement_amount_minor"`
	OrphanAmountMinor               decimal.Decimal `json:"orphan_amount_minor"`
	ReversalExposureMinor           decimal.Decimal `json:"reversal_exposure_minor"`
	LeakagePercentage               float64         `json:"leakage_percentage"`
	RiskTier                        string          `json:"risk_tier"`
	DuplicateRiskCount              int             `json:"duplicate_risk_count"`
	DuplicateRiskExposureMinor      decimal.Decimal `json:"duplicate_risk_exposure_minor"`
	ConfirmedDuplicateCount         int             `json:"confirmed_duplicate_count"`
	ConfirmedDuplicateExposureMinor decimal.Decimal `json:"confirmed_duplicate_exposure_minor"`
}

// DashboardLeakageResponse is the frontend-ready payload for the leakage dashboard card.
type DashboardLeakageResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 1 — total_intended_volume
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"`
	// KPI 2 — unmatched_intent_amount
	UnmatchedAmountMinor decimal.Decimal `json:"unmatched_amount_minor"`
	// KPI 3 — under_settlement_amount
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"`
	// KPI 4 — orphan_settlement_amount
	OrphanAmountMinor decimal.Decimal `json:"orphan_amount_minor"`
	// KPI 5 — reversal_exposure
	ReversalExposureMinor decimal.Decimal `json:"reversal_exposure_minor"`
	// KPI 6 — leakage_rate
	LeakagePercentage float64 `json:"leakage_percentage"`

	// L2 — total_observed_settled_volume: sum of all SettledAmountMinor across all settlements
	TotalObservedSettledAmountMinor decimal.Decimal `json:"total_observed_settled_amount_minor"`

	// L4 — ambiguous_value_at_risk: ambiguous_amount_minor from AMBIGUITY snapshot
	AmbiguousValueAtRiskMinor decimal.Decimal `json:"ambiguous_value_at_risk_minor"`

	// L10 — risk_adjusted_leakage: total_amount_minor + (value_at_risk_minor × weight)
	// weight derived from avg_attachment_confidence: ≥0.90→0.25, ≥0.70→0.40, <0.70→0.60
	RiskAdjustedLeakageMinor decimal.Decimal `json:"risk_adjusted_leakage_minor"`

	// Risk classification tier — included for frontend colour-coding
	RiskTier string `json:"risk_tier,omitempty"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`

	// L7 — duplicate_risk_exposure: intents flagged as duplicate risk at intent creation
	DuplicateRiskCount         int             `json:"duplicate_risk_count"`
	DuplicateRiskExposureMinor decimal.Decimal `json:"duplicate_risk_exposure_minor"`

	// L7b — confirmed_duplicate_exposure: decisions confirmed as MATCH_DUPLICATE by Service 5C
	ConfirmedDuplicateCount         int             `json:"confirmed_duplicate_count"`
	ConfirmedDuplicateExposureMinor decimal.Decimal `json:"confirmed_duplicate_exposure_minor"`
}

// GetLeakageKPIs handles GET /v1/intelligence/dashboard/leakage
func (h *DashboardLeakageHandler) GetLeakageKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "LEAKAGE", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch leakage snapshot")
		return
	}

	resp := DashboardLeakageResponse{TenantID: tenantID, IntelligenceMode: h.intelligenceMode}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "No payment data available for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis leakageKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse leakage snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.TotalIntendedAmountMinor = kpis.TotalIntendedAmountMinor
	resp.TotalObservedSettledAmountMinor = kpis.TotalObservedSettledAmountMinor.Truncate(2)
	resp.UnmatchedAmountMinor = kpis.UnmatchedAmountMinor
	resp.UnderSettlementAmountMinor = kpis.UnderSettlementAmountMinor
	resp.OrphanAmountMinor = kpis.OrphanAmountMinor
	resp.ReversalExposureMinor = kpis.ReversalExposureMinor
	resp.LeakagePercentage = kpis.LeakagePercentage
	resp.RiskTier = kpis.RiskTier
	resp.DuplicateRiskCount = kpis.DuplicateRiskCount
	resp.DuplicateRiskExposureMinor = kpis.DuplicateRiskExposureMinor
	resp.ConfirmedDuplicateCount = kpis.ConfirmedDuplicateCount
	resp.ConfirmedDuplicateExposureMinor = kpis.ConfirmedDuplicateExposureMinor

	// ── L4 and L10: fetch AMBIGUITY snapshot for cross-category derivation ──
	// L4 = ambiguous_amount_minor (already computed in ambiguity snapshot)
	// L10 = total_amount_minor + value_at_risk_minor × ambiguity_risk_weight
	ambSnap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "AMBIGUITY", "TENANT", nil,
		from, to,
	)
	if err == nil && ambSnap != nil {
		var ambKPIs ambiguityKPIsForLeakage
		if jsonErr := json.Unmarshal(ambSnap.SnapshotJSON, &ambKPIs); jsonErr == nil {
			// L4: ambiguous value at risk is the ambiguous_amount_minor from the ambiguity snapshot
			resp.AmbiguousValueAtRiskMinor = ambKPIs.AmbiguousAmountMinor

			// L10: weight is derived from avg_attachment_confidence
			// ≥0.90 → low ambiguity risk weight 0.25
			// ≥0.70 → medium ambiguity risk weight 0.40
			// <0.70 → high ambiguity risk weight 0.60
			var ambiguityRiskWeight float64
			switch {
			case ambKPIs.AvgAttachmentConfidence >= 0.90:
				ambiguityRiskWeight = 0.25
			case ambKPIs.AvgAttachmentConfidence >= 0.70:
				ambiguityRiskWeight = 0.40
			default:
				ambiguityRiskWeight = 0.60
			}
			weightedRisk := ambKPIs.ValueAtRiskMinor.Mul(decimal.NewFromFloat(ambiguityRiskWeight))
			resp.RiskAdjustedLeakageMinor = kpis.TotalAmountMinor.Add(weightedRisk)
		}
	}

	writeJSON(w, http.StatusOK, resp)
}
