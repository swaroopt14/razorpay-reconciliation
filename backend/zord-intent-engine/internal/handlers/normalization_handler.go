package handlers

import (
    "database/sql"
    "net/http"
)

type NormalizationHandler struct {
    db *sql.DB
}

func NewNormalizationHandler(db *sql.DB) *NormalizationHandler {
    return &NormalizationHandler{db: db}
}

// GET /internal/normalization/quality
// Returns aggregated normalization quality metrics for the last 5 minutes.
// Called by the Airflow quality DAG.
func (h *NormalizationHandler) Quality(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
    if !authorizeRelay(r) {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    const q = `
        SELECT
            COUNT(*)                                                    AS total,
            AVG(CASE WHEN mapping_uncertain_flag THEN 1.0 ELSE 0.0 END) AS fuzzy_match_rate,
            AVG(CASE WHEN unmapped_json != '{}' THEN 1.0 ELSE 0.0 END)  AS unmapped_field_pct,
            AVG(CASE WHEN required_field_gap_count = 0 THEN 1.0 ELSE 0.0 END) AS parse_success_rate
        FROM normalized_ingest_records
        WHERE created_at > now() - interval '5 minutes'`

    var total                                            int
    var fuzzyMatchRate, unmappedFieldPct, parseSuccessRate float64

    err := h.db.QueryRowContext(r.Context(), q).Scan(
        &total, &fuzzyMatchRate, &unmappedFieldPct, &parseSuccessRate,
    )
    if err != nil {
        http.Error(w, "query failed", http.StatusInternalServerError)
        return
    }

    writeJSON(w, http.StatusOK, map[string]any{
        "total_records":      total,
        "fuzzy_match_rate":   fuzzyMatchRate,
        "unmapped_field_pct": unmappedFieldPct,
        "parse_success_rate": parseSuccessRate,
        "window_minutes":     5,
    })
}
