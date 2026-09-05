package services

import "zord-evidence/models"

// proofWeights defines the five scoring components and their weights (must sum to 100).
//
//   20% — original payment instruction
//   20% — settlement / bank record
//   20% — match decision (Service 5 reconciliation)
//   15% — governance check (Service 2 policy/compliance)
//   15% — variance and decision evidence (amount-match + attachment decision present)
//   10% — cryptographic seal (Merkle root generated and signed)
//
// FIX-08: "Replay Protection" renamed to "Variance / Decision Evidence".
// The VARIANCE_DECISION leaf records amount-variance and attachment-decision
// results — it is not a duplicate-spend / replay-detection signal. Labelling
// it "Replay Protection" was misleading to finance and audit consumers of the
// proof score breakdown.
var proofWeights = []struct {
	check  string
	weight int
}{
	{"Original Payment Instruction", 20},
	{"Settlement / Bank Record", 20},
	{"Match Decision", 20},
	{"Governance Check", 15},
	{"Variance / Decision Evidence", 15},
	{"Cryptographic Seal", 10},
}

// ComputeProofScore calculates the deterministic weighted proof score (0–100)
// from a ProofComponents value and whether a cryptographic seal (evidence pack)
// already exists. It returns the integer score and the full breakdown with
// per-deduction explanations required by spec §3.
func ComputeProofScore(c models.ProofComponents, sealExists bool) models.ProofScoreResult {
	passed := []bool{
		c.PaymentInstructionAvailable,
		c.SettlementRecordAvailable,
		c.MatchDecisionAvailable,
		c.GovernanceDecisionAvailable,
		c.ReplayCheckPassed, // field name kept for DB/JSON compatibility; semantics = variance+decision evidence present
		sealExists,
	}

	var score int
	var components []models.ProofScoreComponent
	var deductions []string

	for i, w := range proofWeights {
		ok := passed[i]
		deduction := 0
		explanation := ""
		if !ok {
			deduction = w.weight
			explanation = w.check + " not yet completed — " + deductionReason(w.check)
			deductions = append(deductions, explanation)
		} else {
			score += w.weight
		}
		components = append(components, models.ProofScoreComponent{
			Check:       w.check,
			Weight:      w.weight,
			Passed:      ok,
			Deduction:   deduction,
			Explanation: explanation,
		})
	}

	return models.ProofScoreResult{
		Score:      score,
		Components: components,
		Deductions: deductions,
	}
}

func deductionReason(check string) string {
	switch check {
	case "Original Payment Instruction":
		return "raw intent and canonical intent hashes not yet received from Service 2"
	case "Settlement / Bank Record":
		return "bank settlement line not yet matched to this payment"
	case "Match Decision":
		return "Service 5 reconciliation output pending"
	case "Governance Check":
		return "Service 2 policy/compliance validations not yet passed"
	case "Variance / Decision Evidence":
		return "variance decision leaf and attachment decision leaf not yet received"
	case "Cryptographic Seal":
		return "Merkle root has not yet been generated and sealed"
	default:
		return "check not completed"
	}
}

// DeriveProofStatus derives the correct ProofStatus enum from ProofComponents
// and pack state. The status is deterministic — no arbitrary assignment.
//
// FIX-10: packExists now returns ProofStatusProofAssembled (not ProofStatusCertified).
// "CERTIFIED" implies an external certification step that does not exist in
// this service. A sealed pack is "assembled and ready" — PROOF_ASSEMBLED.
// CERTIFIED is reserved for a future external certification workflow.
func DeriveProofStatus(c models.ProofComponents, packExists bool, superseded bool, exported bool) models.ProofStatus {
	if superseded {
		return models.ProofStatusRevokedSuperseded
	}
	if exported {
		return models.ProofStatusExported
	}
	if packExists {
		return models.ProofStatusProofAssembled
	}
	// Not yet sealed — return the most specific missing-piece status.
	if !c.PaymentInstructionAvailable {
		return models.ProofStatusMissingIntent
	}
	if !c.SettlementRecordAvailable {
		return models.ProofStatusMissingSettlement
	}
	if !c.MatchDecisionAvailable {
		return models.ProofStatusMissingMatchDecision
	}
	if !c.GovernanceDecisionAvailable {
		return models.ProofStatusMissingGovernance
	}
	if !c.ReplayCheckPassed {
		return models.ProofStatusMissingVarianceEvidence
	}
	return models.ProofStatusProofReady
}
