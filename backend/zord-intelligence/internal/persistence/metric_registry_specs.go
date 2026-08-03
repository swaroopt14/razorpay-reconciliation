package persistence

// metric_registry_specs.go — the actual P1-04 registry content: every
// RATIO/WEIGHTED_AVERAGE field in LEAKAGE, AMBIGUITY, and DEFENSIBILITY,
// previously excluded from consistency checking entirely (see
// metric_registry.go's file doc). Field formulas are taken directly from
// the "// numerator / denominator" comments already next to each field in
// internal/models/projection.go.

import "github.com/zord/zord-intelligence/internal/models"

// leakageRatioMetrics — LeakageValue has exactly one derived rate.
var leakageRatioMetrics = []RatioMetric[models.LeakageValue]{
	{
		Name: "leakage_percentage",
		Kind: AggregationRatio,
		Numerator: func(v models.LeakageValue) float64 {
			n := v.UnmatchedAmountMinor.Add(v.UnderSettlementAmountMinor).Add(v.ReversalExposureMinor)
			return n.InexactFloat64()
		},
		Denominator: func(v models.LeakageValue) float64 { return v.TotalIntendedAmountMinor.InexactFloat64() },
		Stored:      func(v models.LeakageValue) float64 { return v.LeakagePercentage },
	},
}

// ambiguityRatioMetrics.
var ambiguityRatioMetrics = []RatioMetric[models.AmbiguityValue]{
	{
		Name: "avg_attachment_confidence", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.AmbiguityValue) float64 { return v.ConfidenceSum },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.ConfidenceCount) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AvgAttachmentConfidence },
	},
	{
		Name: "avg_score_margin", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.AmbiguityValue) float64 { return v.ScoreMarginSum },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.ScoreMarginCount) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AvgScoreMargin },
	},
	{
		Name: "carrier_completeness_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.CarrierCompleteCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalCarrierRecords) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.CarrierCompletenessRate },
	},
	{
		Name: "provider_ref_missing_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.ProviderRefMissingCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.ProviderRefMissingRate },
	},
	{
		Name: "ambiguity_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.AmbiguousIntentCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AmbiguityRate },
	},
	{
		Name: "low_confidence_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.LowConfidenceCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.LowConfidenceRate },
	},
	{
		Name: "candidate_collision_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.CandidateCollisionCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.CandidateCollisionRate },
	},
	{
		Name: "decision_success_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.SuccessfulDecisionCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.DecisionSuccessRate },
	},
}

// defensibilityRatioMetrics. dispute_ready_pct is deliberately absent — see
// AggregationNonAggregatable's doc comment in metric_registry.go.
var defensibilityRatioMetrics = []RatioMetric[models.DefensibilityValue]{
	{
		Name: "evidence_pack_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.EvidencePackRate },
	},
	{
		Name: "governance_coverage_pct", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithGovernanceDecision) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.GovernanceCoveragePct },
	},
	{
		Name: "replayability_pct", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithReplayEquivalence) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.ReplayabilityPct },
	},
	{
		Name: "audit_ready_pct", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack + v.WithGovernanceDecision) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(2 * v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AuditReadyPct },
	},
	{
		Name: "weak_evidence_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WeakEvidenceCount) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.WeakEvidenceRate },
	},
	{
		Name: "avg_intent_quality_score", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.IntentQualitySum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.IntentQualityCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgIntentQualityScore },
	},
	{
		Name: "avg_mapping_confidence", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.MappingConfidenceSum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.MappingConfidenceCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgMappingConfidence },
	},
	{
		Name: "avg_pack_completeness_score", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.PackCompletenessSum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.PackCompletenessCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgPackCompletenessScore },
	},
	{
		Name: "settlement_evidence_coverage", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithSettlementLeaf) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.SettlementEvidenceCoverage },
	},
	{
		Name: "attachment_evidence_coverage", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithAttachmentLeaf) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AttachmentEvidenceCoverage },
	},
	{
		Name: "missing_leaf_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.MissingLeafCount) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalRequiredLeafCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.MissingLeafRate },
	},
}
