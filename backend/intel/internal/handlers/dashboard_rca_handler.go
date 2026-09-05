package handlers

// dashboard_rca_handler.go
//
// GET /v1/intelligence/dashboard/rca
//
// Serves the 4 RCA quality KPIs for the frontend dashboard:
//   R4  parser_weakness_rate  → fraction of settlements with parse confidence below threshold
//   R5  mapping_weakness_rate → fraction of settlements with mapping confidence below threshold
//   R6  source_system_defect_rate → per-source-system defect breakdown
//   R8  rca_concentration     → Herfindahl-Hirschman Index over cluster sizes (0–1)
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'RCA_CLUSTER' AND scope_type = 'TENANT'.
// The RCAIntelligenceService writes TENANT-scoped RCA_CLUSTER snapshots (via saveTenantSnapshot)
// after every BatchSummaryUpdated event triggers clustering.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   batch_id    optional — not applicable; accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardRCAHandler serves GET /v1/intelligence/dashboard/rca.
type DashboardRCAHandler struct {
	snapshotRepo    *persistence.IntelligenceSnapshotRepo
	intelligenceMode string
}

// NewDashboardRCAHandler creates a DashboardRCAHandler.
func NewDashboardRCAHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo, mode string) *DashboardRCAHandler {
	return &DashboardRCAHandler{snapshotRepo: snapshotRepo, intelligenceMode: mode}
}

// rcaSourceDefect is the per-source-system breakdown stored in the RCA_CLUSTER snapshot.
type rcaSourceDefect struct {
	Total       int     `json:"total"`
	WeakParse   int     `json:"weak_parse"`
	WeakMapping int     `json:"weak_mapping"`
	DefectRate  float64 `json:"defect_rate"`
}

// rcaDashboardFields reads the R4/R5/R6/R8 fields from the TENANT-scoped RCA_CLUSTER snapshot JSON.
// The TENANT snapshot is a map (not a raw RCAClusterResult) — see saveTenantSnapshot in
// rca_intelligence_service.go for the exact structure.
type rcaDashboardFields struct {
	RCAConcentration       float64                     `json:"rca_concentration"`
	ParserWeaknessRate     float64                     `json:"parser_weakness_rate"`
	MappingWeaknessRate    float64                     `json:"mapping_weakness_rate"`
	SourceSystemDefectRate float64                     `json:"source_system_defect_rate"`
	SourceSystemDefects    map[string]rcaSourceDefect  `json:"source_system_defects"`
	WeakParseCount         int                         `json:"weak_parse_count"`
	WeakMappingCount       int                         `json:"weak_mapping_count"`
	TotalSettlements       int                         `json:"total_settlements"`
}

// DashboardRCAResponse is the frontend-ready payload for the RCA quality dashboard card.
type DashboardRCAResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// R4 — parser_weakness_rate: fraction of settlements with parse confidence below threshold
	ParserWeaknessRate float64 `json:"parser_weakness_rate"`
	WeakParseCount     int     `json:"weak_parse_count"`

	// R5 — mapping_weakness_rate: fraction of settlements with mapping confidence below threshold
	MappingWeaknessRate float64 `json:"mapping_weakness_rate"`
	WeakMappingCount    int     `json:"weak_mapping_count"`

	// R6 — source_system_defect_rate: aggregate defect rate and per-source breakdown
	// source_system_defects exposes only the defect_rate per source for the dashboard card.
	SourceSystemDefectRate float64            `json:"source_system_defect_rate"`
	SourceSystemDefects    map[string]float64 `json:"source_system_defects,omitempty"`

	// R8 — rca_concentration: Herfindahl-Hirschman Index over cluster sizes (0–1)
	// 1.0 = one cluster dominates all failures; 0 = perfectly uniform spread across clusters
	RCAConcentration float64 `json:"rca_concentration"`

	// Supporting context
	TotalSettlements int `json:"total_settlements"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`
}

// GetRCAKPIs handles GET /v1/intelligence/dashboard/rca
func (h *DashboardRCAHandler) GetRCAKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "RCA_CLUSTER", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch RCA snapshot")
		return
	}

	resp := DashboardRCAResponse{TenantID: tenantID, IntelligenceMode: h.intelligenceMode}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "No settlement quality data available yet"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis rcaDashboardFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse RCA snapshot")
		return
	}

	pct := func(v float64) float64 { return math.Round(v*10000) / 100 }

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.RCAConcentration = pct(kpis.RCAConcentration)
	resp.ParserWeaknessRate = pct(kpis.ParserWeaknessRate)
	resp.WeakParseCount = kpis.WeakParseCount
	resp.MappingWeaknessRate = pct(kpis.MappingWeaknessRate)
	resp.WeakMappingCount = kpis.WeakMappingCount
	resp.SourceSystemDefectRate = pct(kpis.SourceSystemDefectRate)
	if len(kpis.SourceSystemDefects) > 0 {
		defectRates := make(map[string]float64, len(kpis.SourceSystemDefects))
		for src, d := range kpis.SourceSystemDefects {
			defectRates[src] = pct(d.DefectRate)
		}
		resp.SourceSystemDefects = defectRates
	}
	resp.TotalSettlements = kpis.TotalSettlements

	writeJSON(w, http.StatusOK, resp)
}
