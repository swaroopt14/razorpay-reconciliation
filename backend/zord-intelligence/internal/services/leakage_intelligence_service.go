package services

// leakage_intelligence_service.go
//
// Implements spec Section 10.1 — Leakage & Value-at-Risk Intelligence.
//
// WHAT THIS SERVICE DOES:
// Consumes attachment decisions and variance records (already atomically
// recorded into projection_state by Phase 3 repo methods), then produces
// a materialised LEAKAGE intelligence snapshot in intelligence_snapshots.
//
// A snapshot captures the complete leakage picture for a tenant+window:
//   - total money at risk
//   - breakdown by type (unmatched, under-settlement, orphan, reversal)
//   - top leakage drivers
//   - leakage percentage of total intended volume
//
// DESIGN:
//   deterministic-first — all numbers come from atomic projection_state counters.
//   No ML required for the core calculation.
//   Snapshots are written once per significant event, not on every Kafka message.

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

// LeakageIntelligenceService computes LEAKAGE snapshots from projection_state data.
type LeakageIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
	mlClient     *mlclient.Client
	batchRepo    *persistence.BatchContractRepo
}

// NewLeakageIntelligenceService creates a LeakageIntelligenceService.
func NewLeakageIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
	mlClient *mlclient.Client,
	batchRepo *persistence.BatchContractRepo,
) *LeakageIntelligenceService {
	return &LeakageIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
		mlClient:     mlClient,
		batchRepo:    batchRepo,
	}
}

// LeakageSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = LEAKAGE.
//
// Fields map directly to spec Section 10.1 outputs:
//   "total leakage amount"
//   "leakage percentage of total intended volume"
//   "breakdown by type"
//   "top leakage drivers"
type LeakageSnapshot struct {
	// ── Headline numbers ─────────────────────────────────────────────────
	TotalAmountMinor         decimal.Decimal `json:"total_amount_minor"`
	LeakagePercentage        float64         `json:"leakage_percentage"`
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"`

	// ── Breakdown by type (all in minor units) ────────────────────────────
	UnmatchedAmountMinor       decimal.Decimal `json:"unmatched_amount_minor"`
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"`
	OrphanAmountMinor          decimal.Decimal `json:"orphan_amount_minor"`
	ReversalExposureMinor      decimal.Decimal `json:"reversal_exposure_minor"`

	// ── Event counts ─────────────────────────────────────────────────────
	UnmatchedIntentCount  int `json:"unmatched_intent_count"`
	UnderSettlementCount  int `json:"under_settlement_count"`
	OrphanSettlementCount int `json:"orphan_settlement_count"`
	ReversalCount         int `json:"reversal_count"`

	// ── Per-type breakdown map ────────────────────────────────────────────
	// Key: variance type string. Value: cumulative minor-unit amount.
	BreakdownByType map[string]decimal.Decimal `json:"breakdown_by_type"`

	// ── L2: Total observed settled volume ────────────────────────────────
	// Accumulated from CanonicalSettlementCreatedEvent for ALL settlements.
	TotalObservedSettledAmountMinor decimal.Decimal `json:"total_observed_settled_amount_minor"`

	// ── P7 numerator: value-date mismatch count ────────────────────────────
	ValueDateMismatchCount int `json:"value_date_mismatch_count"`

	// ── L7: Duplicate settlement risk (intent-level risk flag) ──────────────
	DuplicateRiskCount         int             `json:"duplicate_risk_count"`
	DuplicateRiskExposureMinor decimal.Decimal `json:"duplicate_risk_exposure_minor"`

	// ── L7b: Confirmed duplicates (MATCH_DUPLICATE decisions) ────────────────
	ConfirmedDuplicateCount         int             `json:"confirmed_duplicate_count"`
	ConfirmedDuplicateExposureMinor decimal.Decimal `json:"confirmed_duplicate_exposure_minor"`

	// ── Top leakage drivers (deterministic ranking) ───────────────────────
	// Sorted by amount desc. Used by the recommendation layer.
	TopDrivers []LeakageDriver `json:"top_drivers"`

	// ── Risk tier ─────────────────────────────────────────────────────────
	// Derived from leakage_percentage using fixed thresholds (spec §10.1).
	RiskTier string `json:"risk_tier"` // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "CLEAN"

	// ── ML: Z-score anomaly detection ─────────────────────────────────────
	// Is today's leakage unusually high compared to the historical baseline?
	// AnomalyScore: 0.0 (normal) → 1.0 (extreme anomaly)
	// AnomalyLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INSUFFICIENT_DATA"
	// AnomalyZScore: raw z-value (how many stddevs above the mean)
	//
	// These complement the deterministic RiskTier: RiskTier says "you are leaking 5%
	// of volume", AnomalyLevel says "5% is 3 stddevs above YOUR normal — unusual for you."
	AnomalyScore  float64 `json:"anomaly_score"`
	AnomalyLevel  string  `json:"anomaly_level"`
	AnomalyZScore float64 `json:"anomaly_z_score"`

	// ── Recommended action ────────────────────────────────────────────────
	// Human-readable suggestion fed to the Recommendation intelligence layer.
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// LeakageDriver is one entry in LeakageSnapshot.TopDrivers.
type LeakageDriver struct {
	DriverType  string          `json:"driver_type"` // e.g. "UNMATCHED_INTENT"
	AmountMinor decimal.Decimal `json:"amount_minor"`
	Count       int             `json:"count"`
	SharePct    float64         `json:"share_pct"` // this driver's share of total_amount_minor
}

// ComputeAndSave reads the current leakage projection for a tenant, computes
// the full intelligence snapshot, and persists it to intelligence_snapshots.
//
// Also persists LEAKAGE ML features to ml_feature_store for future forecasting.
//
// Called by HandleAttachmentDecision and HandleVarianceRecord in projection_service.go
// after every leakage-relevant event. The snapshot is a point-in-time view
// of the running projection_state counters.
//
// IDEMPOTENCY: We always write a NEW snapshot (new snapshot_id) rather than
// updating an existing one. Snapshots are immutable write-once records.
// The intelligence_snapshots table stores history; dashboards query latest.
func (s *LeakageIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read the latest leakage projection
	leakage, err := s.projRepo.GetLeakageSummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("leakage_svc.ComputeAndSave GetLeakageSummary tenant=%s: %w", tenantID, err)
	}
	if leakage == nil {
		return nil
	}
	leakage = s.applyBatchFallback(ctx, tenantID, windowStart, windowEnd, leakage)

	// Step 2: build the deterministic snapshot from projection data
	snap := s.buildSnapshot(leakage)

	// Step 3: read Z-score history synchronously (fast DB call, not ML)
	history, histErr := s.mlRepo.GetRecentFloatField(ctx, tenantID, "LEAKAGE", "leakage_percentage", 30)
	if histErr != nil {
		log.Printf("leakage_svc: GetRecentFloatField failed tenant=%s: %v", tenantID, histErr)
		history = nil
	}

	// Step 4: fire async Z-score — consumer goroutine returns immediately.
	// Snapshot write, ML features, and ML prediction all complete inside the callback.
	s.mlClient.InvokeZScoreAsync(ctx, mlclient.ZScoreRequest{
		TenantID:     tenantID,
		CurrentValue: leakage.LeakagePercentage,
		History:      history,
	}, func(result mlclient.ZScoreResult, zsErr error) {
		if zsErr != nil {
			log.Printf("leakage_svc: InvokeZScoreAsync failed tenant=%s: %v", tenantID, zsErr)
		}
		snap.AnomalyScore = result.Score
		snap.AnomalyLevel = result.Level
		snap.AnomalyZScore = result.ZScore

		projRefs := []string{"leakage.total"}
		projRefsJSON, _ := json.Marshal(projRefs)
		snapJSON, marshalErr := json.Marshal(snap)
		if marshalErr != nil {
			log.Printf("leakage_svc: marshal snap async tenant=%s: %v", tenantID, marshalErr)
			return
		}
		snapID := "snap_" + uuid.New().String()
		modelVer := "zscore_v1"
		if createErr := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
			SnapshotID:         snapID,
			TenantID:           tenantID,
			SnapshotType:       "LEAKAGE",
			ScopeType:          "TENANT",
			ScopeRef:           nil,
			WindowStart:        windowStart,
			WindowEnd:          windowEnd,
			ProjectionRefsJSON: projRefsJSON,
			SnapshotJSON:       snapJSON,
			ModelVersion:       &modelVer,
			CreatedAt:          time.Now().UTC(),
		}); createErr != nil {
			log.Printf("leakage_svc: Create snapshot async tenant=%s: %v", tenantID, createErr)
			return
		}
		if featErr := s.persistMLFeatures(ctx, tenantID, snapID, leakage, windowStart, windowEnd); featErr != nil {
			log.Printf("leakage_svc: persistMLFeatures async failed tenant=%s snap=%s: %v",
				tenantID, snapID, featErr)
		}
		s.persistMLPrediction(ctx, tenantID, snapID, snap)
	})

	return nil
}

func (s *LeakageIntelligenceService) applyBatchFallback(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
	leakage *models.LeakageValue,
) *models.LeakageValue {
	if s == nil || s.batchRepo == nil || leakage == nil {
		return leakage
	}
	if leakage.TotalIntendedAmountMinor.IsPositive() &&
		(leakage.UnmatchedAmountMinor.IsPositive() ||
			leakage.UnderSettlementAmountMinor.IsPositive() ||
			leakage.ReversalExposureMinor.IsPositive() ||
			leakage.OrphanAmountMinor.IsPositive()) {
		return leakage
	}

	summary, err := s.batchRepo.SummarizeLeakageForWindow(ctx, tenantID, windowStart, windowEnd)
	if err != nil || summary == nil {
		if err != nil {
			log.Printf("leakage_svc: batch fallback failed tenant=%s: %v", tenantID, err)
		}
		return leakage
	}
	if !summary.TotalIntendedAmountMinor.IsPositive() {
		return leakage
	}

	enriched := *leakage
	enriched.TotalIntendedAmountMinor = summary.TotalIntendedAmountMinor
	if summary.UnmatchedAmountMinor.IsPositive() || enriched.UnmatchedAmountMinor.IsZero() {
		enriched.UnmatchedAmountMinor = summary.UnmatchedAmountMinor
	}
	if summary.UnderSettlementAmountMinor.IsPositive() || enriched.UnderSettlementAmountMinor.IsZero() {
		enriched.UnderSettlementAmountMinor = summary.UnderSettlementAmountMinor
	}
	if summary.OrphanAmountMinor.IsPositive() || enriched.OrphanAmountMinor.IsZero() {
		enriched.OrphanAmountMinor = summary.OrphanAmountMinor
	}
	if summary.ReversalExposureMinor.IsPositive() || enriched.ReversalExposureMinor.IsZero() {
		enriched.ReversalExposureMinor = summary.ReversalExposureMinor
	}
	if enriched.TotalObservedSettledAmountMinor.LessThanOrEqual(decimal.Zero) && summary.TotalObservedSettledAmountMinor.IsPositive() {
		enriched.TotalObservedSettledAmountMinor = summary.TotalObservedSettledAmountMinor
	}
	enriched.TotalAmountMinor = enriched.UnmatchedAmountMinor.
		Add(enriched.UnderSettlementAmountMinor).
		Add(enriched.OrphanAmountMinor).
		Add(enriched.ReversalExposureMinor)
	if enriched.TotalIntendedAmountMinor.IsPositive() {
		enriched.LeakagePercentage = enriched.UnmatchedAmountMinor.
			Add(enriched.UnderSettlementAmountMinor).
			Add(enriched.ReversalExposureMinor).
			Div(enriched.TotalIntendedAmountMinor).
			InexactFloat64()
	}
	if enriched.BreakdownByType == nil {
		enriched.BreakdownByType = map[string]decimal.Decimal{}
	}
	enriched.BreakdownByType["UNMATCHED_INTENT"] = enriched.UnmatchedAmountMinor
	enriched.BreakdownByType["UNDER_SETTLEMENT"] = enriched.UnderSettlementAmountMinor
	enriched.BreakdownByType["ORPHAN_SETTLEMENT"] = enriched.OrphanAmountMinor
	enriched.BreakdownByType["REVERSAL"] = enriched.ReversalExposureMinor
	return &enriched
}

// buildSnapshot converts a LeakageValue projection into a full LeakageSnapshot.
func (s *LeakageIntelligenceService) buildSnapshot(lv *models.LeakageValue) LeakageSnapshot {
	snap := LeakageSnapshot{
		TotalAmountMinor:                lv.TotalAmountMinor,
		LeakagePercentage:               lv.LeakagePercentage,
		TotalIntendedAmountMinor:        lv.TotalIntendedAmountMinor,
		TotalObservedSettledAmountMinor: lv.TotalObservedSettledAmountMinor,
		ValueDateMismatchCount:          lv.ValueDateMismatchCount,
		DuplicateRiskCount:              lv.DuplicateRiskCount,
		DuplicateRiskExposureMinor:      lv.DuplicateRiskExposureMinor,
		ConfirmedDuplicateCount:         lv.ConfirmedDuplicateCount,
		ConfirmedDuplicateExposureMinor: lv.ConfirmedDuplicateExposureMinor,
		UnmatchedAmountMinor:            lv.UnmatchedAmountMinor,
		UnderSettlementAmountMinor:      lv.UnderSettlementAmountMinor,
		OrphanAmountMinor:               lv.OrphanAmountMinor,
		ReversalExposureMinor:           lv.ReversalExposureMinor,
		UnmatchedIntentCount:            lv.UnmatchedIntentCount,
		UnderSettlementCount:            lv.UnderSettlementCount,
		OrphanSettlementCount:           lv.OrphanSettlementCount,
		ReversalCount:                   lv.ReversalCount,
		BreakdownByType:                 lv.BreakdownByType,
		ComputedAt:                      time.Now().UTC(),
	}

	// Build top drivers list (sorted by amount desc, top 5)
	snap.TopDrivers = s.buildTopDrivers(lv)

	// Assign risk tier using the fixed thresholds from spec Section 10.1
	snap.RiskTier = leakageRiskTier(lv.LeakagePercentage)

	// Generate a recommended action based on the dominant leakage type
	snap.RecommendedAction = s.recommendedAction(lv)

	return snap
}

// buildTopDrivers creates a ranked list of leakage drivers sorted by amount.
func (s *LeakageIntelligenceService) buildTopDrivers(lv *models.LeakageValue) []LeakageDriver {
	type driverEntry struct {
		driverType  string
		amountMinor decimal.Decimal
		count       int
	}

	candidates := []driverEntry{
		{"UNMATCHED_INTENT", lv.UnmatchedAmountMinor, lv.UnmatchedIntentCount},
		{"UNDER_SETTLEMENT", lv.UnderSettlementAmountMinor, lv.UnderSettlementCount},
		{"ORPHAN_SETTLEMENT", lv.OrphanAmountMinor, lv.OrphanSettlementCount},
		{"REVERSAL", lv.ReversalExposureMinor, lv.ReversalCount},
		{"DUPLICATE_RISK", lv.DuplicateRiskExposureMinor, lv.DuplicateRiskCount},
	}

	// Sort descending by amount (simple insertion sort — 4 elements max)
	for i := 1; i < len(candidates); i++ {
		for j := i; j > 0 && candidates[j].amountMinor.GreaterThan(candidates[j-1].amountMinor); j-- {
			candidates[j], candidates[j-1] = candidates[j-1], candidates[j]
		}
	}

	var drivers []LeakageDriver
	for _, c := range candidates {
		if c.amountMinor.IsZero() {
			continue // skip zero-amount drivers
		}
		sharePct := 0.0
		if lv.TotalAmountMinor.IsPositive() {
			sharePct = c.amountMinor.Div(lv.TotalAmountMinor).InexactFloat64()
		}
		drivers = append(drivers, LeakageDriver{
			DriverType:  c.driverType,
			AmountMinor: c.amountMinor,
			Count:       c.count,
			SharePct:    sharePct,
		})
	}
	return drivers
}

// leakageRiskTier classifies a leakage percentage into a risk tier.
// Thresholds derived from spec Section 10.1 and standard fintech reconciliation SLAs.
//
//	CRITICAL: > 5% of intended volume is leaking
//	HIGH:     > 2.5%
//	MEDIUM:   > 1%
//	LOW:      > 0%
//	CLEAN:    0 — no leakage detected
func leakageRiskTier(pct float64) string {
	switch {
	case pct > 0.05:
		return "CRITICAL"
	case pct > 0.025:
		return "HIGH"
	case pct > 0.01:
		return "MEDIUM"
	case pct > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

// recommendedAction returns the most important recommended action based on the
// dominant leakage type. Feeds into the Recommendation intelligence layer.
func (s *LeakageIntelligenceService) recommendedAction(lv *models.LeakageValue) string {
	// Pick the dominant leakage type by amount
	max := decimal.Zero
	dominant := ""
	buckets := map[string]decimal.Decimal{
		"UNMATCHED_INTENT":  lv.UnmatchedAmountMinor,
		"UNDER_SETTLEMENT":  lv.UnderSettlementAmountMinor,
		"ORPHAN_SETTLEMENT": lv.OrphanAmountMinor,
		"REVERSAL":          lv.ReversalExposureMinor,
	}
	for k, v := range buckets {
		if v.GreaterThan(max) {
			max = v
			dominant = k
		}
	}

	switch dominant {
	case "UNMATCHED_INTENT":
		return "REQUEST_SOURCE_PATCH: intents are not appearing in settlement files — fix carrier fields in source system"
	case "UNDER_SETTLEMENT":
		return "OPEN_OPS_INCIDENT: PSP is settling less than intended — review deduction agreements"
	case "ORPHAN_SETTLEMENT":
		return "REVIEW_AMBIGUOUS_BATCH: settlements arriving without matching intents — check batch ingestion pipeline"
	case "REVERSAL":
		return "ESCALATE: reversals after success detected — finance review required immediately"
	default:
		return ""
	}
}

// persistMLPrediction writes the Z-score result to ml_predictions for audit trail.
func (s *LeakageIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, snapID string,
	snap LeakageSnapshot,
) {
	explanation := map[string]any{
		"algorithm":     "zscore_v1",
		"z_score":       snap.AnomalyZScore,
		"anomaly_level": snap.AnomalyLevel,
		"leakage_pct":   snap.LeakagePercentage,
	}
	expJSON, _ := json.Marshal(explanation)

	pred := persistence.MLPrediction{
		PredictionID:     "pred_" + uuid.New().String(),
		TenantID:         tenantID,
		ModelID:          "zscore_v1_leakage",
		ScopeType:        "TENANT",
		ScopeRef:         tenantID,
		PredictionFamily: "LEAKAGE",
		PredictionValue:  snap.AnomalyLevel,
		PredictionScore:  snap.AnomalyScore,
		Confidence:       1.0,
		ExplanationJSON:  expJSON,
		SnapshotID:       &snapID,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.predRepo.InsertPrediction(ctx, pred); err != nil {
		log.Printf("leakage_svc: InsertPrediction failed tenant=%s: %v", tenantID, err)
	}
}

// persistMLFeatures writes a LEAKAGE feature vector to ml_feature_store.
// Features are captured here so Phase 8 ML engines have training data from day 1.
func (s *LeakageIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, snapshotID string,
	lv *models.LeakageValue,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"total_amount_minor":          lv.TotalAmountMinor,
		"leakage_percentage":          lv.LeakagePercentage,
		"unmatched_intent_count":      lv.UnmatchedIntentCount,
		"under_settlement_count":      lv.UnderSettlementCount,
		"orphan_settlement_count":     lv.OrphanSettlementCount,
		"reversal_count":              lv.ReversalCount,
		"total_intended_amount_minor": lv.TotalIntendedAmountMinor,
		"snapshot_id":                 snapshotID, // link feature to snapshot for auditability
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
		FeatureFamily: "LEAKAGE",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil, // label attached later when leakage is resolved
		CreatedAt:     time.Now().UTC(),
	})
}
