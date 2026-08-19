package handlers

// What is this file?
// HTTP handlers for managing policies.
// Ops team uses these endpoints to create, enable, and disable rules.
//
// ENDPOINTS:
//   GET  /v1/intelligence/policies          → list all policies
//   GET  /v1/intelligence/policies/{id}     → get one policy
//   POST /v1/intelligence/policies          → create a new policy
//   POST /v1/intelligence/policies/{id}/enable   → enable a policy
//   POST /v1/intelligence/policies/{id}/disable  → disable a policy

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/auth"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// PolicyHandler handles policy management HTTP requests.
type PolicyHandler struct {
	policyRepo *persistence.PolicyRepo
}

// NewPolicyHandler creates a PolicyHandler.
func NewPolicyHandler(policyRepo *persistence.PolicyRepo) *PolicyHandler {
	return &PolicyHandler{policyRepo: policyRepo}
}

// ListPolicies handles GET /v1/intelligence/policies
// Returns all policies (enabled and disabled).
func (h *PolicyHandler) ListPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := h.policyRepo.ListAll(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch policies")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"policies": policies,
		"count":    len(policies),
	})
}

// GetPolicy handles GET /v1/intelligence/policies/{id}
// Returns one policy by its ID.
func (h *PolicyHandler) GetPolicy(w http.ResponseWriter, r *http.Request) {
	// chi.URLParam reads a path parameter defined in the route
	// Route: /policies/{id}
	// Request: /policies/P_SLA_BREACH_RISK
	// chi.URLParam(r, "id") → "P_SLA_BREACH_RISK"
	policyID := chi.URLParam(r, "id")
	if policyID == "" {
		writeError(w, http.StatusBadRequest, "policy id is required")
		return
	}

	policy, err := h.policyRepo.GetByID(r.Context(), policyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch policy")
		return
	}
	if policy == nil {
		writeError(w, http.StatusNotFound, "policy not found")
		return
	}

	writeJSON(w, http.StatusOK, policy)
}

// CreatePolicy handles POST /v1/intelligence/policies
//
// Request body:
//
//	{
//	  "policy_id":     "P_MY_RULE",
//	  "scope_type":    "corridor",
//	  "trigger_type":  "event",
//	  "trigger_value": "finality.certificate.issued",
//	  "dsl":           "WHEN corridor.success_rate < 0.85\nTHEN ACTION ESCALATE severity=HIGH"
//	}
//
// New policies start DISABLED — must be explicitly enabled via the enable endpoint.
func (h *PolicyHandler) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	// Decode the request body JSON into a Policy struct
	var req models.Policy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	// Validate required fields
	if req.PolicyID == "" {
		writeError(w, http.StatusBadRequest, "policy_id is required")
		return
	}
	if req.ScopeType == "" {
		writeError(w, http.StatusBadRequest, "scope_type is required")
		return
	}
	if req.TriggerType == "" {
		writeError(w, http.StatusBadRequest, "trigger_type is required")
		return
	}
	if req.DSL == "" {
		writeError(w, http.StatusBadRequest, "dsl is required")
		return
	}

	// Set defaults
	if req.Version == 0 {
		req.Version = 1
	}
	req.Enabled = false // always start disabled for safety

	if err := h.policyRepo.Insert(r.Context(), req); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create policy")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"policy_id": req.PolicyID,
		"message":   "policy created (disabled by default — use /enable to activate)",
	})
}

// EnablePolicy handles POST /v1/intelligence/policies/{id}/enable
func (h *PolicyHandler) EnablePolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "id")
	principal, _ := auth.FromContext(r.Context())

	if err := h.policyRepo.SetEnabled(r.Context(), policyID, true, principal.SubjectID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "policy not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to enable policy: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"policy_id": policyID,
		"status":    "enabled",
	})
}

// DisablePolicy handles POST /v1/intelligence/policies/{id}/disable
func (h *PolicyHandler) DisablePolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "id")
	principal, _ := auth.FromContext(r.Context())

	if err := h.policyRepo.SetEnabled(r.Context(), policyID, false, principal.SubjectID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "policy not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to disable policy: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"policy_id": policyID,
		"status":    "disabled",
	})
}
