package handlers

// dashboard_pattern_handler.go
//
// GET /v1/intelligence/dashboard/patterns
//
// Serves the 1 Pattern KPI for the frontend dashboard:
//   KPI 14  pattern_anomaly_score → batch_anomaly_score + anomaly_level
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'PATTERN'.
// Pattern snapshots are BATCH-scoped (one per batch).
//
// Behaviour:
//   - If batch_id is provided → return the anomaly score for that specific batch.
//   - If batch_id is omitted  → return the most recently scored batch
//     (uses GetLatestByTypeAnyScope, which finds the latest regardless of scope_ref).
//
// Query params:
//   tenant_id   required
//   batch_id    optional — scopes the response to a specific batch
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardPatternHandler serves GET /v1/intelligence/dashboard/patterns.
type DashboardPatternHandler struct {
	snapshotRepo    *persistence.IntelligenceSnapshotRepo
	projRepo        *persistence.ProjectionRepo
	intelligenceMode string
}

// NewDashboardPatternHandler creates a DashboardPatternHandler.
func NewDashboardPatternHandler(
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	projRepo *persistence.ProjectionRepo,
	mode string,
) *DashboardPatternHandler {
	return &DashboardPatternHandler{snapshotRepo: snapshotRepo, projRepo: projRepo, intelligenceMode: mode}
}

// patternKPIFields reads KPI fields from BATCH-scoped PatternSnapshot JSON.
type patternKPIFields struct {
	BatchID            string  `json:"batch_id"`
	BatchAnomalyScore  float64 `json:"batch_anomaly_score"`
	AnomalyLevel       string  `json:"anomaly_level"`
	AnomalyType        string  `json:"anomaly_type"`
	BatchRiskScore     float64 `json:"batch_risk_score"`
	RiskTier           string  `json:"risk_tier"`
	FinalityStatus     string  `json:"finality_status"`
	TotalCount         int     `json:"total_count"`
	SuccessCount       int     `json:"success_count"`
	FailedCount        int     `json:"failed_count"`
	PendingCount       int     `json:"pending_count"`
	BatchQualityScore  float64 `json:"batch_quality_score"`
	ExactMatchCount    int     `json:"exact_match_count"`
	HighConfidenceCount int    `json:"high_confidence_count"`
	AmbiguousCount     int     `json:"ambiguous_count"`
	UnresolvedCount    int     `json:"unresolved_count"`
	ConflictedCount    int     `json:"conflicted_count"`
}

// tenantPatternKPIFields reads P2/P3/P6 fields from TENANT-scoped PatternSnapshot JSON.
type tenantPatternKPIFields struct {
	DuplicateRiskRate            float64 `json:"duplicate_risk_rate"`
	DuplicateRiskCount           int     `json:"duplicate_risk_count"`
	SameBeneficiaryAmountDensity float64 `json:"same_beneficiary_amount_density"`
	SettlementDelayP95Days       float64 `json:"settlement_delay_p95_days"`
}

// ProviderDecisionStats is the per-provider breakdown for A9 decision_success_rate,
// sourced from the pattern.provider.{provider_id} projection.
type ProviderDecisionStats struct {
	TotalDecisions          int     `json:"total_decisions"`
	SuccessfulDecisionCount int     `json:"successful_decision_count"`
	DecisionSuccessRate     float64 `json:"decision_success_rate"`
	AmbiguityRate           float64 `json:"ambiguity_rate"`
	UnresolvedDecisions     int     `json:"unresolved_decisions"`
	OrphanRate              float64 `json:"orphan_rate"`
}

// DashboardPatternResponse is the frontend-ready payload for the pattern dashboard card.
type DashboardPatternResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	ScopedBatchID string     `json:"batch_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 14 — pattern_anomaly_score
	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`

	// P7 — value_date_mismatch_rate
	// numerator: value_date_mismatch_count from leakage projection
	// denominator: total_decisions - unresolved_settlement_count from ambiguity projection
	ValueDateMismatchCount int     `json:"value_date_mismatch_count"`
	ValueDateMismatchRate  float64 `json:"value_date_mismatch_rate"`

	// A9 — decision_success_rate: tenant-wide fraction of attachment decisions
	// that are unambiguous, non-colliding, and settled at the intended amount.
	// source: ambiguity.summary projection (successful_decision_count / total_decisions)
	DecisionSuccessRate float64 `json:"decision_success_rate"`

	// A9 — by_provider: per-provider breakdown of decision success/quality stats,
	// sourced from pattern.provider.{provider_id} projections.
	ByProvider map[string]ProviderDecisionStats `json:"by_provider,omitempty"`

	// P1 — batch_quality_score: composite quality score derived from batch health breakdown
	BatchQualityScore   float64 `json:"batch_quality_score"`
	ExactMatchCount     int     `json:"exact_match_count"`
	HighConfidenceCount int     `json:"high_confidence_count"`
	AmbiguousCount      int     `json:"ambiguous_count"`
	UnresolvedCount     int     `json:"unresolved_count"`
	ConflictedCount     int     `json:"conflicted_count"`

	// P2 — duplicate_risk_rate: fraction of intents with duplicate risk flag
	DuplicateRiskRate  float64 `json:"duplicate_risk_rate"`
	DuplicateRiskCount int     `json:"duplicate_risk_count"`

	// P3 — same_beneficiary_amount_density: max density of same beneficiary+amount pairs in a batch
	SameBeneficiaryAmountDensity float64 `json:"same_beneficiary_amount_density"`

	// P6 — settlement_delay_p95_days: 95th-percentile settlement delay in days
	SettlementDelayP95Days float64 `json:"settlement_delay_p95_days"`

	// Supplementary pattern fields for frontend context
	AnomalyType    string  `json:"anomaly_type,omitempty"`
	BatchRiskScore float64 `json:"batch_risk_score"`
	RiskTier       string  `json:"risk_tier,omitempty"`
	FinalityStatus string  `json:"finality_status,omitempty"`
	TotalCount     int     `json:"total_count"`
	SuccessCount   int     `json:"success_count"`
	FailedCount    int     `json:"failed_count"`
	PendingCount   int     `json:"pending_count"`

	// Intelligence mode — GRADE_A or GRADE_B
	IntelligenceMode string `json:"intelligence_mode,omitempty"`
}

// GetPatternKPIs handles GET /v1/intelligence/dashboard/patterns
func (h *DashboardPatternHandler) GetPatternKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	batchID := r.URL.Query().Get("batch_id")
	from, to := parseDateRangeParams(r)

	var snap *persistence.IntelligenceSnapshot
	var err error

	if batchID != "" {
		// Specific batch requested — use scoped lookup with optional date filter.
		snap, err = h.snapshotRepo.GetLatestByTypeFiltered(
			r.Context(),
			tenantID, "PATTERN", "BATCH", &batchID,
			from, to,
		)
	} else {
		// No batch_id — return the most recently scored batch for this tenant.
		// GetLatestByTypeAnyScope ignores scope_ref so it picks the freshest snapshot.
		snap, err = h.snapshotRepo.GetLatestByTypeAnyScope(
			r.Context(),
			tenantID, "PATTERN", "BATCH",
		)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pattern snapshot")
		return
	}

	resp := DashboardPatternResponse{TenantID: tenantID, IntelligenceMode: h.intelligenceMode}
	pct := func(v float64) float64 { return math.Round(v*10000) / 100 }

	// ── P7: value_date_mismatch_rate ─────────────────────────────────────
	// Always computed from projections, regardless of whether a PATTERN snapshot exists.
	// numerator   = value_date_mismatch_count from leakage.total projection
	// denominator = total_decisions - unresolved_settlement_count from ambiguity.summary projection
	leakage, leakErr := h.projRepo.GetLeakageSummary(r.Context(), tenantID)
	ambiguity, ambErr := h.projRepo.GetAmbiguitySummary(r.Context(), tenantID)
	if leakErr == nil && leakage != nil {
		resp.ValueDateMismatchCount = leakage.ValueDateMismatchCount
		if ambErr == nil && ambiguity != nil {
			attachedRecords := ambiguity.TotalDecisions - ambiguity.UnresolvedSettlementCount
			if attachedRecords > 0 {
				resp.ValueDateMismatchRate = pct(float64(leakage.ValueDateMismatchCount) / float64(attachedRecords))
			}
		}
	}

	// ── A9: decision_success_rate + by_provider ──────────────────────────
	decisionSuccessRate := 0.0
	if ambErr == nil && ambiguity != nil {
		decisionSuccessRate = ambiguity.DecisionSuccessRate
	}
	resp.DecisionSuccessRate = pct(decisionSuccessRate)

	windowStart := time.Now().UTC().Truncate(24 * time.Hour)
	if providers, provErr := h.projRepo.GetAllProviderQualityProjections(r.Context(), tenantID, windowStart); provErr == nil {
		for _, p := range providers {
			if p.TotalDecisions == 0 {
				continue
			}
			if resp.ByProvider == nil {
				resp.ByProvider = make(map[string]ProviderDecisionStats)
			}
			resp.ByProvider[p.ProviderID] = ProviderDecisionStats{
				TotalDecisions:          p.TotalDecisions,
				SuccessfulDecisionCount: p.SuccessfulDecisionCount,
				DecisionSuccessRate:     pct(p.DecisionSuccessRate),
				AmbiguityRate:           pct(p.AmbiguityRate),
				UnresolvedDecisions:     p.UnresolvedDecisions,
				OrphanRate:              pct(p.OrphanRate),
			}
		}
	}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "No batch data available for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis patternKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse pattern snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	if snap.ScopeRef != nil {
		resp.ScopedBatchID = *snap.ScopeRef
	}
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.BatchAnomalyScore = pct(kpis.BatchAnomalyScore)
	resp.AnomalyLevel = kpis.AnomalyLevel
	resp.AnomalyType = kpis.AnomalyType
	resp.BatchRiskScore = pct(kpis.BatchRiskScore)
	resp.RiskTier = kpis.RiskTier
	resp.FinalityStatus = kpis.FinalityStatus
	resp.TotalCount = kpis.TotalCount
	resp.SuccessCount = kpis.SuccessCount
	resp.FailedCount = kpis.FailedCount
	resp.PendingCount = kpis.PendingCount
	// P1: batch quality fields from the same BATCH snapshot
	resp.BatchQualityScore = pct(kpis.BatchQualityScore)
	resp.ExactMatchCount = kpis.ExactMatchCount
	resp.HighConfidenceCount = kpis.HighConfidenceCount
	resp.AmbiguousCount = kpis.AmbiguousCount
	resp.UnresolvedCount = kpis.UnresolvedCount
	resp.ConflictedCount = kpis.ConflictedCount

	// ── P2/P3/P6: fetch TENANT-scoped PATTERN snapshot ───────────────────────
	// These rolling KPIs are written to a separate TENANT-scoped snapshot by
	// computeAndSaveTenantPatternKPIs (triggered on every BatchSummaryUpdated).
	tenantPatSnap, _ := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(), tenantID, "PATTERN", "TENANT", nil, from, to,
	)
	if tenantPatSnap != nil {
		var tKPIs tenantPatternKPIFields
		if jsonErr := json.Unmarshal(tenantPatSnap.SnapshotJSON, &tKPIs); jsonErr == nil {
			resp.DuplicateRiskRate = pct(tKPIs.DuplicateRiskRate)
			resp.DuplicateRiskCount = tKPIs.DuplicateRiskCount
			resp.SameBeneficiaryAmountDensity = pct(tKPIs.SameBeneficiaryAmountDensity)
			resp.SettlementDelayP95Days = tKPIs.SettlementDelayP95Days
		}
	}

	writeJSON(w, http.StatusOK, resp)
}
