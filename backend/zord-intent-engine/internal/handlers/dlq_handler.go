package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

type DLQHandler struct {
	repo persistence.DLQRepository
}

func NewDLQHandler(repo persistence.DLQRepository) *DLQHandler {
	return &DLQHandler{repo: repo}
}

// GET /v1/dlq
// R-01: this is a public, Kong-gated route protected by auth.Protect, which
// only rejects a *supplied* tenant_id that doesn't match the caller's
// principal — it does not require one to be present. This handler used to
// fall back to every tenant's rows when tenant_id was omitted, which meant
// any authenticated user could see every other tenant's DLQ data just by
// leaving the query param off. tenant_id is now required here, matching
// IntentHandler.List's pattern. The legitimate cross-tenant aggregate need
// (ops "resources" dashboard total DLQ count) is served by the internal-only
// /internal/dlq/count route (see CountAll below) instead.
func (h *DLQHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))

	if tenantID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "tenant_id is required"})
		return
	}

	items, err := h.repo.ListByTenant(ctx, tenantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// CountAll returns the platform-wide DLQ row count across every tenant.
// Internal-only (see cmd/main.go: wrapped in auth.RequireInternalScope) —
// backs the ops "resources" dashboard's aggregate count, which has no single
// tenant to scope to by design. Not reachable through the public gateway.
func (h *DLQHandler) CountAll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	items, err := h.repo.ListAll(ctx)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to count DLQ items", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(struct {
		Total int `json:"total"`
	}{Total: len(items)})
}

// NEW: GET /v1/dlq/:dlq_id
// Fetches a single DLQ entry by its primary key
func (h *DLQHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract dlq_id from URL path: /v1/dlq/{dlq_id}
	dlqID := strings.TrimPrefix(r.URL.Path, "/v1/dlq/")
	dlqID = strings.TrimSpace(dlqID)

	if dlqID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "dlq_id is required"})
		return
	}

	tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
	if tenantID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "X-Tenant-ID header is required"})
		return
	}

	entry, err := h.repo.GetByTenantAndID(ctx, tenantID, dlqID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Failed to fetch DLQ item",
			"details": err.Error(),
		})
		return
	}

	if entry == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "DLQ item not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}

// GET /v1/dlq/manual-review
func (h *DLQHandler) GetManualReviewDLQ(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
	if tenantID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "X-Tenant-ID header is required"})
		return
	}
	items, err := h.repo.ListManualReview(ctx, tenantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if items == nil {
		items = []models.DLQEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// GET /v1/dlq/terminal/count
func (h *DLQHandler) GetTerminalDLQCount(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
	if tenantID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "X-Tenant-ID header is required"})
		return
	}
	count, err := h.repo.CountTerminal(ctx, tenantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{
		"count": count,
	})
}
