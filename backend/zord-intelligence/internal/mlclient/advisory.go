package mlclient

import "fmt"

const (
	OutputKindAdvisory = "ADVISORY_PREDICTION"
	AuthorityAdvisory  = "ADVISORY_ONLY"
)

// FeatureContribution explains one local input's influence on an advisory score.
type FeatureContribution struct {
	Feature      string      `json:"feature"`
	Value        interface{} `json:"value,omitempty"`
	Contribution float64     `json:"contribution"`
	Method       string      `json:"method"`
}

// AdvisoryMetadata is propagated into snapshots and APIs so predictions cannot
// be confused with confirmed facts or deterministic payment decisions.
type AdvisoryMetadata struct {
	OutputKind                string                 `json:"output_kind"`
	DecisionAuthority         string                 `json:"decision_authority"`
	MayActuate                bool                   `json:"may_actuate"`
	DeterministicRuleRequired bool                   `json:"deterministic_rule_required"`
	Available                 bool                   `json:"available"`
	Confidence                float64                `json:"confidence"`
	Calibration               map[string]interface{} `json:"calibration"`
	FeatureContributions      []FeatureContribution  `json:"feature_contributions"`
	FallbackReason            string                 `json:"fallback_reason,omitempty"`
}

// ValidateAdvisoryResult rejects any ML response that claims payment authority.
func ValidateAdvisoryResult(result MLResult) error {
	if result.OutputKind != OutputKindAdvisory {
		return fmt.Errorf("invalid ML output_kind=%q", result.OutputKind)
	}
	if result.DecisionAuthority != AuthorityAdvisory {
		return fmt.Errorf(
			"invalid ML decision_authority=%q",
			result.DecisionAuthority,
		)
	}
	if result.MayActuate {
		return fmt.Errorf("ML result may_actuate must be false")
	}
	if !result.DeterministicRuleRequired {
		return fmt.Errorf("ML result must require a deterministic rule")
	}
	if result.PredictionConfidence < 0 || result.PredictionConfidence > 1 {
		return fmt.Errorf(
			"ML prediction_confidence=%f is outside [0,1]",
			result.PredictionConfidence,
		)
	}
	return nil
}

// AdvisoryMetadata returns the safe metadata carried by a verified result.
func (result MLResult) AdvisoryMetadata() AdvisoryMetadata {
	return AdvisoryMetadata{
		OutputKind:                result.OutputKind,
		DecisionAuthority:         result.DecisionAuthority,
		MayActuate:                result.MayActuate,
		DeterministicRuleRequired: result.DeterministicRuleRequired,
		Available:                 result.ModelReady && result.Error == "",
		Confidence:                result.PredictionConfidence,
		Calibration:               result.Calibration,
		FeatureContributions:      result.FeatureContributions,
		FallbackReason:            result.FallbackReason,
	}
}

// UnavailableAdvisory labels a deterministic fallback without inventing a score.
func UnavailableAdvisory(reason string) AdvisoryMetadata {
	return AdvisoryMetadata{
		OutputKind:                OutputKindAdvisory,
		DecisionAuthority:         AuthorityAdvisory,
		MayActuate:                false,
		DeterministicRuleRequired: true,
		Available:                 false,
		Confidence:                0,
		Calibration: map[string]interface{}{
			"status": "NOT_EVALUATED",
			"method": "none",
		},
		FeatureContributions: []FeatureContribution{},
		FallbackReason:       reason,
	}
}
