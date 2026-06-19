package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

type PatternIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	batchRepo    *persistence.BatchContractRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
	mlClient     *mlclient.Client
	slaRepo      *persistence.SLATimerRepo
}

type patternFeatureInputs struct {
	AmbiguityRate   float64
	VarianceRate    float64
	SettlementRatio float64
	UnresolvedRatio float64
	MissingRefRate  float64
}

func NewPatternIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
	mlClient *mlclient.Client,
	slaRepo *persistence.SLATimerRepo,
) *PatternIntelligenceService {
	return &PatternIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		batchRepo:    batchRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
		mlClient:     mlClient,
		slaRepo:      slaRepo,
	}
}

// PatternSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = PATTERN.
//
// It covers all 8 pattern categories defined in the Pattern Intelligence spec:
//   A. Source-system traceability patterns
//   B. Bank/PSP/provider reliability patterns
//   C. Ambiguity pattern intelligence
//   D. Leakage/variance pattern intelligence
//   E. Duplicate-risk patterns
//   F. Manual review / client file quality patterns
//   G. Evidence weakness patterns
//   H. Settlement timing / SLA patterns
//
// The BATCH-scoped snapshot (ScopeType=BATCH) carries the original P1–P6 batch
// health fields. The TENANT-scoped snapshot carries the multi-dimensional patterns.
type PatternSnapshot struct {
	BatchID string `json:"batch_id"`

	TotalCount         int             `json:"total_count"`
	SuccessCount       int             `json:"success_count"`
	FailedCount        int             `json:"failed_count"`
	PendingCount       int             `json:"pending_count"`
	ReversedCount      int             `json:"reversed_count"`
	PartialReconCount  int             `json:"partial_recon_count"`
	TotalVarianceMinor decimal.Decimal `json:"total_variance_minor"`

	AmbiguityScore float64 `json:"ambiguity_score"`
	BatchRiskScore float64 `json:"batch_risk_score"`
	FinalityStatus string  `json:"finality_status"`

	// ── P1: Batch attachment quality score ────────────────────────────────────
	BatchQualityScore   float64 `json:"batch_quality_score"` // primary P1 output
	ExactMatchCount     int     `json:"exact_match_count"`
	HighConfidenceCount int     `json:"high_confidence_count"`
	AmbiguousCount      int     `json:"ambiguous_count"`
	UnresolvedCount     int     `json:"unresolved_count"`
	ConflictedCount     int     `json:"conflicted_count"`

	RiskSignals []BatchRiskSignal `json:"risk_signals"`
	RiskTier    string            `json:"risk_tier"`

	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`
	AnomalyType       string  `json:"anomaly_type"`

	PrepareAndSignRecommended bool   `json:"prepare_and_sign_recommended"`
	RecommendedAction         string `json:"recommended_action,omitempty"`

	// ── Section A: Source-system traceability patterns ────────────────────────
	// Ranked list of source systems by quality issue severity.
	SourceQualityPatterns []SourceQualityPattern `json:"source_quality_patterns,omitempty"`
	// WeakestSourceSystem: the source system with the highest combined issue rate.
	// Pre-computed for fast recommendation trigger evaluation.
	WeakestSourceSystem        string  `json:"weakest_source_system,omitempty"`
	WeakestSourceManualReviewRate float64 `json:"weakest_source_manual_review_rate,omitempty"`
	WeakestSourceMissingRefRate  float64 `json:"weakest_source_missing_ref_rate,omitempty"`

	// ── Section B: Bank/PSP/provider reliability patterns ────────────────────
	ProviderQualityPatterns []ProviderQualityPattern `json:"provider_quality_patterns,omitempty"`
	WeakestProviderID       string                   `json:"weakest_provider_id,omitempty"`

	// ── Section C: Ambiguity pattern intelligence ─────────────────────────────
	AmbiguityBySource      []AmbiguityBySourcePattern `json:"ambiguity_by_source,omitempty"`
	TopAmbiguousSourceSystem string                   `json:"top_ambiguous_source_system,omitempty"`
	TopAmbiguousSourceRate   float64                  `json:"top_ambiguous_source_rate,omitempty"`

	// ── Section D: Leakage / variance pattern intelligence ───────────────────
	UnexplainedVarianceAmountMinor  decimal.Decimal `json:"unexplained_variance_amount_minor,omitempty"`
	WhitelistedDeductionAmountMinor decimal.Decimal `json:"whitelisted_deduction_amount_minor,omitempty"`
	OverSettlementAmountMinor       decimal.Decimal `json:"over_settlement_amount_minor,omitempty"`

	// ── Section E: Duplicate-risk patterns ───────────────────────────────────
	DuplicateRiskExposureMinor decimal.Decimal `json:"duplicate_risk_exposure_minor,omitempty"`
	DuplicateRiskRate          float64         `json:"duplicate_risk_rate,omitempty"`

	// ── Section F: Manual review / client file quality patterns ───────────────
	TenantManualReviewRate float64           `json:"tenant_manual_review_rate,omitempty"`
	TopManualReviewReasons []ReasonBreakdown `json:"top_manual_review_reasons,omitempty"`

	// ── Section G: Evidence weakness patterns ────────────────────────────────
	MissingLeafRate     float64 `json:"missing_leaf_rate,omitempty"`
	EvidencePackCoverage float64 `json:"evidence_pack_coverage,omitempty"`
	WeakEvidenceRate    float64 `json:"weak_evidence_rate,omitempty"`

	// ── Section H: Settlement timing / SLA patterns ───────────────────────────
	SettlementDelayP50Days float64 `json:"settlement_delay_p50_days,omitempty"`
	SettlementDelayP95Days float64 `json:"settlement_delay_p95_days,omitempty"`
	CrossPeriodRate        float64 `json:"cross_period_rate,omitempty"`
	PendingBeyondSLARate   float64 `json:"pending_beyond_sla_rate,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// SourceQualityPattern summarises one source system's payment file quality.
// Used in PatternSnapshot.SourceQualityPatterns (section A).
type SourceQualityPattern struct {
	SourceSystem         string          `json:"source_system"`
	TotalIntentCount     int             `json:"total_intent_count"`
	BatchCount           int             `json:"batch_count"`           // approximate distinct batches from this source
	ManualReviewRate     float64         `json:"manual_review_rate"`
	MissingClientRefRate float64         `json:"missing_client_ref_rate"`
	LowMatchabilityRate  float64         `json:"low_matchability_rate"`
	DuplicateRiskRate    float64         `json:"duplicate_risk_rate"`
	ManualReviewAmount   decimal.Decimal `json:"manual_review_amount_minor"`
	// Severity: CRITICAL (>30%), HIGH (>15%), MEDIUM (>5%), LOW (<5%) based on combined issue rate.
	Severity string `json:"severity"`
}

// ProviderQualityPattern summarises one PSP/bank provider's settlement quality.
// Used in PatternSnapshot.ProviderQualityPatterns (section B).
type ProviderQualityPattern struct {
	ProviderID             string  `json:"provider_id"`
	AmbiguityRate          float64 `json:"ambiguity_rate"`
	OrphanRate             float64 `json:"orphan_rate"`
	AvgCarrierRichness     float64 `json:"avg_carrier_richness"`
	AvgParseConfidence     float64 `json:"avg_parse_confidence"`
	SettlementDelayP95Days float64 `json:"settlement_delay_p95_days"`
	Severity               string  `json:"severity"`
}

// AmbiguityBySourcePattern summarises ambiguity signals per source system.
// Used in PatternSnapshot.AmbiguityBySource (section C).
type AmbiguityBySourcePattern struct {
	SourceSystem        string          `json:"source_system"`
	AmbiguityRate       float64         `json:"ambiguity_rate"`
	CollisionRate       float64         `json:"collision_rate"`
	LowConfidenceRate   float64         `json:"low_confidence_rate"`
	ValueAtRiskMinor    decimal.Decimal `json:"value_at_risk_minor"`
	TotalDecisions      int             `json:"total_decisions"`
	Severity            string          `json:"severity"`
}

// ReasonBreakdown summarises manual review events by reason code.
// Used in PatternSnapshot.TopManualReviewReasons (section F).
type ReasonBreakdown struct {
	ReasonCode  string          `json:"reason_code"`
	Count       int             `json:"count"`
	AmountMinor decimal.Decimal `json:"amount_minor"`
	Rate        float64         `json:"rate"` // count / total_manual_review_count
}

type BatchRiskSignal struct {
	Signal       string  `json:"signal"`
	Severity     string  `json:"severity"`
	Value        float64 `json:"value"`
	Threshold    float64 `json:"threshold"`
	Contribution float64 `json:"contribution"`
}

func (s *PatternIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) error {
	batchHealth, err := s.projRepo.GetBatchHealth(ctx, tenantID, batchID)
	if err != nil {
		return fmt.Errorf("pattern_svc.ComputeAndSave GetBatchHealth batch=%s: %w", batchID, err)
	}
	if batchHealth == nil || batchHealth.TotalCount == 0 {
		bc, err := s.batchRepo.GetByID(ctx, batchID)
		if err != nil || bc == nil {
			return nil
		}
		batchHealth = &models.BatchHealthValue{
			TotalCount:                bc.TotalCount,
			SuccessCount:              bc.SuccessCount,
			FailedCount:               bc.FailedCount,
			PendingCount:              bc.PendingCount,
			ReversedCount:             bc.ReversedCount,
			PartialReconCount:         bc.PartialReconCount,
			TotalIntendedAmountMinor:  bc.TotalIntendedAmountMinor,
			TotalConfirmedAmountMinor: bc.TotalConfirmedAmountMinor,
			TotalVarianceMinor:        bc.TotalVarianceMinor,
			FinalityStatus:            bc.BatchFinalityStatus,
		}
		if bc.AmbiguityScore != nil {
			batchHealth.AmbiguityScore = *bc.AmbiguityScore
		}
	}

	inputs := s.buildFeatureInputs(ctx, tenantID, batchHealth)
	snap := s.buildSnapshot(batchID, batchHealth, inputs)

	// Read IF history synchronously (fast DB call, not ML).
	history, histErr := s.mlRepo.GetRecentBatchFeatures(ctx, tenantID, 200)
	if histErr != nil {
		log.Printf("pattern_svc: GetRecentBatchFeatures failed tenant=%s: %v", tenantID, histErr)
		history = nil
	}

	const minBatches = 10
	if len(history) < minBatches {
		snap.BatchAnomalyScore = 0.5
		snap.AnomalyLevel = "INSUFFICIENT_DATA"
		snap.AnomalyType = "not_enough_history"
		// Write synchronously — no ML call needed
		return s.finalizePatternSnapshot(ctx, tenantID, batchID, snap, inputs, batchHealth, windowStart, windowEnd)
	}

	// Fire async IF call — consumer goroutine returns immediately.
	// All snapshot writes happen inside the callback.
	s.mlClient.InvokeIsolationForestAsync(ctx, mlclient.IFRequest{
		TenantID:        tenantID,
		AmbiguityRate:   inputs.AmbiguityRate,
		VarianceRate:    inputs.VarianceRate,
		SettlementRatio: inputs.SettlementRatio,
		UnresolvedRatio: inputs.UnresolvedRatio,
		MissingRefRate:  inputs.MissingRefRate,
		History:         history,
	}, func(ifResult mlclient.IFResult, ifErr error) {
		if ifErr != nil {
			log.Printf("pattern_svc: InvokeIsolationForestAsync failed tenant=%s: %v", tenantID, ifErr)
		}
		riskHint := patternClamp01((inputs.AmbiguityRate + inputs.VarianceRate + math.Max(inputs.UnresolvedRatio, inputs.MissingRefRate) + (1.0 - inputs.SettlementRatio)) / 4.0)
		snap.BatchAnomalyScore = patternClamp01((ifResult.Score + riskHint) / 2.0)
		snap.AnomalyLevel = levelFromScore(snap.BatchAnomalyScore)
		snap.AnomalyType = ifResult.AnomalyType

		if finalErr := s.finalizePatternSnapshot(ctx, tenantID, batchID, snap, inputs, batchHealth, windowStart, windowEnd); finalErr != nil {
			log.Printf("pattern_svc: finalizePatternSnapshot async failed tenant=%s batch=%s: %v",
				tenantID, batchID, finalErr)
		}
	})

	return nil
}

// finalizePatternSnapshot writes the PATTERN snapshot and all related records.
// Called from both the synchronous (insufficient history) and async (IF result) paths.
func (s *PatternIntelligenceService) finalizePatternSnapshot(
	ctx context.Context,
	tenantID, batchID string,
	snap PatternSnapshot,
	inputs patternFeatureInputs,
	bh *models.BatchHealthValue,
	windowStart, windowEnd time.Time,
) error {
	projKey := fmt.Sprintf("batch.health.%s", batchID)
	projRefs := []string{projKey}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("pattern_svc.finalizePatternSnapshot marshal batch=%s: %w", batchID, err)
	}

	scopeRef := batchID
	snapID := "snap_" + uuid.New().String()
	modelVer := "isolation_forest_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "PATTERN",
		ScopeType:          "BATCH",
		ScopeRef:           &scopeRef,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("pattern_svc.finalizePatternSnapshot Create snapshot batch=%s: %w", batchID, err)
	}

	if err := s.projRepo.UpsertPatternTenantSummary(
		ctx, tenantID, snap.BatchRiskScore, inputs.SettlementRatio, windowStart, windowEnd,
	); err != nil {
		log.Printf("pattern_svc: UpsertPatternTenantSummary failed tenant=%s batch=%s: %v", tenantID, batchID, err)
	}

	if err := s.computeAndSaveTenantPatternKPIs(ctx, tenantID, batchID, windowStart, windowEnd); err != nil {
		log.Printf("pattern_svc: computeAndSaveTenantPatternKPIs failed tenant=%s batch=%s: %v",
			tenantID, batchID, err)
	}

	if err := s.persistMLFeatures(ctx, tenantID, batchID, snapID, bh, inputs, windowStart, windowEnd); err != nil {
		_ = err
	}

	s.persistMLPrediction(ctx, tenantID, batchID, snapID, bh, inputs, snap)
	return nil
}

func (s *PatternIntelligenceService) buildSnapshot(
	batchID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
) PatternSnapshot {
	snap := PatternSnapshot{
		BatchID:             batchID,
		TotalCount:          bh.TotalCount,
		SuccessCount:        bh.SuccessCount,
		FailedCount:         bh.FailedCount,
		PendingCount:        bh.PendingCount,
		ReversedCount:       bh.ReversedCount,
		PartialReconCount:   bh.PartialReconCount,
		TotalVarianceMinor:  bh.TotalVarianceMinor,
		AmbiguityScore:      bh.AmbiguityScore,
		FinalityStatus:      bh.FinalityStatus,
		BatchQualityScore:   bh.AggregateScore,
		ExactMatchCount:     bh.ExactMatchCount,
		HighConfidenceCount: bh.HighConfidenceCount,
		AmbiguousCount:      bh.AmbiguousCount,
		UnresolvedCount:     bh.UnresolvedCount,
		ConflictedCount:     bh.ConflictedCount,
		ComputedAt:          time.Now().UTC(),
	}

	snap.BatchRiskScore, snap.RiskSignals = s.computeRiskScore(inputs)
	snap.RiskTier = batchRiskTier(snap.BatchRiskScore)
	snap.PrepareAndSignRecommended = snap.BatchRiskScore > 0.60
	snap.RecommendedAction = s.recommendedAction(&snap)
	return snap
}

func (s *PatternIntelligenceService) computeRiskScore(inputs patternFeatureInputs) (float64, []BatchRiskSignal) {
	var signals []BatchRiskSignal
	score := 0.0

	ambiguityContrib := 0.30 * patternClamp01(inputs.AmbiguityRate/0.25)
	score += ambiguityContrib
	if ambiguityContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "HIGH_AMBIGUITY",
			Severity:     severityFromRate(inputs.AmbiguityRate, 0.25, 0.50),
			Value:        inputs.AmbiguityRate,
			Threshold:    0.25,
			Contribution: ambiguityContrib,
		})
	}

	varianceContrib := 0.30 * patternClamp01(inputs.VarianceRate/0.10)
	score += varianceContrib
	if varianceContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "HIGH_VARIANCE_RATIO",
			Severity:     severityFromRate(inputs.VarianceRate, 0.10, 0.20),
			Value:        inputs.VarianceRate,
			Threshold:    0.10,
			Contribution: varianceContrib,
		})
	}

	unresolvedOrMissing := math.Max(inputs.UnresolvedRatio, inputs.MissingRefRate)
	unresolvedContrib := 0.20 * patternClamp01(unresolvedOrMissing/0.10)
	score += unresolvedContrib
	if unresolvedContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "UNRESOLVED_OR_MISSING_REF_RATE",
			Severity:     severityFromRate(unresolvedOrMissing, 0.10, 0.20),
			Value:        unresolvedOrMissing,
			Threshold:    0.10,
			Contribution: unresolvedContrib,
		})
	}

	settlementGap := patternClamp01(1.0 - inputs.SettlementRatio)
	settlementGapContrib := 0.20 * patternClamp01(settlementGap/0.25)
	score += settlementGapContrib
	if settlementGapContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "SETTLEMENT_GAP",
			Severity:     severityFromRate(settlementGap, 0.25, 0.50),
			Value:        settlementGap,
			Threshold:    0.25,
			Contribution: settlementGapContrib,
		})
	}

	return patternClamp01(score), signals
}

func batchRiskTier(score float64) string {
	switch {
	case score >= 0.75:
		return "CRITICAL"
	case score >= 0.50:
		return "HIGH"
	case score >= 0.25:
		return "MEDIUM"
	case score > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

func (s *PatternIntelligenceService) recommendedAction(snap *PatternSnapshot) string {
	if snap.BatchRiskScore >= 0.75 {
		return "REVIEW_AMBIGUOUS_BATCH: batch risk is CRITICAL - manual review required before proceeding"
	}
	if snap.PrepareAndSignRecommended {
		return "PREPARE_AND_SIGN_RECOMMENDED: batch quality risk justifies Zord prepare-and-sign mode"
	}
	if snap.AmbiguityScore > 0.50 {
		return "REQUEST_STRONGER_CARRIER_CONTRACT: high ambiguity - require UTR/client_ref in settlement files"
	}
	if snap.TotalVarianceMinor.IsPositive() {
		return "OPEN_OPS_INCIDENT: financial variance detected - reconciliation review required"
	}
	return ""
}

func (s *PatternIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, batchID, snapID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
	snap PatternSnapshot,
) {
	explanation := map[string]any{
		"algorithm":     "isolation_forest_v1",
		"calibration":   "if_plus_risk_hint",
		"anomaly_type":  snap.AnomalyType,
		"anomaly_level": snap.AnomalyLevel,
		"features": map[string]any{
			"ambiguity_rate":   inputs.AmbiguityRate,
			"variance_rate":    inputs.VarianceRate,
			"settlement_ratio": inputs.SettlementRatio,
			"unresolved_ratio": inputs.UnresolvedRatio,
			"missing_ref_rate": inputs.MissingRefRate,
			"total_count":      bh.TotalCount,
			"variance_minor":   bh.TotalVarianceMinor,
		},
	}
	expJSON, _ := json.Marshal(explanation)

	pred := persistence.MLPrediction{
		PredictionID:     "pred_" + uuid.New().String(),
		TenantID:         tenantID,
		ModelID:          "isolation_forest_v1_pattern",
		ScopeType:        "BATCH",
		ScopeRef:         batchID,
		PredictionFamily: "PATTERN",
		PredictionValue:  snap.AnomalyLevel,
		PredictionScore:  snap.BatchAnomalyScore,
		Confidence:       1.0,
		ExplanationJSON:  expJSON,
		SnapshotID:       &snapID,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.predRepo.InsertPrediction(ctx, pred); err != nil {
		log.Printf("pattern_svc: InsertPrediction failed tenant=%s batch=%s: %v", tenantID, batchID, err)
	}
}

func (s *PatternIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, batchID, snapshotID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"total_count":                 bh.TotalCount,
		"settled_count":               settledCountForBatch(bh),
		"total_intended_amount_minor": bh.TotalIntendedAmountMinor,
		"total_variance_minor":        bh.TotalVarianceMinor,
		"ambiguity_score":             bh.AmbiguityScore,
		"ambiguity_rate":              inputs.AmbiguityRate,
		"variance_rate":               inputs.VarianceRate,
		"settlement_ratio":            inputs.SettlementRatio,
		"settlement_gap":              patternClamp01(1.0 - inputs.SettlementRatio),
		"unresolved_ratio":            inputs.UnresolvedRatio,
		"missing_ref_rate":            inputs.MissingRefRate,
		"finality_status":             bh.FinalityStatus,
		"snapshot_id":                 snapshotID,
	}
	featJSON, err := json.Marshal(features)
	if err != nil {
		return err
	}
	return s.mlRepo.Insert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  "feat_" + uuid.New().String(),
		TenantID:      tenantID,
		ScopeType:     "BATCH",
		ScopeRef:      batchID,
		FeatureFamily: "PATTERN",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil,
		CreatedAt:     time.Now().UTC(),
	})
}

func safeDivide(num, denom float64) float64 {
	if denom == 0 {
		return 0
	}
	return num / denom
}

func settledCountForBatch(bh *models.BatchHealthValue) int {
	settled := bh.SuccessCount + bh.PartialReconCount + bh.ReversedCount
	if settled < 0 {
		return 0
	}
	if settled > bh.TotalCount {
		return bh.TotalCount
	}
	return settled
}

func (s *PatternIntelligenceService) buildFeatureInputs(
	ctx context.Context,
	tenantID string,
	bh *models.BatchHealthValue,
) patternFeatureInputs {
	inputs := patternFeatureInputs{
		AmbiguityRate:   patternClamp01(bh.AmbiguityScore),
		VarianceRate:    0,
		SettlementRatio: 0,
		UnresolvedRatio: 0,
		MissingRefRate:  0,
	}

	if bh.TotalIntendedAmountMinor.IsPositive() {
		inputs.VarianceRate = patternClamp01(math.Abs(bh.TotalVarianceMinor.InexactFloat64()) / bh.TotalIntendedAmountMinor.InexactFloat64())
	}
	if bh.TotalCount > 0 {
		inputs.SettlementRatio = patternClamp01(float64(settledCountForBatch(bh)) / float64(bh.TotalCount))
	}

	amb, err := s.projRepo.GetAmbiguitySummary(ctx, tenantID)
	if err != nil || amb == nil {
		return inputs
	}

	decisionDenom := amb.TotalDecisions
	if decisionDenom <= 0 {
		decisionDenom = bh.TotalCount
	}
	if decisionDenom > 0 {
		inputs.UnresolvedRatio = patternClamp01(float64(amb.UnresolvedSettlementCount) / float64(decisionDenom))
	}
	inputs.MissingRefRate = patternClamp01(amb.ProviderRefMissingRate)
	if amb.AmbiguityRate > inputs.AmbiguityRate {
		inputs.AmbiguityRate = patternClamp01(amb.AmbiguityRate)
	}

	return inputs
}

func severityFromRate(value, highThreshold, criticalThreshold float64) string {
	switch {
	case value >= criticalThreshold:
		return "CRITICAL"
	case value >= highThreshold:
		return "HIGH"
	case value > 0:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func patternClamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func levelFromScore(score float64) string {
	switch {
	case score >= 0.80:
		return "CRITICAL"
	case score >= 0.65:
		return "HIGH"
	case score >= 0.55:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// PatternTenantKPISnapshot is the TENANT-scoped pattern snapshot holding P2/P3/P6.
type PatternTenantKPISnapshot struct {
	DuplicateRiskRate            float64 `json:"duplicate_risk_rate"`             // P2
	DuplicateRiskCount           int     `json:"duplicate_risk_count"`            // P2 numerator
	TotalIntentCount             int     `json:"total_intent_count"`              // P2 denominator
	SameBeneficiaryAmountDensity float64 `json:"same_beneficiary_amount_density"` // P3
	SettlementDelayP95Days       float64 `json:"settlement_delay_p95_days"`       // P6
	ComputedAt                   time.Time `json:"computed_at"`
}

// computeAndSaveTenantPatternKPIs reads all pattern projections and writes a
// TENANT-scoped PATTERN intelligence snapshot covering all 8 pattern categories.
//
// This replaces the old implementation that only covered P2/P3/P6 batch metrics.
// The enriched snapshot now includes source quality, provider quality, ambiguity
// by source, variance patterns, manual review patterns, evidence weakness, and
// settlement timing patterns.
func (s *PatternIntelligenceService) computeAndSaveTenantPatternKPIs(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) error {
	// ── Read core P2/P6 projection ────────────────────────────────────────────
	p2p6, err := s.projRepo.GetPatternP2P6Summary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("GetPatternP2P6Summary tenant=%s: %w", tenantID, err)
	}

	kpiSnap := PatternTenantKPISnapshot{
		ComputedAt: time.Now().UTC(),
	}
	if p2p6 != nil {
		kpiSnap.DuplicateRiskRate  = p2p6.DuplicateRiskRate
		kpiSnap.DuplicateRiskCount = p2p6.DuplicateRiskCount
		kpiSnap.TotalIntentCount   = p2p6.TotalIntentCount
		kpiSnap.SettlementDelayP95Days = p2p6.SettlementDelayP95Days
	}

	// ── Read P3 (batch density) ───────────────────────────────────────────────
	if batchID != "" {
		density, densityErr := s.projRepo.GetBatchIntentDensity(ctx, tenantID, batchID)
		if densityErr != nil {
			log.Printf("pattern_svc: GetBatchIntentDensity failed tenant=%s batch=%s: %v",
				tenantID, batchID, densityErr)
		} else if density != nil {
			kpiSnap.SameBeneficiaryAmountDensity = density.SameBeneficiaryAmountDensity
		}
	}

	// ── Build enriched PatternSnapshot with all 8 categories ─────────────────
	enriched := PatternSnapshot{
		// Carry forward P2/P3/P6 fields into the multi-dimensional snapshot
		DuplicateRiskRate:            kpiSnap.DuplicateRiskRate,
		SettlementDelayP95Days:       kpiSnap.SettlementDelayP95Days,
		ComputedAt:                   time.Now().UTC(),
	}

	// ── Section A: Source quality patterns ────────────────────────────────────
	enriched.SourceQualityPatterns = s.computeSourceQualityPatterns(ctx, tenantID, windowStart)
	if len(enriched.SourceQualityPatterns) > 0 {
		top := enriched.SourceQualityPatterns[0]
		enriched.WeakestSourceSystem = top.SourceSystem
		enriched.WeakestSourceManualReviewRate = top.ManualReviewRate
		enriched.WeakestSourceMissingRefRate = top.MissingClientRefRate
	}

	// ── Section B: Provider quality patterns ──────────────────────────────────
	enriched.ProviderQualityPatterns = s.computeProviderQualityPatterns(ctx, tenantID, windowStart)
	if len(enriched.ProviderQualityPatterns) > 0 {
		enriched.WeakestProviderID = enriched.ProviderQualityPatterns[0].ProviderID
	}

	// ── Section C: Ambiguity by source ────────────────────────────────────────
	enriched.AmbiguityBySource = s.computeAmbiguityBySource(ctx, tenantID, windowStart)
	if len(enriched.AmbiguityBySource) > 0 {
		enriched.TopAmbiguousSourceSystem = enriched.AmbiguityBySource[0].SourceSystem
		enriched.TopAmbiguousSourceRate = enriched.AmbiguityBySource[0].AmbiguityRate
	}

	// ── Section D: Variance patterns ─────────────────────────────────────────
	enriched.UnexplainedVarianceAmountMinor,
		enriched.WhitelistedDeductionAmountMinor,
		enriched.OverSettlementAmountMinor = s.computeVariancePatterns(ctx, tenantID)

	// ── Section E: Duplicate risk exposure (amount) ───────────────────────────
	if p2p6 != nil {
		enriched.DuplicateRiskExposureMinor = p2p6.DuplicateRiskAmountMinor
	}

	// ── Section F: Manual review patterns ────────────────────────────────────
	enriched.TenantManualReviewRate, enriched.TopManualReviewReasons =
		s.computeManualReviewSummary(ctx, tenantID, windowStart)

	// ── Section G: Evidence weakness patterns ────────────────────────────────
	enriched.MissingLeafRate, enriched.EvidencePackCoverage, enriched.WeakEvidenceRate =
		s.computeEvidencePatterns(ctx, tenantID)

	// ── Section H: Settlement timing patterns ─────────────────────────────────
	enriched.SettlementDelayP50Days, enriched.SettlementDelayP95Days,
		enriched.CrossPeriodRate, enriched.PendingBeyondSLARate =
		s.computeTimingPatterns(ctx, tenantID)

	// ── Write enriched snapshot ───────────────────────────────────────────────
	snapJSON, err := json.Marshal(enriched)
	if err != nil {
		return fmt.Errorf("marshal tenant pattern snapshot: %w", err)
	}

	projRefs := []string{
		"pattern.p2_p6",
		fmt.Sprintf("pattern.batch_density.%s", batchID),
		"pattern.source.*",
		"pattern.provider.*",
		"pattern.ambiguity.source.*",
		"pattern.variance.source.*",
		"defensibility.summary",
	}
	projRefsJSON, _ := json.Marshal(projRefs)
	modelVer := "deterministic_v1"
	snapID := "snap_" + uuid.New().String()
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "PATTERN",
		ScopeType:          "TENANT",
		ScopeRef:           nil,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	})
}

// RecomputeTenantKPIs recomputes and saves the TENANT-scoped Pattern Intelligence
// snapshot without needing a batch. Called by HandleDLQItem after manual review
// data arrives, so the snapshot reflects the latest source quality state.
func (s *PatternIntelligenceService) RecomputeTenantKPIs(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	return s.computeAndSaveTenantPatternKPIs(ctx, tenantID, "", windowStart, windowEnd)
}

// ── MULTI-DIMENSIONAL PATTERN COMPUTE METHODS ─────────────────────────────────
//
// These 7 methods compute the new pattern categories (A–H) from projection_state.
// They are called from computeAndSaveTenantPatternKPIs and their results are merged
// into the enriched PatternTenantKPISnapshot before writing to intelligence_snapshots.

// computeSourceQualityPatterns reads all pattern.source.* projections and returns
// a ranked list of source systems by quality issue severity (section A).
func (s *PatternIntelligenceService) computeSourceQualityPatterns(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) []SourceQualityPattern {
	sources, err := s.projRepo.GetAllSourceQualityProjections(ctx, tenantID, windowStart)
	if err != nil {
		log.Printf("pattern_svc: computeSourceQualityPatterns failed tenant=%s: %v", tenantID, err)
		return nil
	}

	var patterns []SourceQualityPattern
	for _, src := range sources {
		if src.TotalIntentCount == 0 {
			continue
		}
		combined := (src.ManualReviewRate + src.MissingClientRefRate + src.LowMatchabilityRate) / 3.0
		sev := sourcePatternSeverity(combined)
		patterns = append(patterns, SourceQualityPattern{
			SourceSystem:         src.SourceSystem,
			TotalIntentCount:     src.TotalIntentCount,
			BatchCount:           src.BatchCount,
			ManualReviewRate:     src.ManualReviewRate,
			MissingClientRefRate: src.MissingClientRefRate,
			LowMatchabilityRate:  src.LowMatchabilityRate,
			DuplicateRiskRate:    src.DuplicateRiskRate,
			ManualReviewAmount:   src.ManualReviewAmountMinor,
			Severity:             sev,
		})
	}
	return patterns
}

// computeProviderQualityPatterns reads all pattern.provider.* projections (section B).
func (s *PatternIntelligenceService) computeProviderQualityPatterns(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) []ProviderQualityPattern {
	providers, err := s.projRepo.GetAllProviderQualityProjections(ctx, tenantID, windowStart)
	if err != nil {
		log.Printf("pattern_svc: computeProviderQualityPatterns failed tenant=%s: %v", tenantID, err)
		return nil
	}

	var patterns []ProviderQualityPattern
	for _, prov := range providers {
		if prov.TotalSettlementCount == 0 && prov.TotalDecisions == 0 {
			continue
		}
		combined := (prov.AmbiguityRate + prov.OrphanRate + (1.0 - prov.AvgCarrierRichness)) / 3.0
		patterns = append(patterns, ProviderQualityPattern{
			ProviderID:             prov.ProviderID,
			AmbiguityRate:          prov.AmbiguityRate,
			OrphanRate:             prov.OrphanRate,
			AvgCarrierRichness:     prov.AvgCarrierRichness,
			AvgParseConfidence:     prov.AvgParseConfidence,
			SettlementDelayP95Days: prov.SettlementDelayP95Days,
			Severity:               sourcePatternSeverity(combined),
		})
	}
	return patterns
}

// computeAmbiguityBySource reads all pattern.ambiguity.source.* projections (section C).
func (s *PatternIntelligenceService) computeAmbiguityBySource(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) []AmbiguityBySourcePattern {
	sources, err := s.projRepo.GetAllAmbiguityBySourceProjections(ctx, tenantID, windowStart)
	if err != nil {
		log.Printf("pattern_svc: computeAmbiguityBySource failed tenant=%s: %v", tenantID, err)
		return nil
	}

	var patterns []AmbiguityBySourcePattern
	for _, src := range sources {
		if src.TotalDecisions == 0 {
			continue
		}
		patterns = append(patterns, AmbiguityBySourcePattern{
			SourceSystem:      src.SourceSystem,
			AmbiguityRate:     src.AmbiguityRate,
			CollisionRate:     src.CollisionRate,
			LowConfidenceRate: src.LowConfidenceRate,
			ValueAtRiskMinor:  src.ValueAtRiskMinor,
			TotalDecisions:    src.TotalDecisions,
			Severity:          sourcePatternSeverity(src.AmbiguityRate),
		})
	}
	return patterns
}

// computeVariancePatterns reads leakage.total for explained/unexplained split (section D).
func (s *PatternIntelligenceService) computeVariancePatterns(
	ctx context.Context,
	tenantID string,
) (unexplained, whitelisted, overSettlement decimal.Decimal) {
	leakage, err := s.projRepo.GetLeakageSummary(ctx, tenantID)
	if err != nil || leakage == nil {
		return
	}
	unexplained = leakage.UnderSettlementAmountMinor
	whitelisted = leakage.WhitelistedDeductionAmountMinor
	overSettlement = leakage.OverSettlementAmountMinor
	return
}

// computeManualReviewSummary aggregates tenant-level manual review KPIs (section F).
// Reads all source projections and aggregates reason breakdowns.
func (s *PatternIntelligenceService) computeManualReviewSummary(
	ctx context.Context,
	tenantID string,
	windowStart time.Time,
) (tenantRate float64, topReasons []ReasonBreakdown) {
	sources, err := s.projRepo.GetAllSourceQualityProjections(ctx, tenantID, windowStart)
	if err != nil {
		return
	}

	totalIntents, totalReview := 0, 0
	reasonCounts := make(map[string]int)
	reasonAmounts := make(map[string]decimal.Decimal)

	for _, src := range sources {
		totalIntents += src.TotalIntentCount
		totalReview += src.ManualReviewCount
		for code, cnt := range src.ReasonBreakdown {
			reasonCounts[code] += cnt
		}
		// Accumulate amounts per reason (approximate: distribute proportionally)
		if src.ManualReviewCount > 0 {
			for code, cnt := range src.ReasonBreakdown {
				share := decimal.NewFromFloat(float64(cnt) / float64(src.ManualReviewCount))
				reasonAmounts[code] = reasonAmounts[code].Add(src.ManualReviewAmountMinor.Mul(share))
			}
		}
	}

	if totalIntents > 0 {
		tenantRate = math.Round(float64(totalReview)/float64(totalIntents)*10000) / 10000
	}

	for code, cnt := range reasonCounts {
		rate := 0.0
		if totalReview > 0 {
			rate = math.Round(float64(cnt)/float64(totalReview)*10000) / 10000
		}
		topReasons = append(topReasons, ReasonBreakdown{
			ReasonCode:  code,
			Count:       cnt,
			AmountMinor: reasonAmounts[code],
			Rate:        rate,
		})
	}

	// Sort by count descending — most frequent reason first
	for i := 0; i < len(topReasons)-1; i++ {
		for j := i + 1; j < len(topReasons); j++ {
			if topReasons[j].Count > topReasons[i].Count {
				topReasons[i], topReasons[j] = topReasons[j], topReasons[i]
			}
		}
	}

	// Return top 5 reasons only — surfacing more than 5 overwhelms the frontend card
	if len(topReasons) > 5 {
		topReasons = topReasons[:5]
	}
	return
}

// computeEvidencePatterns reads defensibility.summary for missing leaf and coverage (section G).
func (s *PatternIntelligenceService) computeEvidencePatterns(
	ctx context.Context,
	tenantID string,
) (missingLeafRate, evidencePackCoverage, weakEvidenceRate float64) {
	def, err := s.projRepo.GetDefensibilitySummary(ctx, tenantID)
	if err != nil || def == nil {
		return
	}
	missingLeafRate = def.MissingLeafRate
	evidencePackCoverage = def.EvidencePackRate
	weakEvidenceRate = def.WeakEvidenceRate
	return
}

// computeTimingPatterns reads pattern.p2_p6 and sla_timers for timing KPIs (section H).
// Returns (p50, p95, crossPeriodRate, pendingBeyondSLARate).
func (s *PatternIntelligenceService) computeTimingPatterns(
	ctx context.Context,
	tenantID string,
) (p50, p95, crossPeriodRate, pendingBeyondSLARate float64) {
	p2p6, err := s.projRepo.GetPatternP2P6Summary(ctx, tenantID)
	if err != nil || p2p6 == nil {
		return
	}
	p50 = p2p6.SettlementDelayP50Days
	p95 = p2p6.SettlementDelayP95Days

	if p2p6.TotalIntentCount > 0 {
		crossPeriodRate = math.Round(float64(p2p6.CrossPeriodCount)/float64(p2p6.TotalIntentCount)*10000) / 10000
	}

	// pending_beyond_sla_rate = timers past deadline / all active+breached timers.
	// slaRepo may be nil when PatternIntelligenceService is created in unit tests.
	if s.slaRepo != nil {
		beyondSLA, total, slaErr := s.slaRepo.CountSLAForTenant(ctx, tenantID)
		if slaErr != nil {
			log.Printf("pattern_svc: CountSLAForTenant failed tenant=%s: %v", tenantID, slaErr)
		} else if total > 0 {
			pendingBeyondSLARate = math.Round(float64(beyondSLA)/float64(total)*10000) / 10000
		}
	}
	return
}

// sourcePatternSeverity maps a combined issue rate to a severity tier.
// Thresholds based on the Pattern Intelligence spec guidelines.
func sourcePatternSeverity(combinedRate float64) string {
	switch {
	case combinedRate >= 0.30:
		return "CRITICAL"
	case combinedRate >= 0.15:
		return "HIGH"
	case combinedRate >= 0.05:
		return "MEDIUM"
	default:
		return "LOW"
	}
}
