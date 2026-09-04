package handlers

// trace_handler.go
//
// INTEL-04 acceptance test: "dashboard metric can navigate to source
// event/trace." Exposes the event_receipts idempotency ledger, filtered by
// trace_id, so a caller who has a trace_id (e.g. surfaced on a dashboard
// metric once upstream services populate it — see INTEL-04's "map Service 2
// schema_version/trace_id through Relay" sub-item) can walk every ZPI
// ingestion event that shared it, in the order they arrived.

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// TraceHandler serves the trace-drilldown endpoint.
type TraceHandler struct {
	receiptRepo *persistence.EventReceiptRepo
}

// NewTraceHandler creates a TraceHandler.
func NewTraceHandler(receiptRepo *persistence.EventReceiptRepo) *TraceHandler {
	return &TraceHandler{receiptRepo: receiptRepo}
}

// traceEventResponse is the API-facing shape of one event_receipts row.
type traceEventResponse struct {
	EventID          string     `json:"event_id"`
	EventType        string     `json:"event_type"`
	EventSource      string     `json:"event_source"`
	SourceTopic      string     `json:"source_topic"`
	EventVersion     string     `json:"event_version"`
	ScopeType        *string    `json:"scope_type"`
	ScopeRef         *string    `json:"scope_ref"`
	PayloadHash      *string    `json:"payload_hash"`
	ProcessingStatus string     `json:"processing_status"`
	ReceivedAt       time.Time  `json:"received_at"`
	ProcessedAt      *time.Time `json:"processed_at"`
	ErrorCode        *string    `json:"error_code"`
	ErrorDetail      *string    `json:"error_detail"`
}

// traceResponse is the full GET /v1/intelligence/trace/{trace_id} response.
type traceResponse struct {
	TraceID    string               `json:"trace_id"`
	TenantID   string               `json:"tenant_id"`
	EventCount int                  `json:"event_count"`
	Events     []traceEventResponse `json:"events"`
}

// GetTrace handles GET /v1/intelligence/trace/{trace_id}?tenant_id=X
//
// Returns every event_receipts row carrying this trace_id for this tenant,
// ordered received_at ASC (earliest event first — chronological reading
// order top-to-bottom in the JSON array, matching how a human would trace
// what happened to a request through the system).
//
// tenant_id is a required query parameter, not optional — this is the same
// tenant-scoping convention every other tenant-owned lookup in this
// codebase follows (e.g. GET /batches/{batch_id}?tenant_id=X); a trace_id
// alone is not treated as sufficient authorization to read across tenants.
func (h *TraceHandler) GetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "trace_id")
	if traceID == "" {
		writeError(w, http.StatusBadRequest, "trace_id is required")
		return
	}

	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	rows, err := h.receiptRepo.ListByTraceID(r.Context(), tenantID, traceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch trace")
		return
	}

	events := make([]traceEventResponse, 0, len(rows))
	for _, row := range rows {
		events = append(events, traceEventResponse{
			EventID:          row.EventID,
			EventType:        row.EventType,
			EventSource:      row.EventSource,
			SourceTopic:      row.SourceTopic,
			EventVersion:     row.EventVersion,
			ScopeType:        row.ScopeType,
			ScopeRef:         row.ScopeRef,
			PayloadHash:      row.PayloadHash,
			ProcessingStatus: row.ProcessingStatus,
			ReceivedAt:       row.ReceivedAt,
			ProcessedAt:      row.ProcessedAt,
			ErrorCode:        row.ErrorCode,
			ErrorDetail:      row.ErrorDetail,
		})
	}

	writeJSON(w, http.StatusOK, traceResponse{
		TraceID:    traceID,
		TenantID:   tenantID,
		EventCount: len(events),
		Events:     events,
	})
}
