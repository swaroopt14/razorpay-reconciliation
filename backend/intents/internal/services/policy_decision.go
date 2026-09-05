package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"zord-intent-engine/internal/guards"
	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

// policyRulesetDescription enumerates every rule actually enforced under
// PolicyVersionV1, so policyHash changes whenever the enforced ruleset
// changes — it is not a per-intent value, it identifies the code version
// that evaluated this intent's governance.
var policyRulesetDescription = map[string]any{
	"semantic_rules": []string{
		"BANK_REQUIRES_IFSC", "UPI_REQUIRES_VPA", "EXECUTION_WINDOW_EXPIRED",
		"NEGATIVE_AMOUNT_NOT_ALLOWED", "INVALID_EXECUTION_AT_FORMAT",
	},
	"currency_policy":  "INR_ONLY",
	"max_batch_size":    guards.MaxBatchSize,
}

var policyHash = func() string {
	b, _ := json.Marshal(policyRulesetDescription)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}()

// policyResultForGovernanceState maps the existing governance_state values to
// a policy result. VALID -> ALLOW. FLAGGED covers routine data-quality
// signals (duplicate risk, mapping uncertainty, low quality score) that don't
// block processing -> ALLOW_WITH_WARNING. REQUIRES_REVIEW is reserved for
// policy-limit breaches (e.g. batch size) that warrant a stronger signal than
// a routine flag -> HOLD_FOR_REVIEW. REJECT is never recorded here — a
// hard-rejected intent never reaches payment_intents, so it has no intent_id
// to attach a policy decision to.
func policyResultForGovernanceState(state string) string {
	switch state {
	case "VALID":
		return models.PolicyResultAllow
	case "REQUIRES_REVIEW":
		return models.PolicyResultHoldForReview
	default: // "FLAGGED", "PENDING", or anything else already flagged
		return models.PolicyResultAllowWithWarn
	}
}

// policyInputFacts captures the facts ApplyPolicy actually evaluated, so
// input_facts_hash is a real fingerprint of what was checked, not a
// placeholder.
func policyInputFacts(intent *models.CanonicalIntent, rowCountEstimate *int) map[string]any {
	facts := map[string]any{
		"intent_type":       intent.IntentType,
		"amount":            intent.Amount.String(),
		"currency":          intent.Currency,
		"client_batch_ref":  intent.ClientBatchRef,
		"client_payout_ref": intent.ClientPayoutRef,
	}
	if rowCountEstimate != nil {
		facts["row_count_estimate"] = *rowCountEstimate
	}
	return facts
}

// buildIntentPolicyDecision assembles the durable policy decision row for an
// intent that has already been through ApplyPolicy and reached a final
// governance_state. reasonCodes should already include everything from
// Governance.SemanticErrors/PolicyFlags plus any policy-limit reason codes
// (e.g. BATCH_SIZE_EXCEEDS_LIMIT) the caller added.
func buildIntentPolicyDecision(
	tenantID, intentID string,
	governanceState string,
	reasonCodes []string,
	inputFacts map[string]any,
) *models.IntentPolicyDecision {
	if reasonCodes == nil {
		reasonCodes = []string{}
	}
	reasonCodesJSON, _ := json.Marshal(reasonCodes)
	inputFactsJSON, _ := json.Marshal(inputFacts)
	factsSum := sha256.Sum256(inputFactsJSON)

	return &models.IntentPolicyDecision{
		PolicyDecisionID: uuid.NewString(),
		TenantID:         tenantID,
		IntentID:         intentID,
		PolicySource:     models.PolicySourceBuiltin,
		PolicyVersion:    models.PolicyVersionV1,
		PolicyHash:       policyHash,
		PolicyResult:     policyResultForGovernanceState(governanceState),
		ReasonCodesJSON:  reasonCodesJSON,
		InputFactsHash:   hex.EncodeToString(factsSum[:]),
		InputFactsJSON:   inputFactsJSON,
		EvaluatedAt:      time.Now().UTC(),
	}
}
