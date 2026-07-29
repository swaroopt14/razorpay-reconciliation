package models

import "time"

// ActionContract is the most important struct in ZPI.
// Every decision ZPI makes becomes one ActionContract row in the DB.
//
// GOLDEN RULE: Once created, an ActionContract is NEVER changed.
// It is an immutable audit record. Like a signed contract in real life.
//
// PHASE 5 ADDITIONS:
//   - ContractStatus: approval lifecycle (ACTIVE → PENDING_APPROVAL → APPROVED/DISMISSED/EXPIRED)
//   - ExpiresAt:      time-sensitive decisions expire automatically
//   - PolicyFamily:   which of the 9 intelligence families created this action
//   - Severity:       HIGH | MEDIUM | LOW — promoted from DSL text to a typed field
//
// The frontend reads these via:
//
//	GET /v1/intelligence/actions?tenant_id=tnt_A
//	GET /v1/intelligence/actions/{action_id}
//	GET /v1/intelligence/actions/pending-approval?tenant_id=tnt_A
//	POST /v1/intelligence/actions/{action_id}/approve
//	POST /v1/intelligence/actions/{action_id}/dismiss

type ActionContract struct {
	ActionID string `json:"action_id" db:"action_id"`
	// Format: "act_" + UUID  e.g. "act_01J8X..."

	TenantID string `json:"tenant_id" db:"tenant_id"`

	PolicyID string `json:"policy_id" db:"policy_id"`
	// Which policy created this action. e.g. "P_SLA_BREACH_RISK"

	PolicyVersion int `json:"policy_version" db:"policy_version"`
	// Which version of that policy was active. Important for audits.

	ScopeRefs ScopeRefs `json:"scope_refs" db:"scope_refs"`
	// What this action is about — corridor, contract, tenant, or batch

	InputRefsJSON string `json:"input_refs_json" db:"input_refs_json"`
	// JSON string: the projection values that caused this decision.
	// Example: {"projection_key": "leakage.total", "value": 785000, "threshold": 500000}
	// MUST NOT contain PII.

	Decision Decision `json:"decision" db:"decision"`
	// What ZPI decided. Uses the Decision type from policy.go.

	Confidence float64 `json:"confidence" db:"confidence"`
	// How certain ZPI was: 0.000 to 1.000

	PayloadJSON string `json:"payload_json" db:"payload_json"`
	// JSON string: details the actuator needs to carry out the action.
	// Example for ESCALATE: {"severity": "HIGH", "notify": ["OPS"], "message": "..."}
	// MUST NOT contain PII.

	// Corrective-action-report P0-07: named integrity_digest, not "signature"
	// — today this is always a plain SHA-256 digest (DevSigner, see
	// SignatureAlgorithm below == "DEV_SHA256"), which has no authenticity
	// property and must never be presented as a cryptographic signature.
	// Rename this back to something signature-shaped only once a real
	// KMS/Vault-backed Signer produces the value.
	IntegrityDigest string `json:"integrity_digest" db:"integrity_digest"`

	IdempotencyKey string `json:"idempotency_key" db:"idempotency_key"`
	// Prevents duplicate actions for the same event.
	// Formula: SHA-256 of (policy_id + scope_refs JSON + trigger_event_id)

	// ── PHASE 5: New lifecycle and classification fields ──────────────────────

	ContractStatus ContractStatus `json:"contract_status" db:"contract_status"`
	// Approval lifecycle of this ActionContract.
	// ACTIVE            → normal flow, outbox processes it immediately
	// PENDING_APPROVAL  → waiting for human sign-off before actuation
	// APPROVED          → human approved, outbox delivers it
	// DISMISSED         → human dismissed, no actuation will occur
	// EXPIRED           → approval window passed without action
	//
	// Determined at creation time by:
	//   1. policy.RequiresManualApproval flag → PENDING_APPROVAL
	//   2. decision.RequiresApproval()       → PENDING_APPROVAL
	//   3. everything else                   → ACTIVE

	ExpiresAt *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	// Optional expiry for time-sensitive decisions.
	// Example: a HOLD action must be reviewed within 24h; after that it auto-EXPIRES.
	// NULL = never expires (correct default for most actions).
	// Set by action_service when policy.requires_manual_approval = true.

	PolicyFamily PolicyFamily `json:"policy_family,omitempty" db:"policy_family"`
	// Which of the 9 intelligence families created this action.
	// LEAKAGE | AMBIGUITY | DEFENSIBILITY | RCA | PATTERN | RECOMMENDATION
	// | SLA | BATCH | COMPLIANCE
	// Populated from policy_registry.policy_family at creation time.
	// Enables "show me all LEAKAGE-family actions" queries.

	Severity string `json:"severity,omitempty" db:"severity"`
	// HIGH | MEDIUM | LOW — promoted from DSL text to a queryable column.
	// Parsed from the DSL at evaluation time and persisted for fast filtering.

	CreatedAt time.Time `json:"created_at" db:"created_at"`
	// Set once at creation. Never updated. This is the only mutable-looking field
	// but it is written once and protected by the IMMUTABILITY RULE.

	// ── PHASE 5 (refactor) ADDITIONS: policy/action/outbox hardening ────────
	// "PHASE 5 (refactor)" = this refactor's phase 5 — unrelated to the
	// ContractStatus/ExpiresAt/PolicyFamily/Severity fields above, which
	// predate this refactor under this codebase's own, different "PHASE 5"
	// naming (see REFACTOR_IMPLEMENTATION_GUIDE.md §K for the full mapping).

	PolicyRegistryID string `json:"policy_registry_id,omitempty" db:"policy_registry_id"`
	// FK to policy_definitions.policy_registry_id — the exact immutable rule
	// version that fired this action (blueprint §6).
	PolicySource string `json:"policy_source,omitempty" db:"policy_source"`
	PolicyDigest string `json:"policy_digest,omitempty" db:"policy_digest"`

	ScopeType string `json:"scope_type,omitempty" db:"scope_type"`
	ScopeRef  string `json:"scope_ref,omitempty" db:"scope_ref"`
	// Primary scope classifier, derived from ScopeRefs with precedence
	// BATCH > CORRIDOR > INTENT > CONTRACT > TENANT (see action_service.go's
	// deriveScope) — additive alongside ScopeRefs, never replaces it.

	TriggerEventSource  string `json:"trigger_event_source,omitempty" db:"trigger_event_source"`
	TriggerEventType    string `json:"trigger_event_type,omitempty" db:"trigger_event_type"`
	TriggerEventVersion string `json:"trigger_event_version,omitempty" db:"trigger_event_version"`
	// Sourced from the Kafka envelope (models.EnvelopeMetaFromContext), same
	// idiom as Phase 3's envelopeSourceVersion. TriggerEventID itself is not
	// a new field — it already existed as an idempotency-key input; it is
	// promoted to its own stored column via db:"trigger_event_id" below.
	TriggerEventID string `json:"trigger_event_id,omitempty" db:"trigger_event_id"`

	InputFactsHash string `json:"input_facts_hash,omitempty" db:"input_facts_hash"`
	PayloadHash    string `json:"payload_hash,omitempty" db:"payload_hash"`
	// sha256 hex of InputRefsJSON / PayloadJSON respectively — integrity
	// hashes, not signatures (see SignaturePayloadHash below for the signed one).
	PayloadSchemaVersion string `json:"payload_schema_version,omitempty" db:"payload_schema_version"`

	MappingProfileID      *string `json:"mapping_profile_id,omitempty" db:"mapping_profile_id"`
	MappingProfileVersion *string `json:"mapping_profile_version,omitempty" db:"mapping_profile_version"`
	MappingProfileHash    *string `json:"mapping_profile_hash,omitempty" db:"mapping_profile_hash"`
	// Reserved per blueprint §6 — no current ZPI concept of a carrier mapping
	// profile exists yet. Always nil/NULL until a future phase needs them.

	SignatureAlgorithm          string     `json:"signature_algorithm,omitempty" db:"signature_algorithm"`
	SignatureKeyID              string     `json:"signature_key_id,omitempty" db:"signature_key_id"`
	SignaturePayloadHash        string     `json:"signature_payload_hash,omitempty" db:"signature_payload_hash"`
	CanonicalizationVersion     string     `json:"canonicalization_version,omitempty" db:"canonicalization_version"`
	SignedAt                    *time.Time `json:"signed_at,omitempty" db:"signed_at"`
	SignatureVerificationStatus string     `json:"signature_verification_status,omitempty" db:"signature_verification_status"`
	// Real signature metadata (clarification §5), replacing the old plain
	// signature field's implicit "just trust the hash" semantics.
	// IntegrityDigest itself (above) still holds the actual digest/signature
	// value — these columns describe HOW it was produced and whether it's
	// been checked.
}

// ContractStatus is the approval lifecycle of an ActionContract.
//
// State machine:
//
//	ACTIVE ──────────────────────────────────────────────────────────→ (delivered)
//	PENDING_APPROVAL → APPROVED  → (delivered after approval)
//	PENDING_APPROVAL → DISMISSED → (never delivered)
//	PENDING_APPROVAL → EXPIRED   → (approval window missed)
type ContractStatus string

const (
	// ContractStatusActive — normal flow. Outbox delivers immediately.
	// All safe decisions (ESCALATE, NOTIFY, REQUEST_SOURCE_PATCH, etc.) start here.
	ContractStatusActive ContractStatus = "ACTIVE"

	// ContractStatusPendingApproval — waiting for a human to approve or dismiss.
	// Set when:
	//   - policy.requires_manual_approval = true, OR
	//   - decision.RequiresApproval() = true (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH)
	// Outbox worker SKIPS entries whose action has this status.
	ContractStatusPendingApproval ContractStatus = "PENDING_APPROVAL"

	// ContractStatusApproved — human approved this action.
	// Outbox worker will deliver it on next poll.
	// Set by: POST /v1/intelligence/actions/{id}/approve
	ContractStatusApproved ContractStatus = "APPROVED"

	// ContractStatusDismissed — human dismissed this action.
	// Outbox worker will never deliver it.
	// Set by: POST /v1/intelligence/actions/{id}/dismiss
	ContractStatusDismissed ContractStatus = "DISMISSED"

	// ContractStatusExpired — approval window passed without a decision.
	// Set by the background expiry job (outbox_worker or a dedicated cron).
	ContractStatusExpired ContractStatus = "EXPIRED"
)

// IsDeliverable returns true if the outbox worker should attempt Kafka delivery.
//
// RULE:
//   - ACTIVE    → deliver immediately
//   - APPROVED  → deliver (human approved it)
//   - everything else → skip (pending / dismissed / expired)
func (cs ContractStatus) IsDeliverable() bool {
	return cs == ContractStatusActive || cs == ContractStatusApproved
}

// IsFinal returns true if this status cannot change anymore.
// Final contracts are fully resolved — no further action possible.
func (cs ContractStatus) IsFinal() bool {
	return cs == ContractStatusDismissed || cs == ContractStatusExpired
}

// ActionContractSummary is a lighter version for list API responses.
// When the frontend asks for a list of actions, we don't need to send
// the full payload and input_refs for every row — just the summary.
type ActionContractSummary struct {
	ActionID       string         `json:"action_id"`
	TenantID       string         `json:"tenant_id"`
	PolicyID       string         `json:"policy_id"`
	Decision       Decision       `json:"decision"`
	Confidence     float64        `json:"confidence"`
	ContractStatus ContractStatus `json:"contract_status"` // PHASE 5: included in list view
	PolicyFamily   PolicyFamily   `json:"policy_family,omitempty"`
	Severity       string         `json:"severity,omitempty"`
	ScopeRefs      ScopeRefs      `json:"scope_refs"`
	ExpiresAt      *time.Time     `json:"expires_at,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

// ApprovalDefaultExpiryHours is how long a PENDING_APPROVAL action stays open
// before it auto-expires. Fintech standard: 24 hours for HOLD/RETRY decisions.
// Risk-impacting decisions that nobody reviews within 24h should auto-expire
// so the system never has stale approval requests affecting live operations.
const ApprovalDefaultExpiryHours = 24
