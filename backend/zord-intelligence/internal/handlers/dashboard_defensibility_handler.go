package handlers

// dashboard_defensibility_handler.go
//
// GET /v1/intelligence/dashboard/defensibility
//
// Serves the 3 Defensibility KPIs for the frontend dashboard:
//   KPI 11  evidence_pack_coverage      → evidence_pack_rate
//   KPI 12  governance_coverage         → governance_coverage_pct
//   KPI 13  replay_equivalence_rate     → replayability_pct
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'DEFENSIBILITY'.
// The DefensibilityIntelligenceService writes these snapshots after every
// EvidencePackReadyEvent and GovernanceDecisionCreatedEvent.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   batch_id    optional — not applicable for defensibility (TENANT-scoped); accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardDefensibilityHandler serves GET /v1/intelligence/dashboard/defensibility.
type DashboardDefensibilityHandler struct {
	snapshotRepo     *persistence.IntelligenceSnapshotRepo
	intelligenceMode string
}

// NewDashboardDefensibilityHandler creates a DashboardDefensibilityHandler.
func NewDashboardDefensibilityHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo, mode string) *DashboardDefensibilityHandler {
	return &DashboardDefensibilityHandler{snapshotRepo: snapshotRepo, intelligenceMode: mode}
}

// defensibilityKPIFields reads the KPI fields from DefensibilitySnapshot JSON.
type defensibilityKPIFields struct {
	EvidencePackRate           float64 `json:"evidence_pack_rate"`
	GovernanceCoveragePct      float64 `json:"governance_coverage_pct"`
	ReplayabilityPct           float64 `json:"replayability_pct"`
	DefensibilityScore         float64 `json:"defensibility_score"`
	DefensibilityTier          string  `json:"defensibility_tier"`
	AuditReadyPct              float64 `json:"audit_ready_pct"`
	DisputeReadyPct            float64 `json:"dispute_ready_pct"`
	AvgPackCompletenessScore   float64 `json:"avg_pack_completeness_score"`
	SettlementEvidenceCoverage float64 `json:"settlement_evidence_coverage"`
	AttachmentEvidenceCoverage float64 `json:"attachment_evidence_coverage"`
	WeakEvidenceCount          int     `json:"weak_evidence_count"`
	WeakEvidenceRate           float64 `json:"weak_evidence_rate"`
}

// DashboardDefensibilityResponse is the frontend-ready payload for the defensibility dashboard card.
type DashboardDefensibilityResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 11 — evidence_pack_coverage
	EvidencePackRate float64 `json:"evidence_pack_rate"`
	// KPI 12 — governance_coverage
	GovernanceCoveragePct float64 `json:"governance_coverage_pct"`
	// KPI 13 — replay_equivalence_rate
	ReplayabilityPct float64 `json:"replayability_pct"`

	// Supplementary composite score and tier for frontend colour-coding
	DefensibilityScore float64 `json:"defensibility_score"`
	DefensibilityTier  string  `json:"defensibility_tier,omitempty"`
	AuditReadyPct      float64 `json:"audit_ready_pct"`
	DisputeReadyPct    float64 `json:"dispute_ready_pct"`

	// D2 — avg_pack_completeness_score: average completeness fraction (0–1) across evidence packs
	AvgPackCompletenessScore float64 `json:"avg_pack_completeness_score"`
	// D4 — settlement_evidence_coverage: fraction of packs with settlement leaf present
	SettlementEvidenceCoverage float64 `json:"settlement_evidence_coverage"`
	// D5 — attachment_evidence_coverage: fraction of packs with attachment decision leaf present
	AttachmentEvidenceCoverage float64 `json:"attachment_evidence_coverage"`
	// D7 — weak_evidence_rate: fraction of intents flagged with evidence gap
	WeakEvidenceCount int     `json:"weak_evidence_count"`
	WeakEvidenceRate  float64 `json:"weak_evidence_rate"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`
}

// GetDefensibilityKPIs handles GET /v1/intelligence/dashboard/defensibility
func (h *DashboardDefensibilityHandler) GetDefensibilityKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "DEFENSIBILITY", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch defensibility snapshot")
		return
	}

	resp := DashboardDefensibilityResponse{TenantID: tenantID, IntelligenceMode: h.intelligenceMode}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "No evidence pack data available for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis defensibilityKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse defensibility snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	pct := func(v float64) float64 { return math.Round(v*10000) / 100 }
	resp.EvidencePackRate = pct(kpis.EvidencePackRate)
	resp.GovernanceCoveragePct = pct(kpis.GovernanceCoveragePct)
	resp.ReplayabilityPct = pct(kpis.ReplayabilityPct)
	resp.DefensibilityScore = math.Round(kpis.DefensibilityScore*100) / 100
	resp.DefensibilityTier = kpis.DefensibilityTier
	resp.AuditReadyPct = pct(kpis.AuditReadyPct)
	resp.DisputeReadyPct = pct(kpis.DisputeReadyPct)
	resp.AvgPackCompletenessScore = pct(kpis.AvgPackCompletenessScore)
	resp.SettlementEvidenceCoverage = pct(kpis.SettlementEvidenceCoverage)
	resp.AttachmentEvidenceCoverage = pct(kpis.AttachmentEvidenceCoverage)
	resp.WeakEvidenceCount = kpis.WeakEvidenceCount
	resp.WeakEvidenceRate = pct(kpis.WeakEvidenceRate)

	writeJSON(w, http.StatusOK, resp)
}
