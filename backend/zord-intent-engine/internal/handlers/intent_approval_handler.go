package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"zord-intent-engine/internal/services"
)

// IntentApprover is the narrow slice of IntentService this handler needs —
// R-05's minimal approval primitive for a held (REQUIRES_REVIEW) intent.
type IntentApprover interface {
	ApproveHeldIntent(ctx context.Context, tenantID, intentID string) (string, error)
}

type IntentApprovalHandler struct {
	approver IntentApprover
}

func NewIntentApprovalHandler(approver IntentApprover) *IntentApprovalHandler {
	return &IntentApprovalHandler{approver: approver}
}

// POST /v1/admin/intents/{intent_id}/approve
// Re-runs R-05's atomic daily-limit reservation against today's usage; if
// it now fits, the intent flips to ACCEPTED. If it still doesn't fit, it
// stays FLAGGED_FOR_REVIEW and this can be retried later.
func (h *IntentApprovalHandler) Approve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, "METHOD_NOT_ALLOWED", "POST required", http.StatusMethodNotAllowed, nil)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/v1/admin/intents/")
	if !strings.HasSuffix(path, "/approve") {
		respondError(w, "NOT_FOUND", "unknown route", http.StatusNotFound, nil)
		return
	}
	intentID := strings.TrimSpace(strings.TrimSuffix(path, "/approve"))
	if intentID == "" {
		respondError(w, "INVALID_REQUEST", "intent_id is required", http.StatusBadRequest, nil)
		return
	}

	tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))
	if tenantID == "" {
		tenantID = strings.TrimSpace(r.Header.Get("tenant_id"))
	}
	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id header is required", http.StatusBadRequest, nil)
		return
	}

	decision, err := h.approver.ApproveHeldIntent(r.Context(), tenantID, intentID)
	if err != nil {
		if errors.Is(err, services.ErrIntentNotHeld) {
			respondError(w, "NOT_HELD", "intent is not currently held for review", http.StatusConflict, err)
			return
		}
		respondError(w, "APPROVAL_FAILED", "failed to approve intent", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(struct {
		Decision string `json:"decision"`
	}{Decision: decision})
}
