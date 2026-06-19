package mlclient

import "time"

// Event type constants — must match Python app/schemas.py exactly.
const (
	EventIFScore        = "ISOLATION_FOREST_SCORE"
	EventZScore         = "ZSCORE_DETECT"
	EventLRPredict      = "LOGISTIC_REGRESSION_PREDICT"
	EventLRTrain        = "LOGISTIC_REGRESSION_TRAIN"
	EventRCACluster     = "RCA_CLUSTER_SUMMARIZE"
	EventLeakagePredict = "LEAKAGE_PREDICTION_PREDICT"
	EventLeakageTrain   = "LEAKAGE_PREDICTION_TRAIN"
)

// MLRequest is the envelope published to ml.request.events.
type MLRequest struct {
	EventID   string                 `json:"event_id"`
	EventType string                 `json:"event_type"`
	TenantID  string                 `json:"tenant_id"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp int64                  `json:"timestamp"`
}

// MLResult is the envelope consumed from ml.result.events.
type MLResult struct {
	EventID      string                 `json:"event_id"`
	EventType    string                 `json:"event_type"`
	TenantID     string                 `json:"tenant_id"`
	ModelOutputs map[string]interface{} `json:"model_outputs"`
	ModelVersion string                 `json:"model_version"`
	ProcessedAt  int64                  `json:"processed_at"`
	Error        string                 `json:"error,omitempty"`
}

// ── Per-model typed request/result structs ────────────────────────────────────

// IFRequest carries inputs for Isolation Forest scoring.
// History is a slice of pre-built 5-element feature vectors from ml_feature_store.
type IFRequest struct {
	TenantID        string
	AmbiguityRate   float64
	VarianceRate    float64
	SettlementRatio float64
	UnresolvedRatio float64
	MissingRefRate  float64
	History         [][]float64
}

// IFResult mirrors isolation.Result from the old Go implementation.
type IFResult struct {
	Score       float64
	Level       string
	AnomalyType string
}

// ZScoreRequest carries inputs for Z-score anomaly detection.
type ZScoreRequest struct {
	TenantID     string
	CurrentValue float64
	History      []float64
}

// ZScoreResult mirrors zscore.Result from the old Go implementation.
type ZScoreResult struct {
	Score  float64
	Level  string
	ZScore float64
	Mean   float64
	StdDev float64
}

// LRRequest carries inputs for Logistic Regression prediction.
type LRRequest struct {
	TenantID               string
	AmbiguityRate          float64
	ProviderRefMissingRate float64
	AvgConfidence          float64
	ValueAtRiskMinor       float64
	TotalIntendedMinor     float64
}

// LRResult mirrors logistic.Model.Predict output from the old Go implementation.
type LRResult struct {
	Probability float64
	Level       string
}

// LRTrainRequest carries inputs for one online SGD training step (fire-and-forget).
type LRTrainRequest struct {
	TenantID     string
	Features     []float64 // 4-element vector, already built via BuildLRFeatures
	Label        float64
	LearningRate float64
}

// BuildLRFeatures constructs the 4-element logistic regression feature vector.
// Exact port of Go logistic.BuildFeatures — kept here so the logistic package
// can be fully removed from the service layer.
//
// Feature order (must match Python logistic_regression.build_features):
//
//	[0] ambiguity_rate
//	[1] provider_ref_missing_rate
//	[2] low_confidence_proxy = 1 - avg_confidence  (inverted: higher = worse)
//	[3] value_at_risk_rate   = value_at_risk_minor / total_intended_minor
func BuildLRFeatures(
	ambiguityRate float64,
	providerRefMissingRate float64,
	avgConfidence float64,
	valueAtRiskMinor float64,
	totalIntendedMinor float64,
) []float64 {
	f3 := 0.0
	if totalIntendedMinor > 0 {
		f3 = clamp(valueAtRiskMinor / totalIntendedMinor)
	}
	return []float64{
		clamp(ambiguityRate),
		clamp(providerRefMissingRate),
		clamp(1.0 - avgConfidence),
		f3,
	}
}

// ── RCA Clustering types ──────────────────────────────────────────────────────

// RCACandidate is one payment intent with all merged signals from Services 2, 5B, 5C, 6, 7.
// Field names must stay in sync with Python schemas.RCACandidate exactly.
type RCACandidate struct {
	IntentID            string `json:"intent_id"`
	ReasonText          string `json:"reason_text"`
	IntendedAmountMinor int64  `json:"intended_amount_minor"`
	// Categorical
	SourceStrengthClass string `json:"source_strength_class"`
	ObservationKind     string `json:"observation_kind"`
	DecisionType        string `json:"decision_type"`
	GovernanceState     string `json:"governance_state"`
	// Numeric
	ParseConfidence       float64 `json:"parse_confidence"`
	MappingConfidence     float64 `json:"mapping_confidence"`
	CarrierRichnessScore  float64 `json:"carrier_richness_score"`
	AttachmentReadiness   float64 `json:"attachment_readiness_score"`
	AmbiguityScore        float64 `json:"ambiguity_score"`
	ConfidenceScore       float64 `json:"confidence_score"`
	AmountVariancePct     float64 `json:"amount_variance_pct"`
	SettlementDelayDays   int     `json:"settlement_delay_days"`
	ProofReadinessScore   float64 `json:"proof_readiness_score"`
	MatchabilityScore     float64 `json:"matchability_score"`
	PackCompletenessScore float64 `json:"pack_completeness_score"`
	CandidateCount        int     `json:"candidate_count"`
	MissingLeafCount      int     `json:"missing_leaf_count"`
	// Binary flags (0/1)
	MissingClientRef      int `json:"missing_client_ref"`
	MissingProviderRef    int `json:"missing_provider_ref"`
	MissingBankRef        int `json:"missing_bank_ref"`
	ReversalFlag          int `json:"reversal_flag"`
	ReturnFlag            int `json:"return_flag"`
	DuplicateRowDetected  int `json:"duplicate_row_detected"`
	ValueDateMismatch     int `json:"value_date_mismatch_flag"`
	CrossPeriodFlag       int `json:"cross_period_flag"`
	DuplicateRiskFlag     int `json:"duplicate_risk_flag"`
	MissingEvidencePack   int `json:"missing_evidence_pack"`
	GovernanceLeafMissing int `json:"governance_leaf_missing"`
	IdempotencyKeyMissing int `json:"idempotency_key_missing"`
	WeakBatchRefFlag      int `json:"weak_batch_ref_flag"`
}

// RCARequest is the payload sent to the Python ML service for clustering.
type RCARequest struct {
	TenantID               string         `json:"tenant_id"`
	BatchID                string         `json:"batch_id"`
	Candidates             []RCACandidate `json:"candidates"`
	FeatureContractVersion string         `json:"feature_contract_version"`
	FinalityLabel          string         `json:"finality_label,omitempty"`
}

// RCAClusterSummary is one cluster in the result, fully enriched from the taxonomy.
type RCAClusterSummary struct {
	ClusterCode           string   `json:"cluster_code"`
	ClusterLabel          string   `json:"cluster_label"`
	Category              string   `json:"category"`
	Severity              string   `json:"severity"`
	RecommendedAction     string   `json:"recommended_action"`
	UserExplanation       string   `json:"user_explanation"`
	BusinessImpact        string   `json:"business_impact"`
	TriggerCondition      string   `json:"trigger_condition"`
	DefaultActionContract string   `json:"default_action_contract"`
	IntelligenceLayer     string   `json:"intelligence_layer"`
	InternalOnly          bool     `json:"internal_only"`
	Size                  int      `json:"size"`
	AffectedAmountMinor   int64    `json:"affected_amount_minor"`
	SharePct              float64  `json:"share_pct"`
	MembershipConfidence  float64  `json:"membership_confidence"`
	RepresentativeReasons []string `json:"representative_reasons"`
	TopScope              string   `json:"top_scope"`
}

// RCAClusterResult is the full response from the Python RCA clustering service.
type RCAClusterResult struct {
	TopClusters              []RCAClusterSummary `json:"top_clusters"`
	ClusterCount             int                 `json:"cluster_count"`
	ClusteredPoints          int                 `json:"clustered_points"`
	NoisePoints              int                 `json:"noise_points"`
	TotalPoints              int                 `json:"total_points"`
	TotalAffectedAmountMinor int64               `json:"total_affected_amount_minor"`
	FeatureContractVersion   string              `json:"feature_contract_version"`
}

// LeakagePredictionRequest carries the batch-level intent-safe feature row for
// leakage-rate regression.
type LeakagePredictionRequest struct {
	TenantID string
	BatchID  string
	Features map[string]interface{}
}

// LeakagePredictionResult mirrors the Python CatBoost bundle inference output.
type LeakagePredictionResult struct {
	PredictedLeakageRate  float64
	PredictedLeakageMinor float64
	RiskTier              string
	ModelReady            bool
	Status                string
	TrainingRowCount      int
	MinTrainingRows       int
	FallbackFeatureCount  int
	FallbackFeatures      []string
	FallbackSegmentLevel  string
}

// LeakageTrainRequest signals that a newly labeled leakage batch is now available
// in ml_feature_store. The Python side reads the actual training rows from the
// intelligence database and retrains when enough have accumulated.
type LeakageTrainRequest struct {
	TenantID string
	BatchID  string
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func nowUnix() int64 {
	return time.Now().Unix()
}
