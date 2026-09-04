package models

import "time"

// Policy represents one row in the policy_registry table.
//
// A policy is an IF-THEN rule stored in the database.
// When its conditions are met, ZPI creates an ActionContract.
//
// Example policy in plain English:
//   IF corridor razorpay.UPI success rate drops below 90%
//   THEN create an ESCALATE action and notify ops team
//
// This is stored as:
//   policy_id    = "P_FAILURE_BURST"
//   trigger_type = "event"
//   trigger_val  = "outcome.event.normalized"
//   dsl          = "WHEN corridor.failure_rate_1h > 0.10 THEN ESCALATE severity=HIGH"

type Policy struct {
	PolicyID     string `json:"policy_id" db:"policy_id"`
	Version      int    `json:"version" db:"version"`
	ScopeType    string `json:"scope_type" db:"scope_type"`
	TriggerType  string `json:"trigger_type" db:"trigger_type"`
	TriggerValue string `json:"trigger_value" db:"trigger_value"`
	DSL          string `json:"dsl" db:"dsl"`
	Enabled      bool   `json:"enabled" db:"enabled"`
	TenantID     string `json:"tenant_id,omitempty" db:"tenant_id"`
	// omitempty means: if TenantID is empty string, skip it in JSON output
	// This is used when a policy applies to ALL tenants (tenant_id is NULL in DB)
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	// These match the new columns added to policy_registry in Phase 1 schema.

	PolicyFamily PolicyFamily `json:"policy_family,omitempty" db:"policy_family"`
	// Which intelligence family does this policy belong to?
	// Empty for legacy policies seeded before Phase 1.

	Severity string `json:"severity,omitempty" db:"severity"`
	// "HIGH", "MEDIUM", "LOW" — promoted from DSL text to a real column.
	// The DSL parser still reads severity= from the DSL text as a fallback
	// when this field is empty (for backward compatibility with old policies).

	RequiresManualApproval bool `json:"requires_manual_approval" db:"requires_manual_approval"`
	// When true: ActionContract is created with contract_status = PENDING_APPROVAL.
	// A human must approve it in the dashboard before the outbox delivers it.
	// Default false — all existing policies keep auto-executing as before.

	// ── PHASE 5 (refactor): policy hardening ────────────────────────────────
	// Read-only projections of the matching policy_definitions row (looked up
	// via a correlated subquery in policy_repo.go, never written here — the
	// definitions table is the write path, this struct only carries them
	// through to action_service.go so new ActionContracts can stamp their
	// lineage). Empty string if the dual-write hasn't landed yet for this
	// policy (should not happen post-Phase-5, but the read path must never
	// break policy evaluation over a missing audit-trail row).
	PolicyRegistryID string `json:"policy_registry_id,omitempty" db:"policy_registry_id"`
	PolicyDigest     string `json:"policy_digest,omitempty" db:"policy_digest"`
	PolicySource     string `json:"policy_source,omitempty" db:"policy_source"`
}

// Decision is the list of valid actions ZPI can take.
//
// In Go, we use "typed string constants" instead of Java enums.
// They work the same way:
//
//   Java:   Decision.ESCALATE
//   Go:     DecisionEscalate
//
// The CHECK constraint in init.sql enforces that only these values
// can be stored in the action_contracts.decision column.

type Decision string

const (
	// DecisionAllow - explicit allow. Recorded for audit trail only.
	// Money impact: NONE
	DecisionAllow Decision = "ALLOW"

	// DecisionEscalate - create an ops incident and notify on-call team.
	// Money impact: NONE. Always safe to execute.
	DecisionEscalate Decision = "ESCALATE"

	// DecisionNotify - send a notification (Slack, email, webhook).
	// Money impact: NONE. Always safe to execute.
	DecisionNotify Decision = "NOTIFY"

	// DecisionOpenOpsIncident - create a structured ops ticket.
	// Money impact: NONE. Always safe to execute.
	DecisionOpenOpsIncident Decision = "OPEN_OPS_INCIDENT"

	// DecisionGenerateEvidence - ask Service 6 to build an evidence pack.
	// Money impact: NONE. Idempotent (running twice is fine).
	DecisionGenerateEvidence Decision = "GENERATE_EVIDENCE"

	// DecisionAdvisoryRecommendation - log a suggestion only. Zero auto-execution.
	// Money impact: NONE. Always safe.
	DecisionAdvisoryRecommendation Decision = "ADVISORY_RECOMMENDATION"

	// DecisionHold - pause this payout for manual review.
	// Money impact: INDIRECT (blocks payout).
	// REQUIRES: tenant has risk_gates_enabled = true in their config.
	DecisionHold Decision = "HOLD"

	// DecisionRetry - schedule a retry via Service 4.
	// Money impact: INDIRECT (triggers another payment attempt).
	// REQUIRES: tenant has safe_retry_enabled = true in their config.
	DecisionRetry Decision = "RETRY"

	// ── NEW DECISIONS
	//
	// These are the 6 new decision types introduced in the new spec (Section 9.4).
	// They enable the 6 intelligence layers to produce actionable outputs.

	// DecisionPrepareAndSignRecommended - Service 7 detected that this
	// tenant/flow would benefit from Zord's prepare-and-sign mode.
	// This is a COMMERCIAL signal — show a recommendation card in the dashboard.
	// Money impact: NONE. Always safe. No approval needed.
	DecisionPrepareAndSignRecommended Decision = "PREPARE_AND_SIGN_RECOMMENDED"

	// DecisionDispatchModeRecommended - Service 7 detected enough data quality
	// to justify moving to full dispatch/control mode.
	// Another commercial upsell signal.
	// Money impact: NONE. Always safe. No approval needed.
	DecisionDispatchModeRecommended Decision = "DISPATCH_MODE_RECOMMENDED"

	// DecisionRequestSourcePatch - a source system is consistently producing
	// intents with missing carrier fields (e.g. no client_ref in ERP exports).
	// ZPI sends a structured patch request back to the client's ops team.
	// Money impact: NONE. Always safe. No approval needed.
	DecisionRequestSourcePatch Decision = "REQUEST_SOURCE_PATCH"

	// DecisionReviewAmbiguousBatch - a batch has a high ambiguity score
	// (many same-amount payouts, weak references, candidate set explosion).
	// Requires a human to review the batch before it proceeds.
	// Money impact: INDIRECT (delays batch processing).
	// REQUIRES: requires_manual_approval = true in policy_registry.
	DecisionReviewAmbiguousBatch Decision = "REVIEW_AMBIGUOUS_BATCH"

	// DecisionRegenerateEvidence - an evidence pack exists but is incomplete:
	// governance coverage is missing, or some items failed the Merkle proof.
	// Triggers Service 6 to rebuild the pack.
	// Money impact: NONE. Idempotent (rebuilding twice produces same result).
	DecisionRegenerateEvidence Decision = "REGENERATE_EVIDENCE"

	// DecisionRequestStrongerCarrierContract - the carrier contract between
	// Zord and a PSP/bank lacks required reference fields (e.g. UTR not returned).
	// Advisory flag for ops to renegotiate SLA/contract with the provider.
	// Money impact: NONE. Always safe. No approval needed.
	DecisionRequestStrongerCarrierContract Decision = "REQUEST_STRONGER_CARRIER_CONTRACT"
)

// IsSafe returns true if this decision has zero money movement risk.
// Used by outbox_worker.go to skip tenant config checks for safe actions.
// Used by action_service.go to decide if contract_status = ACTIVE or PENDING_APPROVAL.
//
// RULE:
//   true  → outbox delivers immediately, no human approval needed
//   false → check requires_manual_approval in policy_registry before delivering
//
// Example usage:
//
//	if !action.Decision.IsSafe() {
//	    // check tenant config before executing
//	}
func (d Decision) IsSafe() bool {
	switch d {
	// ── Original safe decisions ───────────────────────────────────────────────
	case DecisionAllow,
		DecisionEscalate,
		DecisionNotify,
		DecisionOpenOpsIncident,
		DecisionGenerateEvidence,
		DecisionAdvisoryRecommendation,
		// ── New safe decisions (Phase 2) ──────────────────────────────────────
		// These four produce zero money movement. They are advisory/operational.
		DecisionPrepareAndSignRecommended,
		DecisionDispatchModeRecommended,
		DecisionRequestSourcePatch,
		DecisionRegenerateEvidence,
		DecisionRequestStrongerCarrierContract:
		return true
	}
	// HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH are NOT safe.
	// HOLD and RETRY directly affect money movement.
	// REVIEW_AMBIGUOUS_BATCH delays a batch — indirect money impact.
	// All three require requires_manual_approval check.
	return false
}

// RequiresApproval returns true for decisions that need human sign-off
// even when they are triggered by an auto-executing policy.
// These will create ActionContracts with contract_status = PENDING_APPROVAL.
func (d Decision) RequiresApproval() bool {
	switch d {
	case DecisionHold,
		DecisionRetry,
		DecisionReviewAmbiguousBatch:
		return true
	}
	return false
}

// PolicyFamily — the 9 intelligence families a policy can belong to
//
// WHY A TYPE?
// In Go, defining a named type (type PolicyFamily string) instead of using
// plain strings gives you:
//   1. Auto-complete in your IDE — you see all valid values
//   2. Compile-time safety — typos become compile errors, not runtime bugs
//   3. Self-documenting code — the type name explains what values mean
// =============================================================================

// PolicyFamily categorises a policy into one of the 9 intelligence families.
type PolicyFamily string

const (
	PolicyFamilyLeakage        PolicyFamily = "LEAKAGE"
	PolicyFamilyAmbiguity      PolicyFamily = "AMBIGUITY"
	PolicyFamilyDefensibility  PolicyFamily = "DEFENSIBILITY"
	PolicyFamilyRCA            PolicyFamily = "RCA"
	PolicyFamilyPattern        PolicyFamily = "PATTERN"
	PolicyFamilyRecommendation PolicyFamily = "RECOMMENDATION"
	PolicyFamilySLA            PolicyFamily = "SLA"
	PolicyFamilyBatch          PolicyFamily = "BATCH"
	PolicyFamilyCompliance     PolicyFamily = "COMPLIANCE"
)

// ScopeRefs identifies WHAT an ActionContract is about.
// At least one field will be set. Others are optional context.
// BatchID is new in Phase 2 — needed for batch-level intelligence actions.
type ScopeRefs struct {
	TenantID   string `json:"tenant_id,omitempty"`
	IntentID   string `json:"intent_id,omitempty"`
	ContractID string `json:"contract_id,omitempty"`
	CorridorID string `json:"corridor_id,omitempty"`
	BatchID    string `json:"batch_id,omitempty"` // NEW: for batch-scoped actions (Phase 2)
}
