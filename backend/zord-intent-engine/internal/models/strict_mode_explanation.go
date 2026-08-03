package models

// StrictModeExplanation is the explainability record 4.2.8 requires for
// every HARD_STRICT rejection or REVIEW_STRICT hold caused by a
// mapping-profile required-field gap: which profile decided a field was
// required, which source row was affected, which field(s) were missing,
// what the engine decided, why, and whether the tenant can act on it. It
// carries no PII — only profile, row-lineage and policy metadata.
type StrictModeExplanation struct {
	MappingProfileID      string   `json:"mapping_profile_id,omitempty"`
	MappingProfileVersion string   `json:"mapping_profile_version,omitempty"`
	SourceRowRef          string   `json:"source_row_ref,omitempty"`
	RequiredFields        []string `json:"required_fields,omitempty"`
	Decision              string   `json:"decision"`
	ReasonCode            string   `json:"reason_code"`
	Remediability         string   `json:"remediability"`
}

const (
	// StrictModeDecisionHardStrictRejected: HARD_STRICT profile, required
	// field missing — the row is rejected to DLQ, never reaches
	// payment_intents.
	StrictModeDecisionHardStrictRejected = "HARD_STRICT_REJECTED"
	// StrictModeDecisionReviewStrictHeld: REVIEW_STRICT (default) profile,
	// required field missing — the row is persisted but held for review
	// (GovernanceState FLAGGED/REQUIRES_REVIEW).
	StrictModeDecisionReviewStrictHeld = "REVIEW_STRICT_HELD"

	// StrictModeRemediabilityTenantFixable: a required-field gap is always
	// something the tenant can act on — fix their source file/mapping and
	// resubmit — regardless of which decision was taken.
	StrictModeRemediabilityTenantFixable = "TENANT_FIXABLE"
)

// BuildStrictModeExplanation builds the explanation for a required-field-gap
// outcome. profile may be nil (unregistered/generic source, which can only
// reach here under REVIEW_STRICT-equivalent default behavior) — the
// resulting explanation simply has no mapping-profile identity attached.
func BuildStrictModeExplanation(decision, reasonCode string, profile *MappingProfile, sourceRowRef string, requiredFields []string) StrictModeExplanation {
	exp := StrictModeExplanation{
		SourceRowRef:   sourceRowRef,
		RequiredFields: requiredFields,
		Decision:       decision,
		ReasonCode:     reasonCode,
		Remediability:  StrictModeRemediabilityTenantFixable,
	}
	if profile != nil {
		exp.MappingProfileID = profile.ProfileID
		exp.MappingProfileVersion = profile.ProfileVersion
	}
	return exp
}
