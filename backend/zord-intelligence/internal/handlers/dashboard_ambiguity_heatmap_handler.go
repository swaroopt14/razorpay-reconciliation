package handlers

// dashboard_ambiguity_heatmap_handler.go
//
// GET /v1/intelligence/dashboard/ambiguity/heatmap
//
// Returns a Batch × Match Quality matrix for the ambiguity heatmap.
// Each row = one batch (top N by total_intended_amount_minor).
// Each column = attachment decision quality category.
//
// Data sources:
//   batch_contracts              → sort top N by total_intended_amount_minor
//   projection_state batch.health.* → exact/high/ambiguous/unresolved/conflicted counts
//
// Both data sources are populated by BatchSummaryUpdatedEvent from Service 5C.
// No external service calls needed at request time.
//
// Query params:
//   tenant_id   required
//   limit       optional — top N batches, default 10, max 20

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// BatchMatchRow is one row in the heatmap matrix.
type BatchMatchRow struct {
	BatchID                  string          `json:"batch_id"`
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"`
	TotalCount               int             `json:"total_count"`
	FinalityStatus           string          `json:"finality_status"`
	ExactMatchCount          int             `json:"exact_match_count"`
	HighConfidenceCount      int             `json:"high_confidence_count"`
	AmbiguousCount           int             `json:"ambiguous_count"`
	UnresolvedCount          int             `json:"unresolved_count"`
	ConflictedCount          int             `json:"conflicted_count"`
	AggregateScore           float64         `json:"aggregate_score"`
}

// DashboardAmbiguityHeatmapResponse is the payload for the heatmap endpoint.
type DashboardAmbiguityHeatmapResponse struct {
	TenantID         string          `json:"tenant_id"`
	DataAvailable    bool            `json:"data_available"`
	IntelligenceMode string          `json:"intelligence_mode,omitempty"`
	Batches          []BatchMatchRow `json:"batches"`
}

// batchHealthFields holds the fields extracted from a batch.health.* projection row.
type batchHealthFields struct {
	ExactMatchCount     int     `json:"exact_match_count"`
	HighConfidenceCount int     `json:"high_confidence_count"`
	AmbiguousCount      int     `json:"ambiguous_count"`
	UnresolvedCount     int     `json:"unresolved_count"`
	ConflictedCount     int     `json:"conflicted_count"`
	AggregateScore      float64 `json:"aggregate_score"`
}

// GetBatchMatchHeatmap handles GET /v1/intelligence/dashboard/ambiguity/heatmap
//
// Performance contract (fintech gold standard):
//   - Exactly 2 DB queries regardless of how many batches the tenant has.
//   - Query 1: top-N batches by amount, DB-sorted, DB-limited — index scan only.
//   - Query 2: health projections scoped to exactly those N batch IDs — no prefix scan.
//   - No in-memory sort. No unbounded fetches.
//   - Enforced 5-second request timeout guards against slow-query tail latency.
func (h *DashboardAmbiguityHandler) GetBatchMatchHeatmap(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed >= 1 && parsed <= 20 {
			limit = parsed
		}
	}

	// 5-second timeout — heatmap must never hold a goroutine longer than this.
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp := DashboardAmbiguityHeatmapResponse{
		TenantID:         tenantID,
		IntelligenceMode: h.intelligenceMode,
		Batches:          []BatchMatchRow{},
	}

	// ── Query 1: top-N batches, sorted and limited entirely in the DB ────────
	// Uses idx_batch_tenant_amount (tenant_id, total_intended_amount_minor DESC).
	// Returns at most `limit` rows — no in-memory sort, no over-fetch.
	batches, err := h.batchRepo.ListTopByAmount(ctx, tenantID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batches")
		return
	}
	if len(batches) == 0 {
		resp.DataAvailable = false
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// ── Query 2: health projections for exactly the selected batch IDs ───────
	// Build the exact key list — no wildcard, no prefix scan.
	// Uses idx_proj_tenant_key (tenant_id, projection_key, window_end DESC).
	keys := make([]string, len(batches))
	for i, bc := range batches {
		keys[i] = "batch.health." + bc.BatchID
	}

	healthProjections, err := h.projRepo.ListByKeys(ctx, tenantID, keys)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch health projections")
		return
	}

	// Build lookup map: batch_id → health fields
	healthMap := make(map[string]batchHealthFields, len(healthProjections))
	for _, proj := range healthProjections {
		batchID := strings.TrimPrefix(proj.ProjectionKey, "batch.health.")
		var fields batchHealthFields
		if err := json.Unmarshal([]byte(proj.ValueJSON), &fields); err == nil {
			healthMap[batchID] = fields
		}
	}

	// ── Merge: batch contract row + health projection ─────────────────────────
	// Row order is already correct (DB returned DESC by amount). Preserve it.
	result := make([]BatchMatchRow, 0, len(batches))
	for _, bc := range batches {
		row := BatchMatchRow{
			BatchID:                  bc.BatchID,
			TotalIntendedAmountMinor: bc.TotalIntendedAmountMinor,
			TotalCount:               bc.TotalCount,
			FinalityStatus:           bc.BatchFinalityStatus,
		}
		if health, ok := healthMap[bc.BatchID]; ok {
			row.ExactMatchCount = health.ExactMatchCount
			row.HighConfidenceCount = health.HighConfidenceCount
			row.AmbiguousCount = health.AmbiguousCount
			row.UnresolvedCount = health.UnresolvedCount
			row.ConflictedCount = health.ConflictedCount
			row.AggregateScore = math.Round(health.AggregateScore*10000) / 100
		}
		result = append(result, row)
	}

	resp.DataAvailable = true
	resp.Batches = result
	writeJSON(w, http.StatusOK, resp)
}
