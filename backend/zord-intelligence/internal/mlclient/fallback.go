package mlclient

// FallbackIFResult returns a safe default when the Python ML service is unavailable
// or times out.  Mirrors the Go service's own early-return on insufficient history:
// score=0.5, level="INSUFFICIENT_DATA".  Business logic downstream treats this
// the same as not enough historical data — no alert is raised.
func FallbackIFResult() IFResult {
	return IFResult{
		Score:       0.5,
		Level:       "INSUFFICIENT_DATA",
		AnomalyType: "ml_service_unavailable",
	}
}

// FallbackZScoreResult returns a safe default for Z-score when the ML service is
// unavailable.  score=0, level="INSUFFICIENT_DATA" mirrors the Go zscore.Detect
// response when history is below MinSamples — no anomaly alert is raised.
func FallbackZScoreResult() ZScoreResult {
	return ZScoreResult{
		Score:  0.0,
		Level:  "INSUFFICIENT_DATA",
		ZScore: 0.0,
		Mean:   0.0,
		StdDev: 0.0,
	}
}

// FallbackLRResult returns a neutral probability when the ML service is unavailable.
// Probability=0.5, Level="MEDIUM" is conservative: it neither suppresses nor
// escalates risk signals — the deterministic RiskTier still drives downstream logic.
func FallbackLRResult() LRResult {
	return LRResult{
		Probability: 0.5,
		Level:       "MEDIUM",
	}
}

// FallbackRCAResult returns a safe empty result when the Python ML service is
// unavailable or times out.  Empty TopClusters means no RCA clusters are surfaced
// — callers treat this as "no clustering available yet" and never panic.
func FallbackRCAResult() RCAClusterResult {
	return RCAClusterResult{
		TopClusters:            []RCAClusterSummary{},
		FeatureContractVersion: "rca_v1",
	}
}

// FallbackLeakagePredictionResult represents leakage prediction being unavailable.
// Callers should not treat this as a real low-risk prediction.
func FallbackLeakagePredictionResult() LeakagePredictionResult {
	return LeakagePredictionResult{
		PredictedLeakageRate:  0.0,
		PredictedLeakageMinor: 0.0,
		RiskTier:              "",
		ModelReady:            false,
		Status:                "UNAVAILABLE",
	}
}
