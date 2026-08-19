package models

import "time"

// ActionContractDecision is an append-only audit record of one approve or
// dismiss decision made on an ActionContract (INTEL-02). action_contracts
// itself is immutable once created — see ActionContract's GOLDEN RULE
// comment — so who decided what, why, and against which contract version
// lives here instead of as columns on that row.
type ActionContractDecision struct {
	DecisionID string `json:"decision_id" db:"decision_id"`
	ActionID   string `json:"action_id" db:"action_id"`
	TenantID   string `json:"tenant_id" db:"tenant_id"`

	Decision string `json:"decision" db:"decision"`
	// "APPROVED" | "DISMISSED"

	ActorSubjectID string `json:"actor_subject_id" db:"actor_subject_id"`
	// Verified principal's SubjectID (auth.AuthPrincipal) at decision time.
	ActorRoles string `json:"actor_roles,omitempty" db:"actor_roles"`
	// Comma-joined role snapshot at decision time.
	Reason string `json:"reason,omitempty" db:"reason"`

	PriorContractStatus string `json:"prior_contract_status" db:"prior_contract_status"`
	// Status immediately before this decision (always PENDING_APPROVAL today).
	PriorIntegrityDigest string `json:"prior_integrity_digest" db:"prior_integrity_digest"`
	// action_contracts.integrity_digest at decision time — "prior hash":
	// proves which immutable contract version was acted on.

	DecidedAt time.Time `json:"decided_at" db:"decided_at"`
}
