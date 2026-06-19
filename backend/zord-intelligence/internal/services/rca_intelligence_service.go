package services

// rca_intelligence_service.go
//
// Implements HDBSCAN-based RCA clustering (Grade A).
//
// Entry point: ComputeAndSaveGradeA — called from HandleBatchSummaryUpdated
// after all batch signals are finalised.
//
// Fragment accumulation: as settlement, attachment, variance, intent, and
// evidence events arrive, Accumulate* methods merge signals into a single
// RCAFragment per intent stored in projection_state under:
//   rca.frag.{batch_id}.{intent_id}
//
// At clustering time, all fragments for the batch are retrieved, batch-level
// aggregate signals are denormalised onto each candidate, then the full
// candidate slice is sent to the Python ML service via Kafka.
//
// Two snapshots are written per batch trigger:
//   scope_type=BATCH  scope_ref=batch_id
//   scope_type=TENANT scope_ref=nil  (tenant-level rollup)

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// MLClient is the interface used to invoke the Python RCA clustering service.
// Satisfied by *mlclient.Client; accept an interface so tests can mock it.
type MLClient interface {
	InvokeRCAClustering(ctx context.Context, req mlclient.RCARequest) (mlclient.RCAClusterResult, error)
	InvokeRCAClusteringAsync(ctx context.Context, req mlclient.RCARequest, cb func(mlclient.RCAClusterResult, error))
}

// RCAIntelligenceService handles HDBSCAN-based RCA clustering.
type RCAIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlClient     MLClient // nil → clustering disabled, non-fatal
}

// NewRCAIntelligenceService creates an RCAIntelligenceService.
// mlClient may be nil — if so, ComputeAndSaveGradeA is a no-op.
func NewRCAIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlClient MLClient,
) *RCAIntelligenceService {
	return &RCAIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlClient:     mlClient,
	}
}

// ── Signal value types ────────────────────────────────────────────────────────

// SettlementSignals holds the settlement-observation fields relevant to RCA.
type SettlementSignals struct {
	SourceStrengthClass  string
	ObservationKind      string
	ParseConfidence      float64
	MappingConfidence    float64
	CarrierRichnessScore float64
	ReasonText           string
	IntendedAmountMinor  int64
	SettledAmountMinor   int64
	AmountVarianceMinor  int64
	SettlementDate       time.Time
	IntendedDate         time.Time
	MissingClientRef     bool
	MissingProviderRef   bool
	MissingBankRef       bool
	ReversalFlag         bool
	ReturnFlag           bool
	DuplicateRowDetected bool
	ValueDateMismatch    bool
	CrossPeriodFlag      bool
}

// AttachmentSignals holds the attachment-decision fields relevant to RCA.
type AttachmentSignals struct {
	DecisionType        string
	AmbiguityScore      float64
	ConfidenceScore     float64
	AttachmentReadiness float64
	CandidateCount      int
}

// VarianceSignals holds the variance-record fields relevant to RCA.
type VarianceSignals struct {
	VarianceType        string
	AmountVarianceMinor int64
	ValueDateMismatch   bool
	CrossPeriodFlag     bool
}

// IntentSignals holds the canonical-intent fields from Service 2 relevant to RCA.
type IntentSignals struct {
	GovernanceState       string
	ProofReadinessScore   float64
	MatchabilityScore     float64
	DuplicateRiskFlag     bool
	IdempotencyKeyMissing bool
}

// EvidenceSignals holds the evidence-pack fields from Service 6 relevant to RCA.
type EvidenceSignals struct {
	PackCompletenessScore float64
	MissingLeafCount      int
	EvidencePackMissing   bool
	GovernanceLeafMissing bool
}

// ── Fragment accumulation ─────────────────────────────────────────────────────

func rcaFragKey(batchID, intentID string) string {
	return fmt.Sprintf("rca.frag.%s.%s", batchID, intentID)
}

func rcaFragPrefix(batchID string) string {
	return fmt.Sprintf("rca.frag.%s.", batchID)
}

// AccumulateSettlementFragment merges settlement signals into the RCAFragment
// for this intent.  Non-fatal: errors are logged, never propagated to caller.
func (s *RCAIntelligenceService) AccumulateSettlementFragment(
	ctx context.Context,
	tenantID, batchID, intentID string,
	sig SettlementSignals,
) error {
	key := rcaFragKey(batchID, intentID)
	return s.projRepo.UpsertRCAFragment(ctx, tenantID, key, func(f *models.RCAFragment) {
		f.IntentID = intentID
		f.BatchID = batchID
		f.SourceStrengthClass = sig.SourceStrengthClass
		f.ObservationKind = sig.ObservationKind
		f.ParseConfidence = sig.ParseConfidence
		f.MappingConfidence = sig.MappingConfidence
		f.CarrierRichnessScore = sig.CarrierRichnessScore
		f.IntendedAmountMinor = sig.IntendedAmountMinor
		f.SettledAmountMinor = sig.SettledAmountMinor
		f.AmountVariorMinor = sig.AmountVarianceMinor
		f.MissingClientRef = sig.MissingClientRef
		f.MissingProviderRef = sig.MissingProviderRef
		f.MissingBankRef = sig.MissingBankRef
		f.ReversalFlag = sig.ReversalFlag
		f.ReturnFlag = sig.ReturnFlag
		f.DuplicateRowDetected = sig.DuplicateRowDetected
		f.ValueDateMismatch = sig.ValueDateMismatch
		f.CrossPeriodFlag = sig.CrossPeriodFlag
		if sig.ReasonText != "" {
			f.ReasonText = sig.ReasonText
		}
		if !sig.SettlementDate.IsZero() && !sig.IntendedDate.IsZero() {
			days := int(sig.SettlementDate.Sub(sig.IntendedDate).Hours() / 24)
			if days > 0 {
				f.SettlementDelayDays = days
			}
		}
	})
}

// AccumulateAttachmentFragment merges attachment-decision signals into the fragment.
func (s *RCAIntelligenceService) AccumulateAttachmentFragment(
	ctx context.Context,
	tenantID, batchID, intentID string,
	sig AttachmentSignals,
) error {
	key := rcaFragKey(batchID, intentID)
	return s.projRepo.UpsertRCAFragment(ctx, tenantID, key, func(f *models.RCAFragment) {
		f.IntentID = intentID
		f.BatchID = batchID
		f.DecisionType = sig.DecisionType
		f.AmbiguityScore = sig.AmbiguityScore
		f.ConfidenceScore = sig.ConfidenceScore
		f.AttachmentReadiness = sig.AttachmentReadiness
		f.CandidateCount = sig.CandidateCount
		// Enrich reason_text from decision type if not already set from settlement
		if f.ReasonText == "" && sig.DecisionType != "" {
			f.ReasonText = sig.DecisionType
		}
	})
}

// AccumulateVarianceFragment merges variance-record signals into the fragment.
func (s *RCAIntelligenceService) AccumulateVarianceFragment(
	ctx context.Context,
	tenantID, batchID, intentID string,
	sig VarianceSignals,
) error {
	key := rcaFragKey(batchID, intentID)
	return s.projRepo.UpsertRCAFragment(ctx, tenantID, key, func(f *models.RCAFragment) {
		f.IntentID = intentID
		f.BatchID = batchID
		f.AmountVariorMinor = sig.AmountVarianceMinor
		f.ValueDateMismatch = sig.ValueDateMismatch
		f.CrossPeriodFlag = sig.CrossPeriodFlag
		if f.IntendedAmountMinor > 0 {
			f.AmountVariorMinor = sig.AmountVarianceMinor
		}
		// Append variance type to reason text
		if sig.VarianceType != "" {
			if f.ReasonText != "" {
				f.ReasonText = f.ReasonText + " " + sig.VarianceType
			} else {
				f.ReasonText = sig.VarianceType
			}
		}
	})
}

// AccumulateIntentFragment merges Service 2 intent signals into the fragment.
func (s *RCAIntelligenceService) AccumulateIntentFragment(
	ctx context.Context,
	tenantID, batchID, intentID string,
	sig IntentSignals,
) error {
	key := rcaFragKey(batchID, intentID)
	return s.projRepo.UpsertRCAFragment(ctx, tenantID, key, func(f *models.RCAFragment) {
		f.IntentID = intentID
		f.BatchID = batchID
		f.GovernanceState = sig.GovernanceState
		f.ProofReadinessScore = sig.ProofReadinessScore
		f.MatchabilityScore = sig.MatchabilityScore
		f.DuplicateRiskFlag = sig.DuplicateRiskFlag
		f.IdempotencyKeyMissing = sig.IdempotencyKeyMissing
	})
}

// AccumulateEvidenceFragment merges Service 6 evidence signals into the fragment.
func (s *RCAIntelligenceService) AccumulateEvidenceFragment(
	ctx context.Context,
	tenantID, batchID, intentID string,
	sig EvidenceSignals,
) error {
	key := rcaFragKey(batchID, intentID)
	return s.projRepo.UpsertRCAFragment(ctx, tenantID, key, func(f *models.RCAFragment) {
		f.IntentID = intentID
		f.BatchID = batchID
		f.PackCompletenessScore = sig.PackCompletenessScore
		f.MissingLeafCount = sig.MissingLeafCount
		f.MissingEvidencePack = sig.EvidencePackMissing
		f.GovernanceLeafMissing = sig.GovernanceLeafMissing
	})
}

// ── Clustering ────────────────────────────────────────────────────────────────

// ComputeAndSaveGradeA is the HDBSCAN RCA entry point.
// Called non-fatally from HandleBatchSummaryUpdated after all batch signals are final.
//
// Steps:
//  1. Retrieve all RCAFragments for the batch from projection_state.
//  2. Skip if fewer than 2 candidates (HDBSCAN needs at least 2 points).
//  3. Denormalise batch-level aggregate signals onto each candidate.
//  4. Build mlclient.RCARequest and call InvokeRCAClustering.
//  5. Persist two snapshots: BATCH-scoped and TENANT-scoped.
func (s *RCAIntelligenceService) ComputeAndSaveGradeA(
	ctx context.Context,
	tenantID, batchID, finalityLabel string,
	windowStart, windowEnd time.Time,
) error {
	if s.mlClient == nil {
		return nil
	}

	// Step 1: retrieve fragments
	frags, err := s.projRepo.GetAllByProjectionKeyPrefix(ctx, tenantID, rcaFragPrefix(batchID))
	if err != nil {
		log.Printf("rca_svc.ComputeAndSaveGradeA GetFragments batch=%s: %v", batchID, err)
		return nil // non-fatal
	}
	if len(frags) < 2 {
		log.Printf("rca_svc.ComputeAndSaveGradeA: too few candidates (%d) batch=%s — skipping", len(frags), batchID)
		return nil // defer above handles cleanup
	}

	// Step 2: compute batch-level aggregates for denormalisation
	missingRefCount := 0
	totalMatchability := 0.0
	for _, f := range frags {
		if f.MissingClientRef {
			missingRefCount++
		}
		totalMatchability += f.MatchabilityScore
	}
	n := len(frags)
	missingClientRefRate := float64(missingRefCount) / float64(n)
	avgMatchability := totalMatchability / float64(n)
	weakBatchRef := missingClientRefRate > 0.30 || avgMatchability < 0.50

	// Step 3: build candidates with denormalised batch signals
	candidates := make([]mlclient.RCACandidate, 0, n)
	for _, f := range frags {
		amountVariancePct := 0.0
		if f.IntendedAmountMinor > 0 {
			amountVariancePct = float64(f.AmountVariorMinor) / float64(f.IntendedAmountMinor)
		}
		c := mlclient.RCACandidate{
			IntentID:              f.IntentID,
			ReasonText:            f.ReasonText,
			IntendedAmountMinor:   f.IntendedAmountMinor,
			SourceStrengthClass:   f.SourceStrengthClass,
			ObservationKind:       f.ObservationKind,
			DecisionType:          f.DecisionType,
			GovernanceState:       f.GovernanceState,
			ParseConfidence:       f.ParseConfidence,
			MappingConfidence:     f.MappingConfidence,
			CarrierRichnessScore:  f.CarrierRichnessScore,
			AttachmentReadiness:   f.AttachmentReadiness,
			AmbiguityScore:        f.AmbiguityScore,
			ConfidenceScore:       f.ConfidenceScore,
			AmountVariancePct:     amountVariancePct,
			SettlementDelayDays:   f.SettlementDelayDays,
			ProofReadinessScore:   f.ProofReadinessScore,
			MatchabilityScore:     f.MatchabilityScore,
			PackCompletenessScore: f.PackCompletenessScore,
			CandidateCount:        f.CandidateCount,
			MissingLeafCount:      f.MissingLeafCount,
			WeakBatchRefFlag:      boolToInt(weakBatchRef),
		}
		c.MissingClientRef = boolToInt(f.MissingClientRef)
		c.MissingProviderRef = boolToInt(f.MissingProviderRef)
		c.MissingBankRef = boolToInt(f.MissingBankRef)
		c.ReversalFlag = boolToInt(f.ReversalFlag)
		c.ReturnFlag = boolToInt(f.ReturnFlag)
		c.DuplicateRowDetected = boolToInt(f.DuplicateRowDetected)
		c.ValueDateMismatch = boolToInt(f.ValueDateMismatch)
		c.CrossPeriodFlag = boolToInt(f.CrossPeriodFlag)
		c.DuplicateRiskFlag = boolToInt(f.DuplicateRiskFlag)
		c.MissingEvidencePack = boolToInt(f.MissingEvidencePack)
		c.GovernanceLeafMissing = boolToInt(f.GovernanceLeafMissing)
		c.IdempotencyKeyMissing = boolToInt(f.IdempotencyKeyMissing)
		candidates = append(candidates, c)
	}

	// Step 4: fire async clustering — consumer goroutine returns immediately.
	// All snapshot writes happen inside the callback.
	req := mlclient.RCARequest{
		TenantID:               tenantID,
		BatchID:                batchID,
		Candidates:             candidates,
		FeatureContractVersion: "rca_v1",
		FinalityLabel:          finalityLabel,
	}
	s.mlClient.InvokeRCAClusteringAsync(ctx, req, func(result mlclient.RCAClusterResult, clusterErr error) {
		if clusterErr != nil {
			log.Printf("rca_svc.ComputeAndSaveGradeA InvokeRCAClusteringAsync batch=%s tenant=%s: %v",
				batchID, tenantID, clusterErr)
			return
		}
		if result.TotalPoints == 0 {
			return
		}

		if err := s.saveSnapshot(ctx, tenantID, batchID, "BATCH", &batchID, windowStart, windowEnd, result); err != nil {
			log.Printf("rca_svc.ComputeAndSaveGradeA save BATCH snapshot batch=%s: %v", batchID, err)
		}

		rcaConcentration := computeHerfindahl(result.TopClusters, result.TotalPoints)
		if err := s.projRepo.AtomicUpdateRCAConcentration(
			ctx, tenantID, rcaConcentration, windowStart, windowEnd,
		); err != nil {
			log.Printf("rca_svc.ComputeAndSaveGradeA: AtomicUpdateRCAConcentration batch=%s: %v",
				batchID, err)
		}

		rcaSummary, summaryErr := s.projRepo.GetRCASummary(ctx, tenantID)
		if summaryErr != nil {
			log.Printf("rca_svc.ComputeAndSaveGradeA: GetRCASummary tenant=%s: %v", tenantID, summaryErr)
		}

		if err := s.saveTenantSnapshot(
			ctx, tenantID, batchID, windowStart, windowEnd, result, rcaConcentration, rcaSummary,
		); err != nil {
			log.Printf("rca_svc.ComputeAndSaveGradeA save TENANT snapshot batch=%s: %v", batchID, err)
		}

		log.Printf("rca_svc.ComputeAndSaveGradeA: ok batch=%s candidates=%d clusters=%d noise=%d concentration=%.3f tenant=%s",
			batchID, result.TotalPoints, result.ClusterCount, result.NoisePoints, rcaConcentration, tenantID)
	})
	return nil
}

// computeHerfindahl computes the Herfindahl-Hirschman Index (HHI) over cluster sizes.
// Result is 0–1: 1.0 = one cluster dominates all failures, 0 = perfectly uniform spread.
// This is R8: rca_concentration.
func computeHerfindahl(clusters []mlclient.RCAClusterSummary, total int) float64 {
	if total == 0 || len(clusters) == 0 {
		return 0
	}
	hhi := 0.0
	for _, c := range clusters {
		share := float64(c.Size) / float64(total)
		hhi += share * share
	}
	if hhi > 1.0 {
		hhi = 1.0
	}
	return hhi
}

// saveTenantSnapshot persists the TENANT-scoped RCA snapshot enriched with
// R4/R5/R6/R8 quality metrics from the rca.summary projection.
func (s *RCAIntelligenceService) saveTenantSnapshot(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
	result mlclient.RCAClusterResult,
	rcaConcentration float64,
	summary *models.RCASummaryValue,
) error {
	tenantSnap := map[string]interface{}{
		"cluster_result":    result,
		"rca_concentration": rcaConcentration,
		"computed_at":       time.Now().UTC(),
	}
	if summary != nil {
		tenantSnap["parser_weakness_rate"] = summary.ParserWeaknessRate
		tenantSnap["mapping_weakness_rate"] = summary.MappingWeaknessRate
		tenantSnap["source_system_defect_rate"] = summary.SourceSystemDefectRate
		tenantSnap["source_system_defects"] = summary.SourceSystemDefects
		tenantSnap["weak_parse_count"] = summary.WeakParseCount
		tenantSnap["weak_mapping_count"] = summary.WeakMappingCount
		tenantSnap["total_settlements"] = summary.TotalSettlements
	}
	snapJSON, err := json.Marshal(tenantSnap)
	if err != nil {
		return fmt.Errorf("marshal tenant snapshot: %w", err)
	}
	projRefs := []string{rcaFragPrefix(batchID), "rca.summary"}
	projRefsJSON, _ := json.Marshal(projRefs)
	modelVer := "rca_hdbscan_v1"
	snapID := "snap_rca_" + uuid.New().String()
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "RCA_CLUSTER",
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

func (s *RCAIntelligenceService) saveSnapshot(
	ctx context.Context,
	tenantID, batchID, scopeType string,
	scopeRef *string,
	windowStart, windowEnd time.Time,
	result mlclient.RCAClusterResult,
) error {
	snapJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	projRefs := []string{rcaFragPrefix(batchID)}
	projRefsJSON, _ := json.Marshal(projRefs)
	modelVer := result.FeatureContractVersion
	if modelVer == "" {
		modelVer = "rca_hdbscan_v1"
	}
	snapID := "snap_rca_" + uuid.New().String()
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "RCA_CLUSTER",
		ScopeType:          scopeType,
		ScopeRef:           scopeRef,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	})
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
