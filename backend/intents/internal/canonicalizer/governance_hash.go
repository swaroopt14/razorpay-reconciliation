package canonicalizer

import (
	"sort"
	"strings"

	"zord-intent-engine/internal/jcs"
)

// GovernanceInputFactsHashInput holds the facts governance actually
// evaluated for an intent. BeneficiaryChanged and PreviousPaymentCount have
// no upstream signal yet, so callers pass false/0 until that tracking exists.
type GovernanceInputFactsHashInput struct {
	AmountMinor            int64
	Currency               string
	BeneficiaryFingerprint string
	PaymentRail            string
	PurposeCode            string
	BeneficiaryChanged     bool
	IsPossibleDuplicate    bool
	DailyTotalMinor        int64
	PreviousPaymentCount   int
}

// ComputeGovernanceInputFactsHash returns
// input_facts_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...governance facts}))
func ComputeGovernanceInputFactsHash(in GovernanceInputFactsHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":               "GOVERNANCE_INPUT_FACTS",
		"hash_version":            "1",
		"amount_minor":            in.AmountMinor,
		"currency":                strings.ToUpper(strings.TrimSpace(in.Currency)),
		"beneficiary_fingerprint": in.BeneficiaryFingerprint,
		"payment_rail":            strings.ToUpper(strings.TrimSpace(in.PaymentRail)),
		"purpose_code":            strings.ToUpper(strings.TrimSpace(in.PurposeCode)),
		"beneficiary_changed":     in.BeneficiaryChanged,
		"is_possible_duplicate":   in.IsPossibleDuplicate,
		"daily_total_minor":       in.DailyTotalMinor,
		"previous_payment_count":  in.PreviousPaymentCount,
	}
	return jcs.CanonicalizeAndSHA256(fields)
}

// GovernanceDecisionHashInput holds the facts a governance decision was made
// from. PolicyID/PolicyVersion/PolicyHash are intentionally not part of this
// hash — there is no real policy engine backing them yet, so including them
// would just be hashing a static placeholder. RequiredApprovalLevel and
// RiskLevel have no upstream signal yet, so callers pass "" until those
// concepts exist.
type GovernanceDecisionHashInput struct {
	TenantID              string
	CanonicalIntentHash   string
	InputFactsHash        string
	Decision              string
	ReasonCodes           []string
	RequiredApprovalLevel string
	RiskLevel             string
}

// ComputeGovernanceDecisionHash returns
// governance_decision_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...decision facts}))
func ComputeGovernanceDecisionHash(in GovernanceDecisionHashInput) (string, error) {
	sortedReasonCodes := append([]string{}, in.ReasonCodes...)
	sort.Strings(sortedReasonCodes)

	fields := map[string]any{
		"hash_type":               "GOVERNANCE_DECISION",
		"hash_version":            "1",
		"tenant_id":               in.TenantID,
		"canonical_intent_hash":   in.CanonicalIntentHash,
		"input_facts_hash":        in.InputFactsHash,
		"decision":                strings.ToUpper(strings.TrimSpace(in.Decision)),
		"reason_codes":            sortedReasonCodes,
		"required_approval_level": in.RequiredApprovalLevel,
		"risk_level":              in.RiskLevel,
	}
	return jcs.CanonicalizeAndSHA256(fields)
}
