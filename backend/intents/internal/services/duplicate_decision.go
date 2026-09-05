package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

// buildDuplicateDecision assembles the durable duplicate-detection decision
// row for an intent — see refactor blueprint ledger item #12. reasonCode is
// whatever the duplicate-check chain in processIncomingIntentInternal landed
// on ("SAME_IDEMPOTENCY_KEY", "CLIENT_PAYOUT_REF_REUSED",
// "SAME_BENEFICIARY_AMOUNT_TIME", or "NONE"), dupRiskScore is the score
// computeDuplicateRiskScore already computed for this same reasonCode so the
// two never disagree.
func buildDuplicateDecision(
	tenantID, intentID, reasonCode string,
	dupRiskScore float64,
	comparedIntentID string,
	businessIdempotencyKey, idempotencyKey, clientPayoutRef string,
	facts map[string]any,
) *models.DuplicateDecision {
	decision := models.DuplicateDecisionNoSignal
	var groupID *string

	switch reasonCode {
	case "SAME_IDEMPOTENCY_KEY":
		decision = models.DuplicateDecisionStrict
		if idempotencyKey != "" {
			groupID = &idempotencyKey
		}
	case "CLIENT_PAYOUT_REF_REUSED":
		decision = models.DuplicateDecisionStrict
		if clientPayoutRef != "" {
			groupID = &clientPayoutRef
		}
	case "SAME_BENEFICIARY_AMOUNT_TIME":
		decision = models.DuplicateDecisionSemantic
		if businessIdempotencyKey != "" {
			groupID = &businessIdempotencyKey
		}
	}

	var comparedIntentIDPtr *string
	if comparedIntentID != "" {
		comparedIntentIDPtr = &comparedIntentID
	}

	factsJSON, _ := json.Marshal(facts)
	factsSum := sha256.Sum256(factsJSON)

	return &models.DuplicateDecision{
		DuplicateDecisionID: uuid.NewString(),
		TenantID:            tenantID,
		IntentID:            intentID,
		Decision:            decision,
		ReasonCode:          reasonCode,
		DuplicateScore:      dupRiskScore,
		ComparedIntentID:    comparedIntentIDPtr,
		DuplicateGroupID:    groupID,
		ComparisonFactsHash: hex.EncodeToString(factsSum[:]),
		PolicyVersion:       models.DuplicatePolicyVersionV1,
		CreatedAt:           time.Now().UTC(),
	}
}
