package services

// ambiguity_intelligence_service.go
//
// Implements spec Section 10.2 — Ambiguity / Confidence Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the ambiguity.summary projection (maintained atomically by
// AtomicRecordAttachmentDecision in projection_repo.go) and produces
// a materialised AMBIGUITY snapshot.
//
// Key outputs (spec §10.2):
//   - ambiguous_intent_count and ambiguous_amount
//   - unresolved_settlement_count
//   - avg_attachment_confidence
//   - provider_ref_missing_rate
//   - value_at_risk_minor (ambiguous intent exposure; field name kept for API compatibility)
//   - ambiguity_rate (what % of decisions are ambiguous)
//   - risk tier: CRITICAL / HIGH / MEDIUM / LOW / CLEAN
//
// ML EXECUTION: Logistic Regression is now executed by the Python ml-service.
// Go publishes feature vectors to ml.request.events and receives predictions
// from ml.result.events via the mlclient package.  Online training events are
// sent as fire-and-forget; the Python service persists model weights to disk.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// AmbiguityIntelligenceService computes AMBIGUITY snapshots.
type AmbiguityIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
	mlClient     *mlclient.Client
}

// NewAmbiguityIntelligenceService creates an AmbiguityIntelligenceService.
func NewAmbiguityIntelligenceService(
	ctx context.Context,
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
	mlClient *mlclient.Client,
) *AmbiguityIntelligenceService {
	return &AmbiguityIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
		mlClient:     mlClient,
	}
}

// AmbiguitySnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = AMBIGUITY.
type AmbiguitySnapshot struct {
	// ── Headline numbers ─────────────────────────────────────────────────
	ValueAtRiskMinor        decimal.Decimal `json:"value_at_risk_minor"`       // ambiguous intent exposure; name kept for API compatibility
	AmbiguityRate           float64         `json:"ambiguity_rate"`            // ambiguous / total decisions
	AvgAttachmentConfidence float64         `json:"avg_attachment_confidence"` // running average 0.0–1.0
	ProviderRefMissingRate  float64         `json:"provider_ref_missing_rate"` // fraction with no carriers

	// ── Counts ───────────────────────────────────────────────────────────
	AmbiguousIntentCount      int `json:"ambiguous_intent_count"`
	UnresolvedSettlementCount int `json:"unresolved_settlement_count"`
	ProviderRefMissingCount   int `json:"provider_ref_missing_count"`
	TotalDecisions            int `json:"total_decisions"`

	// ── Money ────────────────────────────────────────────────────────────
	AmbiguousAmountMinor decimal.Decimal `json:"ambiguous_amount_minor"`

	// ── A5: Low-confidence rate ───────────────────────────────────────────
	LowConfidenceCount int     `json:"low_confidence_count"`
	LowConfidenceRate  float64 `json:"low_confidence_rate"` // low_confidence_count / total_decisions

	// ── A6: Candidate collision rate ──────────────────────────────────────
	CandidateCollisionCount int     `json:"candidate_collision_count"`
	CandidateCollisionRate  float64 `json:"candidate_collision_rate"` // collision_count / total_decisions

	// ── A7: Average score margin ──────────────────────────────────────────
	AvgScoreMargin float64 `json:"avg_score_margin"` // avg(WinningScore - RunnerUpScore)

	// ── A8: Carrier completeness rate ────────────────────────────────────
	CarrierCompleteCount    int     `json:"carrier_complete_count"`
	TotalCarrierRecords     int     `json:"total_carrier_records"`
	CarrierCompletenessRate float64 `json:"carrier_completeness_rate"` // complete_count / total_carrier_records

	// ── Risk classification ───────────────────────────────────────────────
	RiskTier string `json:"risk_tier"`

	// ── Weakest cohort (top ambiguity driver) ─────────────────────────────
	WeakestCohortSignal string `json:"weakest_cohort_signal,omitempty"`

	// ── ML: Logistic Regression risk prediction (via Python ml-service) ───
	RiskPredictionScore float64 `json:"risk_prediction_score"`
	RiskPredictionLevel string  `json:"risk_prediction_level"`

	// ── Recommended action ────────────────────────────────────────────────
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// ComputeAndSave reads the current ambiguity projection, builds the snapshot,
// and persists it to intelligence_snapshots.
func (s *AmbiguityIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read latest ambiguity projection
	amb, err := s.projRepo.GetAmbiguitySummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("ambiguity_svc.ComputeAndSave GetAmbiguitySummary tenant=%s: %w", tenantID, err)
	}
	if amb == nil || amb.TotalDecisions == 0 {
		return nil
	}

	// Step 2: build deterministic snapshot
	snap := s.buildSnapshot(amb)

	// Step 3: fire async LR prediction — consumer goroutine returns immediately.
	// Snapshot write, ML features, and ML prediction all complete inside the callback.
	s.mlClient.InvokeLogisticRegressionAsync(ctx, mlclient.LRRequest{
		TenantID:               tenantID,
		AmbiguityRate:          amb.AmbiguityRate,
		ProviderRefMissingRate: amb.ProviderRefMissingRate,
		AvgConfidence:          amb.AvgAttachmentConfidence,
		ValueAtRiskMinor:       amb.AmbiguousAmountMinor.InexactFloat64(),
		TotalIntendedMinor:     0,
	}, func(lrResult mlclient.LRResult, lrErr error) {
		if lrErr != nil {
			log.Printf("ambiguity_svc: InvokeLogisticRegressionAsync failed tenant=%s: %v", tenantID, lrErr)
		}
		snap.RiskPredictionScore = lrResult.Probability
		snap.RiskPredictionLevel = lrResult.Level

		projRefs := []string{"ambiguity.summary"}
		projRefsJSON, _ := json.Marshal(projRefs)
		snapJSON, marshalErr := json.Marshal(snap)
		if marshalErr != nil {
			log.Printf("ambiguity_svc: marshal snap async tenant=%s: %v", tenantID, marshalErr)
			return
		}
		snapID := "snap_" + uuid.New().String()
		modelVer := "logistic_regression_v1"
		if createErr := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
			SnapshotID:         snapID,
			TenantID:           tenantID,
			SnapshotType:       "AMBIGUITY",
			ScopeType:          "TENANT",
			ScopeRef:           nil,
			WindowStart:        windowStart,
			WindowEnd:          windowEnd,
			ProjectionRefsJSON: projRefsJSON,
			SnapshotJSON:       snapJSON,
			ModelVersion:       &modelVer,
			CreatedAt:          time.Now().UTC(),
		}); createErr != nil {
			log.Printf("ambiguity_svc: Create snapshot async tenant=%s: %v", tenantID, createErr)
			return
		}
		if featErr := s.persistMLFeatures(ctx, tenantID, snapID, amb, windowStart, windowEnd); featErr != nil {
			log.Printf("ambiguity_svc: persistMLFeatures async failed tenant=%s: %v", tenantID, featErr)
		}
		features := mlclient.BuildLRFeatures(
			amb.AmbiguityRate,
			amb.ProviderRefMissingRate,
			amb.AvgAttachmentConfidence,
			amb.AmbiguousAmountMinor.InexactFloat64(),
			0,
		)
		s.persistMLPrediction(ctx, tenantID, snapID, features, lrResult.Probability, lrResult.Level)
	})

	return nil
}

func (s *AmbiguityIntelligenceService) buildSnapshot(av *models.AmbiguityValue) AmbiguitySnapshot {
	snap := AmbiguitySnapshot{
		ValueAtRiskMinor:          av.AmbiguousAmountMinor,
		AmbiguityRate:             av.AmbiguityRate,
		AvgAttachmentConfidence:   av.AvgAttachmentConfidence,
		ProviderRefMissingRate:    av.ProviderRefMissingRate,
		AmbiguousIntentCount:      av.AmbiguousIntentCount,
		UnresolvedSettlementCount: av.UnresolvedSettlementCount,
		ProviderRefMissingCount:   av.ProviderRefMissingCount,
		TotalDecisions:            av.TotalDecisions,
		AmbiguousAmountMinor:      av.AmbiguousAmountMinor,
		LowConfidenceCount:        av.LowConfidenceCount,
		LowConfidenceRate:         av.LowConfidenceRate,
		CandidateCollisionCount:   av.CandidateCollisionCount,
		CandidateCollisionRate:    av.CandidateCollisionRate,
		AvgScoreMargin:            av.AvgScoreMargin,
		CarrierCompleteCount:      av.CarrierCompleteCount,
		TotalCarrierRecords:       av.TotalCarrierRecords,
		CarrierCompletenessRate:   av.CarrierCompletenessRate,
		ComputedAt:                time.Now().UTC(),
	}

	snap.RiskTier = ambiguityRiskTier(av.AmbiguityRate, snap.ValueAtRiskMinor)
	snap.WeakestCohortSignal = s.weakestCohortSignal(av)
	snap.RecommendedAction = s.recommendedAction(av)
	return snap
}

// ambiguityRiskTier classifies ambiguity level.
// 10L = 1,000,000 minor units (₹10 lakh).
func ambiguityRiskTier(rate float64, valueAtRisk decimal.Decimal) string {
	switch {
	case rate > 0.10 || valueAtRisk.GreaterThan(decimal.NewFromInt(1_000_000)):
		return "CRITICAL"
	case rate > 0.05 || valueAtRisk.GreaterThan(decimal.NewFromInt(500_000)):
		return "HIGH"
	case rate > 0.02:
		return "MEDIUM"
	case rate > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

func (s *AmbiguityIntelligenceService) weakestCohortSignal(av *models.AmbiguityValue) string {
	if av.ProviderRefMissingRate > 0.15 {
		return fmt.Sprintf(
			"provider_ref_missing_rate=%.1f%% — source system is not supplying UTR/RRN/client_ref",
			av.ProviderRefMissingRate*100,
		)
	}
	if av.AvgAttachmentConfidence < 0.70 {
		return fmt.Sprintf(
			"avg_attachment_confidence=%.2f — settlement files have weak carrier richness",
			av.AvgAttachmentConfidence,
		)
	}
	return ""
}

func (s *AmbiguityIntelligenceService) recommendedAction(av *models.AmbiguityValue) string {
	if av.ProviderRefMissingRate > 0.15 {
		return "REQUEST_SOURCE_PATCH: require client_ref and UTR in all settlement exports"
	}
	if av.AmbiguityRate > 0.10 {
		return "REVIEW_AMBIGUOUS_BATCH: ambiguity rate critically high — manual review required"
	}
	if av.UnresolvedSettlementCount > 20 {
		return "REQUEST_STRONGER_CARRIER_CONTRACT: too many unresolved settlements — renegotiate PSP reference fields"
	}
	return ""
}

// persistMLPrediction writes the Logistic Regression result to ml_predictions.
func (s *AmbiguityIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, snapID string,
	features []float64,
	prob float64,
	level string,
) {
	explanation := map[string]any{
		"algorithm": "logistic_regression_v1",
		"features": map[string]any{
			"ambiguity_rate":            features[0],
			"provider_ref_missing_rate": features[1],
			"low_confidence_proxy":      features[2],
			"value_at_risk_rate":        features[3],
		},
		"probability": prob,
		"risk_level":  level,
	}
	expJSON, _ := json.Marshal(explanation)

	pred := persistence.MLPrediction{
		PredictionID:     "pred_" + uuid.New().String(),
		TenantID:         tenantID,
		ModelID:          "logistic_regression_v1_ambiguity",
		ScopeType:        "TENANT",
		ScopeRef:         tenantID,
		PredictionFamily: "AMBIGUITY",
		PredictionValue:  level,
		PredictionScore:  prob,
		Confidence:       1.0,
		ExplanationJSON:  expJSON,
		SnapshotID:       &snapID,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.predRepo.InsertPrediction(ctx, pred); err != nil {
		log.Printf("ambiguity_svc: InsertPrediction failed tenant=%s: %v", tenantID, err)
	}
}

func (s *AmbiguityIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, snapshotID string,
	av *models.AmbiguityValue,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"ambiguity_rate":              av.AmbiguityRate,
		"avg_attachment_confidence":   av.AvgAttachmentConfidence,
		"provider_ref_missing_rate":   av.ProviderRefMissingRate,
		"value_at_risk_minor":         av.AmbiguousAmountMinor,
		"total_decisions":             av.TotalDecisions,
		"ambiguous_intent_count":      av.AmbiguousIntentCount,
		"unresolved_settlement_count": av.UnresolvedSettlementCount,
		"snapshot_id":                 snapshotID,
	}
	featJSON, err := json.Marshal(features)
	if err != nil {
		return err
	}
	return s.mlRepo.Insert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  "feat_" + uuid.New().String(),
		TenantID:      tenantID,
		ScopeType:     "TENANT",
		ScopeRef:      tenantID,
		FeatureFamily: "AMBIGUITY",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil,
		CreatedAt:     time.Now().UTC(),
	})
}

// ── Training loop ─────────────────────────────────────────────────────────────

// TrainOnLabel is called when a batch reaches a terminal state (FULLY_SETTLED or
// FAILED).  It labels the stored feature row and sends a fire-and-forget training
// event to the Python ml-service, which updates the online LR model in-process.
func (s *AmbiguityIntelligenceService) TrainOnLabel(
	ctx context.Context,
	tenantID, batchID string,
	finalAmbiguityScore float64,
	windowStart, windowEnd time.Time,
) {
	// Step 1: find the most recent unlabeled AMBIGUITY feature row for this tenant.
	rows, err := s.mlRepo.ListUnlabeled(ctx, tenantID, "AMBIGUITY", 1)
	if err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: ListUnlabeled failed tenant=%s: %v", tenantID, err)
		return
	}
	if len(rows) == 0 {
		return
	}
	featRow := rows[0]

	// Step 2: compute binary label.
	labelValue := 0.0
	labelConf := 1.0
	if finalAmbiguityScore > 0.20 {
		labelValue = 1.0
	}
	if finalAmbiguityScore > 0.10 && finalAmbiguityScore <= 0.20 {
		labelConf = 0.7
	}

	// Step 3: stamp the label onto the feature row.
	labelPayload, _ := json.Marshal(map[string]any{
		"label":                 labelValue,
		"final_ambiguity_score": finalAmbiguityScore,
		"batch_id":              batchID,
	})
	if err := s.mlRepo.SetLabel(ctx, featRow.FeatureRowID, labelPayload); err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: SetLabel failed tenant=%s: %v", tenantID, err)
		return
	}

	// Step 4: write an audit row to ml_labels.
	sourceRefs, _ := json.Marshal(map[string]string{"batch_id": batchID})
	featRowID := featRow.FeatureRowID
	if err := s.predRepo.InsertLabel(ctx, persistence.MLLabel{
		LabelID:         "lbl_" + uuid.New().String(),
		TenantID:        tenantID,
		ScopeType:       "TENANT",
		ScopeRef:        tenantID,
		LabelFamily:     "AMBIGUITY",
		LabelValue:      labelValue,
		LabelConfidence: labelConf,
		LabelSource:     "batch_finality",
		SourceRefsJSON:  sourceRefs,
		FeatureRowID:    &featRowID,
		CreatedAt:       time.Now().UTC(),
	}); err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: InsertLabel failed tenant=%s: %v", tenantID, err)
	}

	// Step 5: rebuild the feature vector from stored JSON.
	features := rebuildFeaturesFromJSON(featRow.FeaturesJSON)
	if features == nil {
		log.Printf("ambiguity_svc.TrainOnLabel: could not rebuild features tenant=%s", tenantID)
		return
	}

	// Step 6: fire-and-forget training event — Python ml-service updates the LR model.
	const learningRate = 0.01
	s.mlClient.SendLRTrain(ctx, mlclient.LRTrainRequest{
		TenantID:     tenantID,
		Features:     features,
		Label:        labelValue,
		LearningRate: learningRate,
	})
	log.Printf("ambiguity_svc.TrainOnLabel: train event sent tenant=%s ambiguity_score=%.2f label=%.0f",
		tenantID, finalAmbiguityScore, labelValue)
}

// rebuildFeaturesFromJSON extracts the four LR features from a stored feature row's JSON.
// Uses mlclient.BuildLRFeatures so the computation matches Python's build_features exactly.
func rebuildFeaturesFromJSON(featJSON json.RawMessage) []float64 {
	var m map[string]any
	if err := json.Unmarshal(featJSON, &m); err != nil {
		return nil
	}
	getFloat := func(key string) float64 {
		v, ok := m[key]
		if !ok {
			return 0
		}
		switch val := v.(type) {
		case float64:
			return val
		case json.Number:
			f, _ := val.Float64()
			return f
		}
		return 0
	}
	return mlclient.BuildLRFeatures(
		getFloat("ambiguity_rate"),
		getFloat("provider_ref_missing_rate"),
		getFloat("avg_attachment_confidence"),
		getFloat("value_at_risk_minor"),
		0, // totalIntendedMinor not stored at tenant scope
	)
}
