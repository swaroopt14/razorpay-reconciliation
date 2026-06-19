package handlers

// dashboard_ambiguity_handler.go
//
// GET /v1/intelligence/dashboard/ambiguity
//
// Serves the 4 Ambiguity KPIs for the frontend dashboard:
//   KPI 7   ambiguous_intent_count
//   KPI 8   ambiguity_rate
//   KPI 9   avg_attachment_confidence
//   KPI 10  missing_reference_rate    → provider_ref_missing_rate
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'AMBIGUITY'.
// The AmbiguityIntelligenceService writes these snapshots after every
// attachment decision event.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   batch_id    optional — not applicable for ambiguity (TENANT-scoped); accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardAmbiguityHandler serves GET /v1/intelligence/dashboard/ambiguity
// and GET /v1/intelligence/dashboard/ambiguity/heatmap.
type DashboardAmbiguityHandler struct {
	snapshotRepo     *persistence.IntelligenceSnapshotRepo
	batchRepo        *persistence.BatchContractRepo
	projRepo         *persistence.ProjectionRepo
	intelligenceMode string
}

// NewDashboardAmbiguityHandler creates a DashboardAmbiguityHandler.
func NewDashboardAmbiguityHandler(
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
	projRepo *persistence.ProjectionRepo,
	mode string,
) *DashboardAmbiguityHandler {
	return &DashboardAmbiguityHandler{
		snapshotRepo:     snapshotRepo,
		batchRepo:        batchRepo,
		projRepo:         projRepo,
		intelligenceMode: mode,
	}
}

// ambiguityKPIFields contains the KPI fields from AmbiguitySnapshot JSON.
type ambiguityKPIFields struct {
	AmbiguousIntentCount    int             `json:"ambiguous_intent_count"`
	AmbiguityRate           float64         `json:"ambiguity_rate"`
	AvgAttachmentConfidence float64         `json:"avg_attachment_confidence"`
	ProviderRefMissingRate  float64         `json:"provider_ref_missing_rate"`
	ValueAtRiskMinor        decimal.Decimal `json:"value_at_risk_minor"`
	AmbiguousAmountMinor    decimal.Decimal `json:"ambiguous_amount_minor"`
	LowConfidenceRate       float64         `json:"low_confidence_rate"`
	CandidateCollisionRate  float64         `json:"candidate_collision_rate"`
	AvgScoreMargin          float64         `json:"avg_score_margin"`
	CarrierCompletenessRate float64         `json:"carrier_completeness_rate"`
	RiskTier                string          `json:"risk_tier"`
}

// leakageKPIsForAmbiguity holds the leakage snapshot fields needed to compute
// A3 (ambiguous_amount_rate).
type leakageKPIsForAmbiguity struct {
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"`
}

// DashboardAmbiguityResponse is the frontend-ready payload for the ambiguity dashboard card.
type DashboardAmbiguityResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 7 — ambiguous_intent_count
	AmbiguousIntentCount int `json:"ambiguous_intent_count"`
	// KPI 8 — ambiguity_rate
	AmbiguityRate float64 `json:"ambiguity_rate"`
	// KPI 9 — avg_attachment_confidence
	AvgAttachmentConfidence float64 `json:"avg_attachment_confidence"`
	// KPI 10 (A9) — missing_reference_rate
	ProviderRefMissingRate float64 `json:"provider_ref_missing_rate"`

	// A3 — ambiguous_amount_rate: ambiguous_amount_minor / total_intended_amount_minor × 100
	AmbiguousAmountRate float64 `json:"ambiguous_amount_rate"`

	// A5 — low_confidence_rate: COUNT(ConfidenceScore < 0.70) / total_decisions
	LowConfidenceRate float64 `json:"low_confidence_rate"`

	// A6 — candidate_collision_rate: COUNT(CandidateSetSize > 1) / total_decisions
	CandidateCollisionRate float64 `json:"candidate_collision_rate"`

	// A7 — avg_score_margin: running average of WinningScore - RunnerUpScore
	AvgScoreMargin float64 `json:"avg_score_margin"`

	// A8 — carrier_completeness_rate: COUNT(CarrierRichness >= 0.60) / total_carrier_records
	CarrierCompletenessRate float64 `json:"carrier_completeness_rate"`

	// A10 — ambiguity_severity_score: (0.35×A3 + 0.25×A5 + 0.20×A6 + 0.20×A9) × 100
	AmbiguitySeverityScore float64 `json:"ambiguity_severity_score"`

	// Supplementary fields for dashboard context (not separate KPIs)
	ValueAtRiskMinor decimal.Decimal `json:"value_at_risk_minor"`
	RiskTier         string          `json:"risk_tier,omitempty"`

	// Donut — Ambiguity Mix (server-computed from snapshot rates)
	AmbiguityMixSegments []ambiguityMixSegment `json:"ambiguity_mix_segments,omitempty"`
	ClearingPct          float64               `json:"clearing_pct,omitempty"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`
}

// GetAmbiguityKPIs handles GET /v1/intelligence/dashboard/ambiguity
func (h *DashboardAmbiguityHandler) GetAmbiguityKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "AMBIGUITY", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch ambiguity snapshot")
		return
	}

	resp := DashboardAmbiguityResponse{TenantID: tenantID, IntelligenceMode: h.intelligenceMode}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "No attachment data available for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis ambiguityKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse ambiguity snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.AmbiguousIntentCount = kpis.AmbiguousIntentCount
	resp.AmbiguityRate = kpis.AmbiguityRate
	resp.AvgAttachmentConfidence = kpis.AvgAttachmentConfidence
	resp.ProviderRefMissingRate = kpis.ProviderRefMissingRate
	resp.LowConfidenceRate = kpis.LowConfidenceRate
	resp.CandidateCollisionRate = kpis.CandidateCollisionRate
	resp.AvgScoreMargin = kpis.AvgScoreMargin
	resp.CarrierCompletenessRate = kpis.CarrierCompletenessRate
	resp.ValueAtRiskMinor = kpis.ValueAtRiskMinor
	resp.RiskTier = kpis.RiskTier

	// ── A3: ambiguous_amount_rate — needs total_intended from LEAKAGE snapshot ──
	// Percentage of total intended volume that is attached ambiguously.
	leakSnap, leakErr := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "LEAKAGE", "TENANT", nil,
		from, to,
	)
	if leakErr == nil && leakSnap != nil {
		var leakKPIs leakageKPIsForAmbiguity
		if jsonErr := json.Unmarshal(leakSnap.SnapshotJSON, &leakKPIs); jsonErr == nil {
			if leakKPIs.TotalIntendedAmountMinor.IsPositive() {
				ratio := kpis.AmbiguousAmountMinor.Div(leakKPIs.TotalIntendedAmountMinor)
				resp.AmbiguousAmountRate = ratio.InexactFloat64() * 100
			}
		}
	}

	// ── A10: ambiguity_severity_score ─────────────────────────────────────
	// Formula: (0.35×A3 + 0.25×A5 + 0.20×A6 + 0.20×A9) × 100
	// A3 is a percentage (0–100) so divide by 100 to normalise back to 0–1 fraction first.
	a3Fraction := resp.AmbiguousAmountRate / 100.0
	resp.AmbiguitySeverityScore = (0.35*a3Fraction +
		0.25*kpis.LowConfidenceRate +
		0.20*kpis.CandidateCollisionRate +
		0.20*kpis.ProviderRefMissingRate) * 100

	mixSegments, clearingPct := buildAmbiguityMixSegments(
		kpis.ProviderRefMissingRate,
		kpis.AmbiguityRate,
		kpis.LowConfidenceRate,
		kpis.AvgAttachmentConfidence,
	)
	resp.AmbiguityMixSegments = mixSegments
	resp.ClearingPct = clearingPct

	writeJSON(w, http.StatusOK, resp)
}
