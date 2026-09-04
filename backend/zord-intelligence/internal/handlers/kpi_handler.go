package handlers

// What is this file?
// HTTP handlers for KPI and projection data.
// These are the endpoints the zord-console dashboard calls most frequently.
//
// ENDPOINTS:
//   GET /v1/intelligence/kpis?tenant_id=X
//       → returns all latest projections for a tenant
//
//   GET /v1/intelligence/corridors/health?tenant_id=X
//       → returns success_rate and latency per corridor
//
//   GET /v1/intelligence/failures/top?tenant_id=X&corridor_id=Y
//       → returns top failure reason codes for a corridor

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// KPIHandler handles KPI and projection HTTP requests.
//
// PHASE 6: KPIHandler now holds the IntelligenceMode so it can:
//   1. Annotate every response with "intelligence_mode" field (Grade A/B)
//   2. Return a mode-appropriate error for Grade B-only endpoints when in Grade A
type KPIHandler struct {
	projRepo *persistence.ProjectionRepo
	mode     models.IntelligenceMode // PHASE 6
}

// NewKPIHandler creates a KPIHandler with its dependencies.
// PHASE 6: mode is required so responses carry the active mode annotation.
func NewKPIHandler(projRepo *persistence.ProjectionRepo, mode models.IntelligenceMode) *KPIHandler {
	return &KPIHandler{projRepo: projRepo, mode: mode}
}

// GetKPIs handles GET /v1/intelligence/kpis?tenant_id=X
//
// Returns the latest value of every projection key for a tenant.
// The frontend uses this to populate the main KPI dashboard.
//
// EXAMPLE RESPONSE:
//
//	{
//	  "tenant_id": "tnt_A",
//	  "projections": [
//	    { "projection_key": "corridor.success_rate.razorpay_UPI",
//	      "value_json": {"rate": 0.97, "total_count": 1000}, ... },
//	    { "projection_key": "tenant.evidence_readiness",
//	      "value_json": {"rate": 0.91, ...}, ... }
//	  ]
//	}
func (h *KPIHandler) GetKPIs(w http.ResponseWriter, r *http.Request) {
	// Read query parameter: /kpis?tenant_id=tnt_A
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id query parameter is required")
		return
	}

	projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch KPIs")
		return
	}

	// Build response — parse value_json into typed objects for the frontend
	type projectionResponse struct {
		ProjectionKey string      `json:"projection_key"`
		WindowStart   string      `json:"window_start"`
		WindowEnd     string      `json:"window_end"`
		Value         interface{} `json:"value"` // parsed JSON, not raw string
		ComputedAt    string      `json:"computed_at"`
	}

	var items []projectionResponse
	for _, p := range projections {
		// Parse value_json string → Go map → JSON-friendly object
		// This way the frontend gets structured data, not an escaped JSON string
		var parsedValue interface{}
		if err := json.Unmarshal([]byte(p.ValueJSON), &parsedValue); err != nil {
			// If parsing fails, send the raw string — still useful
			parsedValue = p.ValueJSON
		}

		items = append(items, projectionResponse{
			ProjectionKey: p.ProjectionKey,
			WindowStart:   p.WindowStart.Format("2006-01-02T15:04:05Z"),
			WindowEnd:     p.WindowEnd.Format("2006-01-02T15:04:05Z"),
			Value:         parsedValue,
			ComputedAt:    p.ComputedAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(h.mode), // PHASE 6: every response declares mode
		"projections":       items,
		"count":             len(items),
	})
}

// requireGradeB writes a structured "requires upgrade" response for endpoints
// that are only available in Grade B mode. Returns true if the check failed
// (caller should return immediately). Returns false if Grade B is active.
//
// PHASE 6: This helper enforces the commercial upgrade path at the API layer.
// Grade A tenants see a clear message telling them exactly what is needed.
func (h *KPIHandler) requireGradeB(w http.ResponseWriter, endpoint string) bool {
	if h.mode.IsGradeB() {
		return false // Grade B active — proceed normally
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"intelligence_mode": string(h.mode),
		"data_available":    false,
		"endpoint":          endpoint,
		"reason":            "requires_upgrade — this metric is only available in Grade B (Full Finality / Control Mode)",
		"upgrade_path":      "Set INTELLIGENCE_MODE=GRADE_B after routing dispatch through ZPI. See GET /v1/intelligence/mode for the full upgrade guide.",
	})
	return true
}

// GetCorridorHealth handles GET /v1/intelligence/corridors/health?tenant_id=X
//
// Returns a health summary per corridor — success rate + latency.
// The frontend uses this for the "Payment Health" dashboard panel.
//
// EXAMPLE RESPONSE:
//
//	{
//	  "corridors": [
//	    { "corridor_id": "razorpay_UPI",
//	      "success_rate": 0.97,
//	      "finality_p95_seconds": 480,
//	      "total_pending": 23 }
//	  ]
//	}
func (h *KPIHandler) GetCorridorHealth(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	// PHASE 6: Corridor health (success_rate, finality_latency, pending_backlog)
	// is populated by HandleFinalityCertIssued which is gated to Grade B.
	// In Grade A, return a clear upgrade signal rather than empty data.
	if h.requireGradeB(w, "GET /v1/intelligence/corridors/health") {
		return
	}
	projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch corridor health")
		return
	}

	// Group by corridor ID
	// corridorID → map of metric → value
	type corridorData struct {
		CorridorID         string  `json:"corridor_id"`
		SuccessRate        float64 `json:"success_rate"`
		FinalityP95Seconds float64 `json:"finality_p95_seconds"`
		TotalPending       int     `json:"total_pending"`
		TotalCount         int     `json:"total_count"`
		AnomalyScore       float64 `json:"anomaly_score"`
	}

	corridorMap := make(map[string]*corridorData)

	for _, p := range projections {
		// Extract corridor_id from projection_key
		// Key format: "corridor.success_rate.razorpay_UPI"
		corridorID := extractCorridorID(p.ProjectionKey)
		if corridorID == "" {
			continue // skip non-corridor projections
		}

		if _, exists := corridorMap[corridorID]; !exists {
			corridorMap[corridorID] = &corridorData{CorridorID: corridorID}
		}

		entry := corridorMap[corridorID]

		switch {
		case isKeyType(p.ProjectionKey, "success_rate"):
			var v models.SuccessRateValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err == nil {
				entry.SuccessRate = v.Rate
				entry.TotalCount = v.TotalCount
			}

		case isKeyType(p.ProjectionKey, "finality_latency"):
			var v models.FinalityLatencyValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err == nil {
				entry.FinalityP95Seconds = v.P95Seconds
			}

		case isKeyType(p.ProjectionKey, "pending_backlog"):
			var v models.PendingBacklogValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err == nil {
				entry.TotalPending = v.TotalPending
			}
		case isKeyType(p.ProjectionKey, "anomaly_score"):
			var v struct {
				Value float64 `json:"value"`
			}
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err == nil {
				entry.AnomalyScore = v.Value
			}
		}
	}

	// Convert map to slice for JSON response
	var corridors []*corridorData
	for _, c := range corridorMap {
		corridors = append(corridors, c)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(h.mode), // PHASE 6
		"corridors":         corridors,
		"count":             len(corridors),
	})
}

// GetTopFailures handles GET /v1/intelligence/failures/top?tenant_id=X&corridor_id=Y
//
// Returns the top failure reasons for a corridor.
// The frontend uses this for the "Failure Analysis" panel.
func (h *KPIHandler) GetTopFailures(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	key := "corridor.failure_taxonomy." + corridorID
	if corridorID == "" {
		key = "corridor.failure_taxonomy" // all corridors
	}

	var val struct {
		TopReasons []models.ReasonCount `json:"top_reasons"`
		TotalFails int                  `json:"total_fails"`
		Reasons    map[string]int       `json:"reasons"`
	}
	if err := h.projRepo.GetValueAs(r.Context(), tenantID, key, &val); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch failures")
		return
	}
	topReasons := make([]models.ReasonCount, 0)
	if len(val.TopReasons) > 0 {
		topReasons = append(topReasons, val.TopReasons...)
	} else if len(val.Reasons) > 0 {
		for reason, count := range val.Reasons {
			entry := models.ReasonCount{
				ReasonCode: reason,
				Count:      count,
			}
			if val.TotalFails > 0 {
				entry.Rate = float64(count) / float64(val.TotalFails)
			}
			topReasons = append(topReasons, entry)
		}
		sort.Slice(topReasons, func(i, j int) bool {
			if topReasons[i].Count == topReasons[j].Count {
				return topReasons[i].ReasonCode < topReasons[j].ReasonCode
			}
			return topReasons[i].Count > topReasons[j].Count
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":   tenantID,
		"corridor_id": corridorID,
		"top_reasons": topReasons,
		"total_fails": val.TotalFails,
	})
}

func (h *KPIHandler) GetMLAnomaly(w http.ResponseWriter, r *http.Request) {
	h.getMLScore(w, r, "corridor.anomaly_score.")
}

func (h *KPIHandler) GetMLSlaRisk(w http.ResponseWriter, r *http.Request) {
	h.getMLScore(w, r, "corridor.sla_breach_risk.")
}

func (h *KPIHandler) GetMLFailureShift(w http.ResponseWriter, r *http.Request) {
	h.getMLScore(w, r, "corridor.failure_cluster_shift_score.")
}

func (h *KPIHandler) getMLScore(w http.ResponseWriter, r *http.Request, keyPrefix string) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if corridorID == "" {
		writeError(w, http.StatusBadRequest, "corridor_id is required")
		return
	}
	// PHASE 6: ML scores (anomaly, SLA risk, failure shift) are fed by
	// corridor-level projections that require Grade B finality data.
	if h.requireGradeB(w, "GET /v1/intelligence/ml/"+keyPrefix) {
		return
	}

	var score struct {
		Value float64 `json:"value"`
	}
	if err := h.projRepo.GetValueAs(r.Context(), tenantID, keyPrefix+corridorID, &score); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch ml score")
		return
	}

	writeJSON(w, http.StatusOK, map[string]float64{
		"value": score.Value,
	})
}

// GetSLAStatus handles GET /v1/intelligence/sla?tenant_id=X
// Returns SLA timer status across all active intents for a tenant.
func (h *KPIHandler) GetSLAStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	// SLA timer query is done in sla_worker for now
	// This endpoint returns a placeholder until sla_worker is wired
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id": tenantID,
		"message":   "SLA status endpoint — wired in session 9",
	})
}

// ── Private helpers used only in this file ────────────────────────────────────

// extractCorridorID pulls the corridor ID from a projection key.
//
// Projection keys follow the format: "corridor.{metric_type}.{corridor_id}"
// where corridor_id itself may contain dots (e.g. "razorpay.UPI").
//
// Examples:
//   "corridor.success_rate.razorpay.UPI"       → "razorpay.UPI"
//   "corridor.retry_recovery_rate.cashfree.IMPS" → "cashfree.IMPS"
//   "tenant.evidence_readiness"                → "" (not a corridor key)
//
// Strategy: the first part is always "corridor", the second is the metric type,
// and everything after the second dot is the corridor_id (may itself contain dots).
func extractCorridorID(key string) string {
	// Must start with "corridor."
	if len(key) < 9 || key[:9] != "corridor." {
		return ""
	}
	rest := key[9:] // strip "corridor."

	// Find the next dot — that separates metric_type from corridor_id
	dotIdx := -1
	for i, c := range rest {
		if c == '.' {
			dotIdx = i
			break
		}
	}
	if dotIdx == -1 {
		return "" // no corridor_id segment (e.g. "corridor.somekey" with no third part)
	}
	corridorID := rest[dotIdx+1:]
	if corridorID == "" {
		return ""
	}
	return corridorID
}

// isKeyType checks if a projection key has a specific metric type as its second segment.
//
// "corridor.success_rate.razorpay.UPI" with "success_rate" → true
// "corridor.retry_recovery_rate.cashfree.IMPS" with "retry_recovery_rate" → true
// "tenant.evidence_readiness" with "evidence_readiness" → true
func isKeyType(key, metricType string) bool {
	// Find first dot
	first := -1
	for i, c := range key {
		if c == '.' {
			first = i
			break
		}
	}
	if first == -1 {
		return false
	}
	rest := key[first+1:] // e.g. "success_rate.razorpay.UPI"

	// Find second dot (or end of string)
	second := -1
	for i, c := range rest {
		if c == '.' {
			second = i
			break
		}
	}
	var segment string
	if second == -1 {
		segment = rest // e.g. "evidence_readiness" (no third part)
	} else {
		segment = rest[:second] // e.g. "success_rate"
	}
	return segment == metricType
}

// GetRetryRecoveryRate handles GET /v1/intelligence/retry-recovery?tenant_id=X&corridor_id=Y
//
// Returns retry efficiency for a corridor: how many retried payouts were
// ultimately recovered (reached SETTLED) vs total retries attempted.
//
// Business value: "Are our retries actually working, or are we wasting attempts?"
//
// Example response:
//
//	{
//	  "tenant_id": "tnt_A",
//	  "corridor_id": "razorpay_UPI",
//	  "total_attempts": 1200,
//	  "retry_attempts": 80,
//	  "recovered": 55,
//	  "recovery_rate": 0.6875,
//	  "window_start": "2024-01-15T00:00:00Z"
//	}
func (h *KPIHandler) GetRetryRecoveryRate(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	// PHASE 6: retry_recovery_rate requires dispatch control (Grade B)
	if h.requireGradeB(w, "GET /v1/intelligence/retry-recovery") {
		return
	}

	// If no corridor specified, list all corridor retry projections
	if corridorID == "" {
		projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch retry recovery data")
			return
		}

		type corridorRetry struct {
			CorridorID    string  `json:"corridor_id"`
			TotalAttempts int     `json:"total_attempts"`
			RetryAttempts int     `json:"retry_attempts"`
			Recovered     int     `json:"recovered"`
			RecoveryRate  float64 `json:"recovery_rate"`
		}

		var results []corridorRetry
		for _, p := range projections {
			if !isKeyType(p.ProjectionKey, "retry_recovery_rate") {
				continue
			}
			cid := extractCorridorID(p.ProjectionKey)
			var v models.RetryRecoveryRateValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
				continue
			}
			results = append(results, corridorRetry{
				CorridorID:    cid,
				TotalAttempts: v.TotalAttempts,
				RetryAttempts: v.RetryAttempts,
				Recovered:     v.Recovered,
				RecoveryRate:  v.RecoveryRate,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id": tenantID,
			"corridors": results,
			"count":     len(results),
		})
		return
	}

	key := "corridor.retry_recovery_rate." + corridorID
	p, err := h.projRepo.GetLatest(r.Context(), tenantID, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch retry recovery rate")
		return
	}
	if p == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"corridor_id": corridorID,
			"message":     "no data yet",
		})
		return
	}

	var v models.RetryRecoveryRateValue
	if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse retry recovery data")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":      tenantID,
		"corridor_id":    corridorID,
		"total_attempts": v.TotalAttempts,
		"retry_attempts": v.RetryAttempts,
		"recovered":      v.Recovered,
		"recovery_rate":  v.RecoveryRate,
		"window_start":   p.WindowStart.Format("2006-01-02T15:04:05Z"),
		"window_end":     p.WindowEnd.Format("2006-01-02T15:04:05Z"),
		"computed_at":    p.ComputedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetStatementMatchRate handles GET /v1/intelligence/statement-match?tenant_id=X&corridor_id=Y
//
// Returns what % of settled payouts appear in the bank statement.
// A falling match rate is a finance alarm — leakage or PSP settlement delay.
//
// Requires Service 5 to emit StatementMatchEvent (new topic: statement.match.event).
//
// Example response:
//
//	{
//	  "tenant_id": "tnt_A",
//	  "corridor_id": "razorpay_UPI",
//	  "total_settled": 1000,
//	  "matched": 970,
//	  "unmatched": 30,
//	  "match_rate": 0.97,
//	  "avg_match_age_seconds": 1200
//	}
func (h *KPIHandler) GetStatementMatchRate(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	// PHASE 6: statement match rate requires Service 5 statement.match.event (Grade B)
	if h.requireGradeB(w, "GET /v1/intelligence/statement-match") {
		return
	}

	if corridorID == "" {
		// Return all corridors
		projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch statement match data")
			return
		}
		type corridorMatch struct {
			CorridorID          string  `json:"corridor_id"`
			TotalSettled        int     `json:"total_settled"`
			Matched             int     `json:"matched"`
			Unmatched           int     `json:"unmatched"`
			MatchRate           float64 `json:"match_rate"`
			AvgMatchAgeSeconds  float64 `json:"avg_match_age_seconds"`
		}
		var results []corridorMatch
		for _, p := range projections {
			if !isKeyType(p.ProjectionKey, "statement_match_rate") {
				continue
			}
			cid := extractCorridorID(p.ProjectionKey)
			var v models.StatementMatchRateValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
				continue
			}
			results = append(results, corridorMatch{
				CorridorID:         cid,
				TotalSettled:       v.TotalSettled,
				Matched:            v.Matched,
				Unmatched:          v.Unmatched,
				MatchRate:          v.MatchRate,
				AvgMatchAgeSeconds: v.AvgMatchAgeSecs,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id": tenantID,
			"corridors": results,
			"count":     len(results),
		})
		return
	}

	key := "corridor.statement_match_rate." + corridorID
	p, err := h.projRepo.GetLatest(r.Context(), tenantID, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch statement match rate")
		return
	}
	if p == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"corridor_id": corridorID,
			"message":     "no data yet — ensure Service 5 is emitting statement.match.event",
		})
		return
	}

	var v models.StatementMatchRateValue
	if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse statement match data")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":            tenantID,
		"corridor_id":          corridorID,
		"total_settled":        v.TotalSettled,
		"matched":              v.Matched,
		"unmatched":            v.Unmatched,
		"match_rate":           v.MatchRate,
		"avg_match_age_seconds": v.AvgMatchAgeSecs,
		"window_start":         p.WindowStart.Format("2006-01-02T15:04:05Z"),
		"window_end":           p.WindowEnd.Format("2006-01-02T15:04:05Z"),
		"computed_at":          p.ComputedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetProviderRefMissingRate handles GET /v1/intelligence/provider-ref-missing?tenant_id=X&corridor_id=Y
//
// Returns what % of finalized payouts are missing a provider reference
// (UTR / RRN / BankRef). Missing refs mean weaker evidence packs and
// harder dispute resolution.
//
// Requires Service 5's FinalityCertIssuedEvent to include has_provider_ref field.
//
// Example response:
//
//	{
//	  "tenant_id": "tnt_A",
//	  "corridor_id": "cashfree_IMPS",
//	  "total_finalized": 500,
//	  "missing_ref": 45,
//	  "with_ref": 455,
//	  "missing_rate": 0.09
//	}
func (h *KPIHandler) GetProviderRefMissingRate(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	// PHASE 6: provider ref quality requires finality certs (Grade B)
	if h.requireGradeB(w, "GET /v1/intelligence/provider-ref-missing") {
		return
	}

	if corridorID == "" {
		projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch provider ref data")
			return
		}
		type corridorRef struct {
			CorridorID     string  `json:"corridor_id"`
			TotalFinalized int     `json:"total_finalized"`
			MissingRef     int     `json:"missing_ref"`
			WithRef        int     `json:"with_ref"`
			MissingRate    float64 `json:"missing_rate"`
		}
		var results []corridorRef
		for _, p := range projections {
			if !isKeyType(p.ProjectionKey, "provider_ref_missing_rate") {
				continue
			}
			cid := extractCorridorID(p.ProjectionKey)
			var v models.ProviderRefMissingRateValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
				continue
			}
			results = append(results, corridorRef{
				CorridorID:     cid,
				TotalFinalized: v.TotalFinalized,
				MissingRef:     v.MissingRef,
				WithRef:        v.WithRef,
				MissingRate:    v.MissingRate,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id": tenantID,
			"corridors": results,
			"count":     len(results),
		})
		return
	}

	key := "corridor.provider_ref_missing_rate." + corridorID
	p, err := h.projRepo.GetLatest(r.Context(), tenantID, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch provider ref missing rate")
		return
	}
	if p == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"corridor_id": corridorID,
			"message":     "no data yet",
		})
		return
	}

	var v models.ProviderRefMissingRateValue
	if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse provider ref data")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":       tenantID,
		"corridor_id":     corridorID,
		"total_finalized": v.TotalFinalized,
		"missing_ref":     v.MissingRef,
		"with_ref":        v.WithRef,
		"missing_rate":    v.MissingRate,
		"window_start":    p.WindowStart.Format("2006-01-02T15:04:05Z"),
		"window_end":      p.WindowEnd.Format("2006-01-02T15:04:05Z"),
		"computed_at":     p.ComputedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetConflictRateInFusion handles GET /v1/intelligence/fusion-conflicts?tenant_id=X&corridor_id=Y
//
// Returns how often Outcome Fusion encounters conflicting signals for this corridor.
// High conflict rate = unreliable PSP signals = higher ops cost + risk.
//
// Requires Service 5's FinalityCertIssuedEvent to include conflict_count + conflict_types.
//
// Example response:
//
//	{
//	  "tenant_id": "tnt_A",
//	  "corridor_id": "razorpay_UPI",
//	  "total_finalized": 1000,
//	  "with_conflicts": 87,
//	  "conflict_rate": 0.087,
//	  "total_conflicts": 95,
//	  "conflict_type_breakdown": {
//	    "webhook_vs_poll_mismatch": 50,
//	    "amount_mismatch": 37
//	  }
//	}
func (h *KPIHandler) GetConflictRateInFusion(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	corridorID := r.URL.Query().Get("corridor_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	// PHASE 6: Outcome Fusion conflict rate requires finality certs (Grade B)
	if h.requireGradeB(w, "GET /v1/intelligence/fusion-conflicts") {
		return
	}

	if corridorID == "" {
		projections, err := h.projRepo.ListByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch fusion conflict data")
			return
		}
		type corridorConflict struct {
			CorridorID            string         `json:"corridor_id"`
			TotalFinalized        int            `json:"total_finalized"`
			WithConflicts         int            `json:"with_conflicts"`
			ConflictRate          float64        `json:"conflict_rate"`
			TotalConflicts        int            `json:"total_conflicts"`
			ConflictTypeBreakdown map[string]int `json:"conflict_type_breakdown"`
		}
		var results []corridorConflict
		for _, p := range projections {
			if !isKeyType(p.ProjectionKey, "conflict_rate_in_fusion") {
				continue
			}
			cid := extractCorridorID(p.ProjectionKey)
			var v models.ConflictRateInFusionValue
			if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
				continue
			}
			results = append(results, corridorConflict{
				CorridorID:            cid,
				TotalFinalized:        v.TotalFinalized,
				WithConflicts:         v.WithConflicts,
				ConflictRate:          v.ConflictRate,
				TotalConflicts:        v.TotalConflicts,
				ConflictTypeBreakdown: v.ConflictTypeBreakdown,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id": tenantID,
			"corridors": results,
			"count":     len(results),
		})
		return
	}

	key := "corridor.conflict_rate_in_fusion." + corridorID
	p, err := h.projRepo.GetLatest(r.Context(), tenantID, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch conflict rate")
		return
	}
	if p == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"corridor_id": corridorID,
			"message":     "no data yet",
		})
		return
	}

	var v models.ConflictRateInFusionValue
	if err := json.Unmarshal([]byte(p.ValueJSON), &v); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse conflict rate data")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":               tenantID,
		"corridor_id":             corridorID,
		"total_finalized":         v.TotalFinalized,
		"with_conflicts":          v.WithConflicts,
		"conflict_rate":           v.ConflictRate,
		"total_conflicts":         v.TotalConflicts,
		"conflict_type_breakdown": v.ConflictTypeBreakdown,
		"window_start":            p.WindowStart.Format("2006-01-02T15:04:05Z"),
		"window_end":              p.WindowEnd.Format("2006-01-02T15:04:05Z"),
		"computed_at":             p.ComputedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetSLABreachRate handles GET /v1/intelligence/sla-breach?tenant_id=X
//
// Returns SLA breach metrics for a tenant.
// Example response:
// {
//   "tenant_id": "tnt_A",
//   "total_processed": 1000,
//   "breached": 45,
//   "on_time": 955,
//   "breach_rate": 0.045,
//   "avg_breach_seconds": 1200,
//   "window_start": "2024-01-15T00:00:00Z",
//   "window_end": "2024-01-16T00:00:00Z"
// }
func (h *KPIHandler) GetSLABreachRate(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id query parameter is required")
		return
	}
	// PHASE 6: SLA breach rate requires ZPI to own the SLA clock (Grade B)
	if h.requireGradeB(w, "GET /v1/intelligence/sla-breach") {
		return
	}

	key := "tenant.sla_breach_rate"
	
	p, err := h.projRepo.GetLatest(r.Context(), tenantID, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch SLA breach rate")
		return
	}

	if p == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":       tenantID,
			"message":         "no data available yet",
			"total_processed": 0,
			"breached":        0,
			"breach_rate":     0.0,
		})
		return
	}

	// Parse the JSONB value_json into our SLABreachRateValue struct
	var breachData models.SLABreachRateValue
	if err := json.Unmarshal([]byte(p.ValueJSON), &breachData); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse SLA data")
		return
	}

	// Format response for the dashboard
	response := map[string]interface{}{
		"tenant_id":          tenantID,
		"total_processed":    breachData.TotalProcessed,
		"breached":           breachData.Breached,
		"on_time":            breachData.OnTime,
		"breach_rate":        breachData.BreachRate,
		"avg_breach_seconds": breachData.AvgBreachSeconds,
		"window_start":       p.WindowStart.Format("2006-01-02T15:04:05Z"),
		"window_end":         p.WindowEnd.Format("2006-01-02T15:04:05Z"),
		"computed_at":        p.ComputedAt.Format("2006-01-02T15:04:05Z"),
	}

	writeJSON(w, http.StatusOK, response)
}

// chi is imported for URL params in other handlers — keep it used
var _ = chi.URLParam
