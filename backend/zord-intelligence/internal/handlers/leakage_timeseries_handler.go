package handlers

import (
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

type LeakageTimeseriesHandler struct {
	batchRepo *persistence.BatchContractRepo
}

func NewLeakageTimeseriesHandler(batchRepo *persistence.BatchContractRepo) *LeakageTimeseriesHandler {
	return &LeakageTimeseriesHandler{batchRepo: batchRepo}
}

type leakageExposurePoint struct {
	Date                  string          `json:"date"`
	CurrentLeakageMinor   decimal.Decimal `json:"current_leakage_minor"`
	PredictedLeakageMinor decimal.Decimal `json:"predicted_leakage_minor"`
	IsFuture              bool            `json:"is_future,omitempty"`
}

type leakageExposureResponse struct {
	TenantID       string                 `json:"tenant_id"`
	DataAvailable  bool                   `json:"data_available"`
	Reason         string                 `json:"reason,omitempty"`
	ComputedAt     time.Time              `json:"computed_at"`
	WindowStart    time.Time              `json:"window_start"`
	WindowEnd      time.Time              `json:"window_end"`
	Granularity    string                 `json:"granularity,omitempty"`
	BatchID        string                 `json:"batch_id,omitempty"`
	ProjectStartAt *time.Time             `json:"project_start_at,omitempty"`
	Series         []leakageExposurePoint `json:"series,omitempty"`
}

func (h *LeakageTimeseriesHandler) GetLeakageExposure(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	granularity := r.URL.Query().Get("granularity")
	if granularity == "" {
		granularity = "day"
	}
	if granularity != "day" && granularity != "week" && granularity != "month" {
		writeError(w, http.StatusBadRequest, "granularity must be one of day, week, month")
		return
	}

	var batchID *string
	if raw := r.URL.Query().Get("batch_id"); raw != "" {
		batchID = &raw
	}

	now := time.Now().UTC()
	from := leakageSeriesStart(now, granularity)
	rows, err := h.batchRepo.ListForLeakageExposure(r.Context(), tenantID, batchID, from)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch leakage exposure series")
		return
	}

	resp := leakageExposureResponse{
		TenantID:    tenantID,
		ComputedAt:  now,
		WindowStart: from,
		WindowEnd:   leakageSeriesWindowEnd(now, granularity),
		Granularity: granularity,
	}
	if batchID != nil {
		resp.BatchID = *batchID
	}

	if len(rows) == 0 {
		resp.DataAvailable = false
		resp.Reason = "No batch predictions available for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	series := initLeakageSeriesBuckets(from, now, granularity)
	indexByDate := make(map[string]int, len(series))
	bucketCounts := make([]int, len(series))
	for i := range series {
		indexByDate[series[i].Date] = i
	}

	hasPrediction := false
	for _, row := range rows {
		if row.PredictedLeakageMinor == nil {
			continue
		}
		hasPrediction = true
		ts := row.CreatedAt.UTC()
		if row.FirstIntentCreatedAt != nil {
			ts = row.FirstIntentCreatedAt.UTC()
		}
		key := leakageBucketKey(ts, granularity)
		idx, ok := indexByDate[key]
		if !ok {
			continue
		}
		current := row.UnmatchedAmountMinor.Add(row.UnderSettlementAmountMinor).Add(row.ReversalExposureMinor)
		series[idx].CurrentLeakageMinor = series[idx].CurrentLeakageMinor.Add(current)
		series[idx].PredictedLeakageMinor = series[idx].PredictedLeakageMinor.Add(*row.PredictedLeakageMinor)
		bucketCounts[idx]++
	}

	if !hasPrediction {
		resp.DataAvailable = false
		resp.Reason = "Predicted leakage is not available yet for this period"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	trimmed := make([]leakageExposurePoint, 0, len(series))
	for idx, point := range series {
		if bucketCounts[idx] > 0 {
			trimmed = append(trimmed, point)
		}
	}
	if len(trimmed) > 0 {
		resp.WindowStart = mustParseLeakageBucketDate(trimmed[0].Date)
		resp.WindowEnd = mustParseLeakageBucketDate(trimmed[len(trimmed)-1].Date)
		series = trimmed
	}

	resp.DataAvailable = true
	resp.Series = series
	writeJSON(w, http.StatusOK, resp)
}

func leakageSeriesStart(now time.Time, granularity string) time.Time {
	switch granularity {
	case "week":
		start := now.AddDate(0, 0, -7*11)
		return startOfISOWeek(start)
	case "month":
		start := now.AddDate(0, -11, 0)
		return time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	default:
		start := now.AddDate(0, 0, -29)
		return time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	}
}

func leakageSeriesWindowEnd(now time.Time, granularity string) time.Time {
	switch granularity {
	case "week":
		return startOfISOWeek(now)
	case "month":
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	default:
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	}
}

func initLeakageSeriesBuckets(from, now time.Time, granularity string) []leakageExposurePoint {
	var series []leakageExposurePoint
	switch granularity {
	case "week":
		cursor := startOfISOWeek(from)
		end := startOfISOWeek(now)
		for !cursor.After(end) {
			series = append(series, leakageExposurePoint{Date: cursor.Format("2006-01-02")})
			cursor = cursor.AddDate(0, 0, 7)
		}
	case "month":
		cursor := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		for !cursor.After(end) {
			series = append(series, leakageExposurePoint{Date: cursor.Format("2006-01-02")})
			cursor = cursor.AddDate(0, 1, 0)
		}
	default:
		cursor := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
		end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		for !cursor.After(end) {
			series = append(series, leakageExposurePoint{Date: cursor.Format("2006-01-02")})
			cursor = cursor.AddDate(0, 0, 1)
		}
	}
	return series
}

func leakageBucketKey(ts time.Time, granularity string) string {
	switch granularity {
	case "week":
		return startOfISOWeek(ts).Format("2006-01-02")
	case "month":
		return time.Date(ts.Year(), ts.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	default:
		return time.Date(ts.Year(), ts.Month(), ts.Day(), 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	}
}

func startOfISOWeek(ts time.Time) time.Time {
	weekday := int(ts.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	start := ts.AddDate(0, 0, -(weekday - 1))
	return time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
}

func mustParseLeakageBucketDate(value string) time.Time {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}
	}
	return parsed.UTC()
}
