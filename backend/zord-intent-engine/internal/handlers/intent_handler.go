package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

// IntentHandler handles HTTP requests for payment intents
type IntentHandler struct {
	queryRepo persistence.IntentQueryRepository
}

// NewIntentHandler creates a new handler instance
func NewIntentHandler(queryRepo persistence.IntentQueryRepository) *IntentHandler {
	return &IntentHandler{queryRepo: queryRepo}
}

// ----- RESPONSE STRUCTURES -----
// FIXED: Must match the frontend's IntentListResponse interface in intents.ts
// Before: { data: [...], total, page, page_size, total_pages }  ← WRONG
// After:  { items: [...], pagination: { page, page_size, total } }  ← CORRECT

type PaginationInfo struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type IntentListResponse struct {
	Items      []models.CanonicalIntent `json:"items"`
	Pagination PaginationInfo           `json:"pagination"`
}
type BatchSidebarResponse struct {
	Items []models.BatchSidebarItem `json:"items"`
}
type TablePagination struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type PaymentIntentDetailsSection struct {
	Items      []models.CanonicalIntent `json:"items"`
	Pagination TablePagination          `json:"pagination"`
}

type DLQDetailsSection struct {
	Items      []models.DLQEntry `json:"items"`
	Pagination TablePagination   `json:"pagination"`
}

type BatchDetailsPayload struct {
	BatchID        string                      `json:"batchId"`
	PaymentIntents PaymentIntentDetailsSection `json:"paymentIntents"`
	DLQItems       DLQDetailsSection           `json:"dlqItems"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code"`
	Message string `json:"message"`
	TraceID string `json:"trace_id,omitempty"`
}

// ENDPOINT 1: LIST INTENTS — GET /v1/intents
func (h *IntentHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract pagination parameters
	page := getIntParam(r, "page", 1)
	pageSize := getIntParam(r, "page_size", 20)

	// Enforce limits (security)
	if pageSize > 100 {
		pageSize = 100
	}
	if page < 1 {
		page = 1
	}

	// Extract filter parameters
	tenantID := r.URL.Query().Get("tenant_id")
	status := r.URL.Query().Get("status")
	intentType := r.URL.Query().Get("intent_type")
	batchID := strings.TrimSpace(r.URL.Query().Get("batch_id"))

	// Call repository
	intents, total, err := h.queryRepo.ListIntents(ctx, persistence.IntentFilter{
		TenantID:   tenantID,
		Status:     status,
		IntentType: intentType,
		BatchID:    batchID,
		Page:       page,
		PageSize:   pageSize,
	})

	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch intents", http.StatusInternalServerError, err)
		return
	}

	// Ensure empty array instead of null
	if intents == nil {
		intents = []models.CanonicalIntent{}
	}

	// FIXED: Build response matching frontend's IntentListResponse
	response := IntentListResponse{
		Items: intents,
		Pagination: PaginationInfo{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ENDPOINT 2: GET BY ID — GET /v1/intents/:intent_id
// FIXED: Return the intent directly, NOT wrapped in { "data": ... }
// Frontend does: const data = await response.json(); return data;
// So data must BE the intent, not { data: intent }
func (h *IntentHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract intent_id from URL
	path := strings.TrimPrefix(r.URL.Path, "/v1/intents/")
	intentID := strings.TrimSpace(path)

	if intentID == "" {
		respondError(w, "INVALID_REQUEST", "Intent ID is required", http.StatusBadRequest, nil)
		return
	}

	// Fetch from database
	tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id header is required", http.StatusBadRequest, nil)
		return
	}

	intent, err := h.queryRepo.GetIntentByID(ctx, tenantID, intentID)

	if err != nil {
		if err.Error() == "intent not found" || strings.Contains(err.Error(), "not found") {
			respondError(w, "NOT_FOUND", "Intent not found", http.StatusNotFound, err)
			return
		}

		respondError(w, "DATABASE_ERROR", "Failed to fetch intent", http.StatusInternalServerError, err)
		return
	}

	// FIXED: Send intent directly (not wrapped in { data: ... })
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(intent)
}

//  HELPERS

func getIntParam(r *http.Request, key string, defaultValue int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return defaultValue
	}

	intVal, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}

	return intVal
}

func (h *IntentHandler) ListBatchIDs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	tenantID := strings.TrimSpace(r.Header.Get("tenant_id"))
	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id header is required", http.StatusBadRequest, nil)
		return
	}

	items, err := h.queryRepo.ListBatchIDsByTenant(ctx, tenantID)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch batch ids", http.StatusInternalServerError, err)
		return
	}
	if items == nil {
		items = []models.BatchIDItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(struct {
		Items []models.BatchIDItem `json:"items"`
	}{Items: items})
}

func (h *IntentHandler) ListPaymentIntentLiteByBatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	tenantID := strings.TrimSpace(r.Header.Get("tenant_id"))
	if tenantID == "" {
		tenantID = strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	}
	batchID := strings.TrimSpace(r.Header.Get("batch_id"))
	if batchID == "" {
		batchID = strings.TrimSpace(r.URL.Query().Get("batch_id"))
	}

	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id header is required", http.StatusBadRequest, nil)
		return
	}
	if batchID == "" {
		respondError(w, "INVALID_REQUEST", "batch_id header is required", http.StatusBadRequest, nil)
		return
	}

	// Lite query includes intent_quality_score; returns every row for batchid (no pagination cap).
	items, err := h.queryRepo.ListPaymentIntentLiteByBatch(ctx, tenantID, batchID)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch payment intent data", http.StatusInternalServerError, err)
		return
	}
	if items == nil {
		items = []models.PaymentIntentLite{}
	}
	total := len(items)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(struct {
		Items      []models.PaymentIntentLite `json:"items"`
		Pagination TablePagination            `json:"pagination"`
	}{
		Items: items,
		Pagination: TablePagination{
			Page:     1,
			PageSize: total,
			Total:    total,
		},
	})
}

func (h *IntentHandler) ListDLQItemsByBatchSimple(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	tenantID := strings.TrimSpace(r.Header.Get("tenant_id"))
	batchID := strings.TrimSpace(r.Header.Get("batch_id"))

	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id header is required", http.StatusBadRequest, nil)
		return
	}
	if batchID == "" {
		respondError(w, "INVALID_REQUEST", "batch_id header is required", http.StatusBadRequest, nil)
		return
	}

	items, err := h.queryRepo.ListDLQItemsByBatchSimple(ctx, tenantID, batchID)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch dlq data", http.StatusInternalServerError, err)
		return
	}
	if items == nil {
		items = []models.DLQEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(struct {
		Items []models.DLQEntry `json:"items"`
	}{Items: items})
}
func respondError(w http.ResponseWriter, code, message string, httpStatus int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)

	errResp := ErrorResponse{
		Error:   "REQUEST_FAILED",
		Code:    code,
		Message: message,
	}
	_ = json.NewEncoder(w).Encode(errResp)
}
