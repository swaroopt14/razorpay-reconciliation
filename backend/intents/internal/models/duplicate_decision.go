package models

import "time"

// Duplicate decision values — see refactor blueprint ledger item #12.
// UNIQUE_RETRY and VELOCITY_RISK are intentionally not modeled yet:
// UNIQUE_RETRY (same envelope_id resubmitted) short-circuits before a new
// intent_id exists, so there's nothing to attach a decision to; VELOCITY_RISK
// needs pattern infrastructure this phase doesn't build.
const (
	DuplicateDecisionStrict     = "STRICT_DUPLICATE"
	DuplicateDecisionSemantic   = "SEMANTIC_DUPLICATE_RISK"
	DuplicateDecisionNoSignal   = "NO_DUPLICATE_SIGNAL"
)

const DuplicatePolicyVersionV1 = "duplicate_policy_v1"

// DuplicateDecision is the durable, per-intent record of whether — and why —
// an intent was flagged as a likely duplicate.
type DuplicateDecision struct {
	DuplicateDecisionID string    `json:"duplicate_decision_id" db:"duplicate_decision_id"`
	TenantID            string    `json:"tenant_id" db:"tenant_id"`
	IntentID            string    `json:"intent_id" db:"intent_id"`
	Decision            string    `json:"decision" db:"decision"`
	ReasonCode          string    `json:"reason_code" db:"reason_code"`
	DuplicateScore      float64   `json:"duplicate_score" db:"duplicate_score"`
	ComparedIntentID    *string   `json:"compared_intent_id,omitempty" db:"compared_intent_id"`
	DuplicateGroupID    *string   `json:"duplicate_group_id,omitempty" db:"duplicate_group_id"`
	ComparisonFactsHash string    `json:"comparison_facts_hash" db:"comparison_facts_hash"`
	PolicyVersion       string    `json:"policy_version" db:"policy_version"`
	CreatedAt           time.Time `json:"created_at" db:"created_at"`
}
