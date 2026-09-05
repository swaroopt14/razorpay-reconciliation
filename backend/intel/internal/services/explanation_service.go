package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ExplanationService handles generation of deterministic and (in Phase 8) LLM-based explanations
// for intelligence snapshots, as well as standalone batch risk explanations.
type ExplanationService struct {
	explRepo  *persistence.IntelligenceExplanationRepo
	snapRepo  *persistence.IntelligenceSnapshotRepo
	batchRepo *persistence.BatchContractRepo
}

// NewExplanationService creates a new ExplanationService.
func NewExplanationService(
	explRepo *persistence.IntelligenceExplanationRepo,
	snapRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
) *ExplanationService {
	return &ExplanationService{
		explRepo:  explRepo,
		snapRepo:  snapRepo,
		batchRepo: batchRepo,
	}
}

// GetOrGenerateExplanation retrieves an existing explanation for a snapshot, or generates
// a new deterministic text explanation if one doesn't exist, and stores it.
func (s *ExplanationService) GetOrGenerateExplanation(ctx context.Context, snapshotID string) (*models.IntelligenceExplanation, error) {
	// 1. Check if explanation already exists
	existing, err := s.explRepo.GetBySnapshotID(ctx, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("ExplanationService.GetOrGenerateExplanation DB error: %w", err)
	}
	if existing != nil {
		return existing, nil
	}

	// 2. Fetch the snapshot to generate an explanation
	snap, err := s.snapRepo.GetByID(ctx, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("ExplanationService failed to fetch snapshot: %w", err)
	}
	if snap == nil {
		return nil, fmt.Errorf("ExplanationService snapshot not found: %s", snapshotID)
	}

	// 3. Generate deterministic text based on snapshot type
	explType := s.mapSnapshotTypeToExplType(snap.SnapshotType)
	explText := s.generateDeterministicText(snap)

	refsJSON := `["` + snap.SnapshotID + `"]`

	newExpl := models.IntelligenceExplanation{
		ExplanationID:   "expl_" + uuid.NewString(),
		TenantID:        snap.TenantID,
		SnapshotID:      snap.SnapshotID,
		ExplanationType: explType,
		InputRefsJSON:   refsJSON,
		ExplanationText: explText,
		ModelVersion:    "deterministic_v1",
		CreatedAt:       time.Now().UTC(),
	}

	// 4. Persist
	if err := s.explRepo.Insert(ctx, newExpl); err != nil {
		return nil, fmt.Errorf("ExplanationService failed to insert new explanation: %w", err)
	}

	return &newExpl, nil
}

// ExplainBatch generates a risk explanation for a specific batch. 
// It attaches the explanation to the latest PATTERN snapshot for the tenant.
func (s *ExplanationService) ExplainBatch(ctx context.Context, tenantID, batchID string) (*models.IntelligenceExplanation, error) {
	batch, err := s.batchRepo.GetByID(ctx, batchID)
	if err != nil {
		return nil, fmt.Errorf("ExplanationService failed to get batch: %w", err)
	}
	if batch == nil || batch.TenantID != tenantID {
		return nil, fmt.Errorf("batch not found or unauthorized")
	}

	// We need a snapshot to attach this explanation to. We use the latest PATTERN snapshot.
	snap, err := s.snapRepo.GetLatestByType(ctx, tenantID, "PATTERN", "BATCH", nil)
	if err != nil {
		return nil, fmt.Errorf("ExplanationService failed to get PATTERN snapshot: %w", err)
	}
	
	// Format deterministic risk string
	text := fmt.Sprintf("Batch %s Analysis:\n\nTotal Confirmed: %d\nVariance: %d\nAmbiguity Score: %.2f\n\n",
		batch.BatchID, batch.TotalConfirmedAmountMinor, batch.TotalVarianceMinor, s.safeFloat(batch.AmbiguityScore))

	if batch.AmbiguityScore != nil && *batch.AmbiguityScore > 0.70 {
		text += "Risk Factor: High Ambiguity detected. Operations team should review attachment links.\n"
	}
	if batch.ReversedCount > 0 {
		text += fmt.Sprintf("Risk Factor: Contains %d reversed paths indicating upstream corridor failure.\n", batch.ReversedCount)
	}
	if batch.BatchFinalityStatus == "REQUIRES_REVIEW" {
		text += "Status: This batch requires manual review due to policy threshold breaches.\n"
	}

	if snap == nil {
		// Fix for Issue 2: Return error instead of ephemeral object missing persistence constraint mapping.
		return nil, fmt.Errorf("ExplainBatch requires a PATTERN snapshot but none exists")
	}

	newExpl := models.IntelligenceExplanation{
		ExplanationID:   "expl_" + uuid.NewString(),
		TenantID:        tenantID, // Fix for Issue 8: explicit tenant mapping
		SnapshotID:      snap.SnapshotID,
		ExplanationType: models.ExplanationTypeBatchRisk,
		InputRefsJSON:   `["batch_` + batch.BatchID + `"]`,
		ExplanationText: text,
		ModelVersion:    "deterministic_v1",
		CreatedAt:       time.Now().UTC(),
	}

	if err := s.explRepo.Insert(ctx, newExpl); err != nil {
		return nil, fmt.Errorf("ExplanationService failed to insert batch explanation: %w", err)
	}

	return &newExpl, nil
}

func (s *ExplanationService) safeFloat(v *float64) float64 {
	if v == nil {
		return 0.0
	}
	return *v
}

func (s *ExplanationService) mapSnapshotTypeToExplType(snapshotType string) models.ExplanationType {
	switch snapshotType {
	case "RCA":
		return models.ExplanationTypeRCASummary
	case "LEAKAGE":
		return models.ExplanationTypeLeakageNarrative
	case "AMBIGUITY":
		return models.ExplanationTypeAmbiguitySummary
	case "DEFENSIBILITY":
		return models.ExplanationTypeDefensibilityReport
	case "RECOMMENDATION":
		return models.ExplanationTypeActionJustification
	default:
		return models.ExplanationType("GENERIC_SUMMARY")
	}
}

func (s *ExplanationService) generateDeterministicText(snap *persistence.IntelligenceSnapshot) string {
	// For Phase 7, we parse the SnapshotJSON to provide deterministic templates.
	// In Phase 8, this will be passed to an LLM.
	
	// Just unmarshal as generic map to pull top level insights
	var data map[string]interface{}
	if err := json.Unmarshal(snap.SnapshotJSON, &data); err != nil {
		return "Snapshot data could not be parsed for insight generation."
	}

	switch snap.SnapshotType {
	case "LEAKAGE":
		riskTier, _ := data["risk_tier"].(string)
		pct, _ := data["leakage_percentage"].(float64)
		return fmt.Sprintf("Leakage is evaluated at a %s risk tier, representing %.2f%% of total volume. Primary vectors indicate unmatched and under-settlement. Action recommended.", riskTier, pct*100)
		
	case "AMBIGUITY":
		ambiguityRate, _ := data["ambiguity_rate"].(float64)
		return fmt.Sprintf("Ambiguity rate sits at %.2f%%. A high incidence of missing provider refs has been observed. Review pending attachments.", ambiguityRate*100)
		
	case "DEFENSIBILITY":
		tier, _ := data["defensibility_tier"].(string)
		return fmt.Sprintf("Defensibility posture is currently %s. Governance and replayability coverages are driving this tier.", tier)
		
	case "RCA":
		return "Root Cause Analysis highlights multiple failed path clusters. The system suggests investigating cross-border routing delays as the highest cardinality contributor."
		
	default:
		return "Deterministic insight generated based on baseline snapshot statistics."
	}
}
