package persistence

// metric_registry_specs.go — the actual P1-04 registry content: every
// RATIO/WEIGHTED_AVERAGE field in LEAKAGE, AMBIGUITY, and DEFENSIBILITY,
// previously excluded from consistency checking entirely (see
// metric_registry.go's file doc). Field formulas are taken directly from
// the "// numerator / denominator" comments already next to each field in
// internal/models/projection.go.

import "github.com/zord/zord-intelligence/internal/models"

// leakageRatioMetrics — LeakageValue has exactly one derived rate.
//
// Currency is registered as "MULTI": LeakageValue's projection scope key
// carries no currency dimension, so this ratio is computed over amounts
// blended across whatever currencies a tenant/batch has — a known gap
// tracked by INTEL-11's separate per-currency aggregation fix in
// batch_contract_repo.go (GetUnmatchedAndOrphanByCurrency /
// SummarizeLeakageForWindowByCurrency), which does not yet feed back into
// this projection's own scoping.
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
		Currency:    "MULTI",
		SourceOwner: "zord-intelligence, computed from ingested settlement/observation events",
	},
}

// ambiguityRatioMetrics. All fields here are counts/scores over intent
// decisions, not money — Currency is "N/A" throughout. SourceOwner is
// zord-intelligence's own attachment-matching decision engine: these are
// computed from decisions this service makes, not mirrored from an
// upstream event field.
const ambiguitySourceOwner = "zord-intelligence (self-computed by attachment-matching decision engine)"

var ambiguityRatioMetrics = []RatioMetric[models.AmbiguityValue]{
	{
		Name: "avg_attachment_confidence", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.AmbiguityValue) float64 { return v.ConfidenceSum },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.ConfidenceCount) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AvgAttachmentConfidence },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "avg_score_margin", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.AmbiguityValue) float64 { return v.ScoreMarginSum },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.ScoreMarginCount) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AvgScoreMargin },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "carrier_completeness_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.CarrierCompleteCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalCarrierRecords) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.CarrierCompletenessRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "provider_ref_missing_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.ProviderRefMissingCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.ProviderRefMissingRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "ambiguity_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.AmbiguousIntentCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.AmbiguityRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "low_confidence_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.LowConfidenceCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.LowConfidenceRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "candidate_collision_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.CandidateCollisionCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.CandidateCollisionRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
	{
		Name: "decision_success_rate", Kind: AggregationRatio,
		Numerator:   func(v models.AmbiguityValue) float64 { return float64(v.SuccessfulDecisionCount) },
		Denominator: func(v models.AmbiguityValue) float64 { return float64(v.TotalDecisions) },
		Stored:      func(v models.AmbiguityValue) float64 { return v.DecisionSuccessRate },
		Currency:    "N/A", SourceOwner: ambiguitySourceOwner,
	},
}

// defensibilityRatioMetrics. dispute_ready_pct is deliberately absent — see
// AggregationNonAggregatable's doc comment in metric_registry.go. All
// fields here are counts/scores over intents, not money — Currency is
// "N/A" throughout. SourceOwner is zord-intelligence's own evidence-pack
// and governance-decision tracking.
const defensibilitySourceOwner = "zord-intelligence (self-computed from evidence-pack and governance decision tracking)"

var defensibilityRatioMetrics = []RatioMetric[models.DefensibilityValue]{
	{
		Name: "evidence_pack_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.EvidencePackRate },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "governance_coverage_pct", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithGovernanceDecision) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.GovernanceCoveragePct },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "replayability_pct", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithReplayEquivalence) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.ReplayabilityPct },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "audit_ready_pct", Kind: AggregationRatio,
		Numerator: func(v models.DefensibilityValue) float64 {
			return float64(v.WithEvidencePack + v.WithGovernanceDecision)
		},
		Denominator: func(v models.DefensibilityValue) float64 { return float64(2 * v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AuditReadyPct },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "weak_evidence_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WeakEvidenceCount) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalIntents) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.WeakEvidenceRate },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "avg_intent_quality_score", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.IntentQualitySum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.IntentQualityCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgIntentQualityScore },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "avg_mapping_confidence", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.MappingConfidenceSum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.MappingConfidenceCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgMappingConfidence },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "avg_pack_completeness_score", Kind: AggregationWeightedAverage,
		Numerator:   func(v models.DefensibilityValue) float64 { return v.PackCompletenessSum },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.PackCompletenessCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AvgPackCompletenessScore },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "settlement_evidence_coverage", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithSettlementLeaf) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.SettlementEvidenceCoverage },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "attachment_evidence_coverage", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.WithAttachmentLeaf) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.WithEvidencePack) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.AttachmentEvidenceCoverage },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
	{
		Name: "missing_leaf_rate", Kind: AggregationRatio,
		Numerator:   func(v models.DefensibilityValue) float64 { return float64(v.MissingLeafCount) },
		Denominator: func(v models.DefensibilityValue) float64 { return float64(v.TotalRequiredLeafCount) },
		Stored:      func(v models.DefensibilityValue) float64 { return v.MissingLeafRate },
		Currency:    "N/A", SourceOwner: defensibilitySourceOwner,
	},
}
