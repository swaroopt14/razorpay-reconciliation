package handlers

// action_handler.go
//
// HTTP handlers for ActionContracts.
//
// PHASE 5 ADDITIONS:
//
//   POST /v1/intelligence/actions/{action_id}/approve
//        Human approves a PENDING_APPROVAL contract.
//        Transitions to APPROVED and inserts the outbox entry atomically.
//
//   POST /v1/intelligence/actions/{action_id}/dismiss
//        Human dismisses a PENDING_APPROVAL contract.
//        Transitions to DISMISSED. No outbox entry is ever created.
//
//   GET  /v1/intelligence/actions/pending-approval?tenant_id=X
//        Returns all PENDING_APPROVAL contracts ordered by expiry (most urgent first).
//        Powers the ops approval dashboard.
//
//   GET  /v1/intelligence/actions?tenant_id=X&decision=HOLD
//        Filter by decision type (new query parameter).
//
//   GET  /v1/intelligence/actions?tenant_id=X&policy_family=LEAKAGE
//        Filter by policy family (new query parameter).
//
// EXISTING ENDPOINTS (unchanged):
//   GET  /v1/intelligence/actions?tenant_id=X&limit=50
//   GET  /v1/intelligence/actions/{action_id}
//   GET  /v1/intelligence/actions?tenant_id=X&scope_field=contract_id&scope_value=ctr_01

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/auth"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// ActionHandler handles ActionContract HTTP requests.
type ActionHandler struct {
	actionRepo    *persistence.ActionContractRepo
	actionService *services.ActionService // PHASE 5: needed for approve/dismiss
}

// NewActionHandler creates an ActionHandler.
// PHASE 5: actionService is now required for approve/dismiss operations.
func NewActionHandler(
	actionRepo *persistence.ActionContractRepo,
	actionService *services.ActionService,
) *ActionHandler {
	return &ActionHandler{
		actionRepo:    actionRepo,
		actionService: actionService,
	}
}

// ── READ ENDPOINTS ─────────────────────────────────────────────────────────────

// ListActions handles GET /v1/intelligence/actions
//
// Query parameters:
//
//	tenant_id     → required
//	limit         → optional, default 50, max 100
//	before        → optional cursor for pagination (RFC3339 timestamp)
//	scope_field   → optional filter: "contract_id", "corridor_id", "intent_id", "batch_id"
//	scope_value   → required if scope_field is set
//	decision      → optional filter: "HOLD", "REVIEW_AMBIGUOUS_BATCH", etc. (PHASE 5)
//	policy_family → optional filter: "LEAKAGE", "AMBIGUITY", etc.       (PHASE 5)
func (h *ActionHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	// ── PHASE 5: decision filter ─────────────────────────────────────────
	if decisionStr := r.URL.Query().Get("decision"); decisionStr != "" {
		limit := parseLimit(r.URL.Query().Get("limit"))
		actions, err := h.actionRepo.ListByDecision(
			r.Context(), tenantID, models.Decision(decisionStr), limit,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch actions")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id": tenantID,
			"filter":    "decision=" + decisionStr,
			"actions":   actions,
			"count":     len(actions),
		})
		return
	}

	// ── PHASE 5: policy_family filter ────────────────────────────────────
	if familyStr := r.URL.Query().Get("policy_family"); familyStr != "" {
		limit := parseLimit(r.URL.Query().Get("limit"))
		actions, err := h.actionRepo.ListByPolicyFamily(
			r.Context(), tenantID, models.PolicyFamily(familyStr), limit,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch actions")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":     tenantID,
			"filter":        "policy_family=" + familyStr,
			"policy_family": familyStr,
			"actions":       actions,
			"count":         len(actions),
		})
		return
	}

	// ── Scope filter ──────────────────────────────────────────────────────
	scopeField := r.URL.Query().Get("scope_field")
	scopeValue := r.URL.Query().Get("scope_value")
	if scopeField != "" && scopeValue != "" {
		actions, err := h.actionRepo.ListByScope(r.Context(), tenantID, scopeField, scopeValue)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch actions")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"scope_field": scopeField,
			"scope_value": scopeValue,
			"actions":     actions,
			"count":       len(actions),
		})
		return
	}

	// ── Default: paginated list ───────────────────────────────────────────
	limit := parseLimit(r.URL.Query().Get("limit"))

	before := time.Now().UTC()
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := time.Parse(time.RFC3339, b); err == nil {
			before = parsed
		}
	}

	actions, err := h.actionRepo.List(r.Context(), tenantID, limit, before)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch actions")
		return
	}

	var nextCursor string
	if len(actions) == limit {
		nextCursor = actions[len(actions)-1].CreatedAt.Format(time.RFC3339)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":   tenantID,
		"actions":     actions,
		"count":       len(actions),
		"next_cursor": nextCursor,
	})
}

// GetAction handles GET /v1/intelligence/actions/{action_id}
func (h *ActionHandler) GetAction(w http.ResponseWriter, r *http.Request) {
	actionID := chi.URLParam(r, "action_id")
	tenantID := r.URL.Query().Get("tenant_id")
	if actionID == "" || tenantID == "" {
		writeError(w, http.StatusBadRequest, "action_id and tenant_id are required")
		return
	}

	// INTEL-02: tenant-scoped lookup — an action_id is not secret, so an
	// unscoped GetByID would let any caller who can guess/enumerate an ID
	// read another tenant's action. RequireTenantMatch has already rejected
	// any tenant_id that doesn't belong to the verified principal by the
	// time this handler runs, so tenantID here is trustworthy.
	action, err := h.actionRepo.GetByIDForTenant(r.Context(), tenantID, actionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch action")
		return
	}
	if action == nil {
		writeError(w, http.StatusNotFound, "action not found")
		return
	}
	writeJSON(w, http.StatusOK, action)
}

// ListPendingApproval handles GET /v1/intelligence/actions/pending-approval?tenant_id=X
//
// PHASE 5: Powers the ops approval dashboard.
// Returns all PENDING_APPROVAL contracts ordered by expiry (most urgent first).
// Ops team sees this queue and approves or dismisses each item before it expires.
func (h *ActionHandler) ListPendingApproval(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	actions, err := h.actionRepo.ListPendingApproval(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pending approvals")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id": tenantID,
		"actions":   actions,
		"count":     len(actions),
		// Include a summary for the dashboard banner
		"summary": buildApprovalSummary(actions),
	})
}

// ── APPROVAL LIFECYCLE ENDPOINTS (PHASE 5) ────────────────────────────────────

// ApproveAction handles POST /v1/intelligence/actions/{action_id}/approve
//
// PHASE 5: Transitions a PENDING_APPROVAL contract to APPROVED and
// inserts the outbox entry so the outbox_worker will deliver it to Kafka.
//
// Returns:
//
//	200 OK        → approved successfully
//	404 Not Found → action does not exist or belongs to a different tenant
//	409 Conflict  → action is not in PENDING_APPROVAL state
//	500 Internal  → database error
func (h *ActionHandler) ApproveAction(w http.ResponseWriter, r *http.Request) {
	actionID := chi.URLParam(r, "action_id")
	tenantID := r.URL.Query().Get("tenant_id")
	if actionID == "" || tenantID == "" {
		writeError(w, http.StatusBadRequest, "action_id and tenant_id are required")
		return
	}

	approved, err := h.actionService.ApproveAction(r.Context(), tenantID, actionID, actorFromRequest(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve action")
		return
	}
	if !approved {
		// Either not found, wrong tenant, or not in PENDING_APPROVAL.
		// We check existence first to give a precise status code. Tenant
		// scoping happens at the query level now (INTEL-02) instead of a
		// manual TenantID comparison after an unscoped fetch.
		action, lookupErr := h.actionRepo.GetByIDForTenant(r.Context(), tenantID, actionID)
		if lookupErr != nil || action == nil {
			writeError(w, http.StatusNotFound, "action not found")
			return
		}
		writeError(w, http.StatusConflict,
			"action cannot be approved: current status is "+string(action.ContractStatus))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"action_id": actionID,
		"status":    string(models.ContractStatusApproved),
		"message":   "action approved — will be delivered by outbox worker on next poll",
	})
}

// DismissAction handles POST /v1/intelligence/actions/{action_id}/dismiss
//
// PHASE 5: Transitions a PENDING_APPROVAL contract to DISMISSED.
// No outbox entry is ever created — the decision is permanently abandoned.
// Dismissed contracts are kept in the DB for audit trail.
//
// Returns:
//
//	200 OK        → dismissed successfully
//	404 Not Found → action does not exist or belongs to a different tenant
//	409 Conflict  → action is not in PENDING_APPROVAL state
func (h *ActionHandler) DismissAction(w http.ResponseWriter, r *http.Request) {
	actionID := chi.URLParam(r, "action_id")
	tenantID := r.URL.Query().Get("tenant_id")
	if actionID == "" || tenantID == "" {
		writeError(w, http.StatusBadRequest, "action_id and tenant_id are required")
		return
	}

	dismissed, err := h.actionService.DismissAction(r.Context(), tenantID, actionID, actorFromRequest(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to dismiss action")
		return
	}
	if !dismissed {
		action, lookupErr := h.actionRepo.GetByIDForTenant(r.Context(), tenantID, actionID)
		if lookupErr != nil || action == nil {
			writeError(w, http.StatusNotFound, "action not found")
			return
		}
		writeError(w, http.StatusConflict,
			"action cannot be dismissed: current status is "+string(action.ContractStatus))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"action_id": actionID,
		"status":    string(models.ContractStatusDismissed),
		"message":   "action dismissed — no actuation will occur",
	})
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// actorFromRequest builds the ActorInfo INTEL-02's audit trail records for
// an approve/dismiss decision: identity comes from the verified principal
// RequireAuth already put on context (never client-supplied), and an
// optional {"reason": "..."} JSON body supplies the reason. A missing or
// empty body is fine — reason is recorded as "" rather than rejected, since
// requiring it would be a client-visible breaking API change beyond this
// ticket's scope.
func actorFromRequest(r *http.Request) services.ActorInfo {
	principal, _ := auth.FromContext(r.Context())
	var body struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body) // best-effort; empty/absent body is fine
	}
	return services.ActorInfo{
		SubjectID: principal.SubjectID,
		Roles:     principal.Roles,
		Reason:    body.Reason,
	}
}

// parseLimit parses the limit query param with a safe default and max.
func parseLimit(s string) int {
	if s == "" {
		return 50
	}
	if parsed, err := strconv.Atoi(s); err == nil && parsed > 0 && parsed <= 100 {
		return parsed
	}
	return 50
}

// ApprovalSummary is the banner summary for the pending-approval dashboard.
type ApprovalSummary struct {
	TotalPending    int `json:"total_pending"`
	ExpiringIn1h    int `json:"expiring_in_1h"`    // contracts expiring within 1 hour
	ExpiringIn6h    int `json:"expiring_in_6h"`    // contracts expiring within 6 hours
	HighSeverity    int `json:"high_severity"`
	MediumSeverity  int `json:"medium_severity"`
	LowSeverity     int `json:"low_severity"`
}

// buildApprovalSummary computes summary counts for the pending-approval banner.
func buildApprovalSummary(actions []models.ActionContract) ApprovalSummary {
	now := time.Now().UTC()
	summary := ApprovalSummary{TotalPending: len(actions)}
	for _, a := range actions {
		if a.ExpiresAt != nil {
			remaining := a.ExpiresAt.Sub(now)
			if remaining <= time.Hour {
				summary.ExpiringIn1h++
			}
			if remaining <= 6*time.Hour {
				summary.ExpiringIn6h++
			}
		}
		switch a.Severity {
		case "HIGH":
			summary.HighSeverity++
		case "MEDIUM":
			summary.MediumSeverity++
		case "LOW":
			summary.LowSeverity++
		}
	}
	return summary
}
