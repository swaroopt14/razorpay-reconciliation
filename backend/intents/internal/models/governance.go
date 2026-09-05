package models

// Governance captures policy decisions and signals for an intent
type Governance struct {
	SemanticValid        bool     `json:"semantic_valid"`
	SemanticErrors       []string `json:"semantic_errors"`
	DuplicateDetected    bool     `json:"duplicate_detected"`
	DuplicateReason      string   `json:"duplicate_reason"`
	MissingFields        []string `json:"missing_fields"`
	LowConfidenceFields  []string `json:"low_confidence_fields"`
	RoutingConsistent    bool     `json:"routing_consistent"`
	ExecutionWindowValid bool     `json:"execution_window_valid"`
	PolicyFlags          []string `json:"policy_flags"`

	// RequiredFieldGapDecision (4.2.8) is set whenever a mapping-profile
	// required-field gap produced a REVIEW_STRICT hold — HARD_STRICT rejects
	// never reach payment_intents, so their equivalent explanation is
	// attached to the DLQ entry's intent_context instead (see
	// BuildIntentContext / StrictModeExplanation). nil whenever there was no
	// required-field gap at all.
	RequiredFieldGapDecision *StrictModeExplanation `json:"required_field_gap_decision,omitempty"`
}

type Scores struct {
	MappingConfidenceScore  float64 `json:"mapping_confidence_score"`
	ProofReadinessScore     float64 `json:"proof_readiness_score"`
	MatchabilityScore       float64 `json:"matchability_score"`
	IntentQualityScore      float64 `json:"intent_quality_score"`
	SchemaCompletenessScore float64 `json:"schema_completeness_score"`
	// NEW
	ReferenceQualityScore   float64 `json:"reference_quality_score"`
	DuplicateRiskScore      float64 `json:"duplicate_risk_score"`
}

const (
	ScoreValidityNotScored    = "NOT_SCORED"
	ScoreValidityScoredValid  = "SCORED_VALID"
	ScoreValidityScoredReview = "SCORED_REVIEW"
	ScoreValidityFailed       = "SCORE_FAILED"
)

const ScoreVersion = "service2_score_v2.0"
