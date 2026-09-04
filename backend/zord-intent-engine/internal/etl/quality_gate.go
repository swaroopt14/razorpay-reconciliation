package etl

import (
	"encoding/json"
	"zord-intent-engine/internal/models"
)

const ParseSuccessThreshold = 0.98

// ScoreEvent computes ETL quality metrics from an already-canonical OutboxEvent.
// The decrypt and transform happened upstream in ProcessIncomingIntent.
// This function only scores and gates — it does not re-process anything.
func ScoreEvent(ev models.OutboxEvent) ETLQualityResult {
	result := ETLQualityResult{
		ScopeType:        "INTENT",
		ParseSuccessRate: 1.0,
	}

	var reasonCodes []string

	// Proof readiness — mirrors Stage 12 of ETL doc
	proofScore := 0.0
	if ev.CanonicalHash != "" {
		proofScore += 0.25
	}
	if ev.GovernanceHash != "" {
		proofScore += 0.25
	}
	if ev.CanonicalSnapshotRef != "" {
		proofScore += 0.25
	}
	if ev.NIRSnapshotRef != "" {
		proofScore += 0.25
	}
	result.ProofReadinessScore = proofScore

	// Attachment readiness — mirrors Stage 11 of ETL doc
	attachScore := 0.0
	if ev.EnvelopeID != "" {
		attachScore += 0.2
	}
	if !ev.Amount.IsZero() {
		attachScore += 0.2
	}
	if ev.Currency != "" {
		attachScore += 0.1
	}
	if ev.ClientPayoutRef != "" {
		attachScore += 0.2
	}
	if ev.BeneficiaryFingerprint != "" {
		attachScore += 0.2
	}
	if ev.GovernanceState == "VALID" {
		attachScore += 0.1
	}
	result.AttachmentReadinessScore = attachScore

	// Overall quality score
	result.QualityScore = (proofScore*0.5 + attachScore*0.5)

	// Required field gap check
	if ev.CanonicalHash == "" {
		result.RequiredFieldGapCount++
		reasonCodes = append(reasonCodes, "MISSING_CANONICAL_HASH")
	}
	if ev.GovernanceHash == "" {
		result.RequiredFieldGapCount++
		reasonCodes = append(reasonCodes, "MISSING_GOVERNANCE_HASH")
	}
	if ev.Amount.IsZero() {
		result.RequiredFieldGapCount++
		reasonCodes = append(reasonCodes, "MISSING_AMOUNT")
	}

	// Gate decision
	result.Status = "PASS"
	if result.QualityScore < 0.5 || result.RequiredFieldGapCount > 0 {
		result.Status = "WARN"
		reasonCodes = append(reasonCodes, "QUALITY_BELOW_THRESHOLD")
	}
	if result.ProofReadinessScore < 0.5 {
		result.Status = "FAIL"
		reasonCodes = append(reasonCodes, "PROOF_NOT_READY")
	}

	result.ReasonCodesJSON, _ = json.Marshal(reasonCodes)
	return result
}
