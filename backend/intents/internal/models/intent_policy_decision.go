package models

import (
	"encoding/json"
	"time"
)

// Governance policy results. ALLOW/ALLOW_WITH_WARNING/HOLD_FOR_REVIEW map to
// an intent that reaches payment_intents (governance_state VALID/FLAGGED/
// REQUIRES_REVIEW respectively). REJECT never gets a row here — a
// hard-rejected intent goes to dlq_items instead and has no intent_id yet.
const (
	PolicyResultAllow          = "ALLOW"
	PolicyResultAllowWithWarn  = "ALLOW_WITH_WARNING"
	PolicyResultHoldForReview  = "HOLD_FOR_REVIEW"
	PolicyResultReject         = "REJECT"
)

const (
	PolicySourceBuiltin = "zord-intent-engine-builtin"
	PolicyVersionV1     = "governance_policy_v1"
)

// IntentPolicyDecision is the durable, versioned proof of why an intent was
// allowed, flagged, or held — see refactor blueprint ledger item #17.
type IntentPolicyDecision struct {
	PolicyDecisionID string          `json:"policy_decision_id" db:"policy_decision_id"`
	TenantID         string          `json:"tenant_id" db:"tenant_id"`
	IntentID         string          `json:"intent_id" db:"intent_id"`
	PolicySource     string          `json:"policy_source" db:"policy_source"`
	PolicyVersion    string          `json:"policy_version" db:"policy_version"`
	PolicyHash       string          `json:"policy_hash" db:"policy_hash"`
	PolicyResult     string          `json:"policy_result" db:"policy_result"`
	ReasonCodesJSON  json.RawMessage `json:"reason_codes_json" db:"reason_codes_json"`
	InputFactsHash   string          `json:"input_facts_hash" db:"input_facts_hash"`
	InputFactsJSON   json.RawMessage `json:"input_facts_json,omitempty" db:"input_facts_json"`
	EvaluatedAt      time.Time       `json:"evaluated_at" db:"evaluated_at"`
}
