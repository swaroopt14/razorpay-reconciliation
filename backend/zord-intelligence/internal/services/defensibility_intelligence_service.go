package services

// defensibility_intelligence_service.go
//
// Implements spec Section 10.3 — Evidence & Defensibility Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the defensibility.summary projection (maintained by
// AtomicRecordGovernanceCoverage and AtomicIncrementDefensibilityIntent)
// and produces a materialised DEFENSIBILITY snapshot.
//
// KEY PRINCIPLE: Defensibility is kept DETERMINISTIC.
// The spec says: "This should stay mostly deterministic because defensibility
// is too important to hide behind model opacity."
//
// SCORING RUBRIC (spec §10.3):
//   pack exists?                  +20
//   governance decision present?  +15
//   attachment decision present?  +15  (tracked via ambiguity projection)
//   replay equivalence?           +10
//   KYC checked?                  +10  (part of +10 governance check)
//   AML checked?                  +10
//   supporting carriers OK?       +10  (derived from ambiguity — low missing rate)
//   Total possible:               65   (we use audit_ready_pct as proxy)
//
// TIER assignment (from score):
//   STRONG:   >= 55.25
//   GOOD:     >= 45.5
//   WEAK:     >= 32.5
//   FRAGILE:  < 32.5

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DefensibilityIntelligenceService computes DEFENSIBILITY snapshots.
type DefensibilityIntelligenceService struct {
	projRepo      *persistence.ProjectionRepo
	snapshotRepo  *persistence.IntelligenceSnapshotRepo
	batchRepo     *persistence.BatchContractRepo
}

// NewDefensibilityIntelligenceService creates a DefensibilityIntelligenceService.
func NewDefensibilityIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
) *DefensibilityIntelligenceService {
	return &DefensibilityIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		batchRepo:    batchRepo,
	}
}

// DefensibilitySnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = DEFENSIBILITY.
type DefensibilitySnapshot struct {
	// ── Headline rates ────────────────────────────────────────────────────
	AuditReadyPct        float64 `json:"audit_ready_pct"`        // spec: "audit-ready percentage"
	DisputeReadyPct      float64 `json:"dispute_ready_pct"`      // spec: "dispute-ready percentage"
	GovernanceCoveragePct float64 `json:"governance_coverage_pct"` // what % have governance decisions
	EvidencePackRate     float64 `json:"evidence_pack_rate"`     // what % have evidence packs
	ReplayabilityPct     float64 `json:"replayability_pct"`      // what % are replay-equivalent

	// ── Counts ───────────────────────────────────────────────────────────
	TotalIntents            int `json:"total_intents"`
	WithEvidencePack        int `json:"with_evidence_pack"`
	WithGovernanceDecision  int `json:"with_governance_decision"`
	WithReplayEquivalence   int `json:"with_replay_equivalence"`
	WithKYCChecked          int `json:"with_kyc_checked"`
	WithAMLChecked          int `json:"with_aml_checked"`

	// ── Governance outcome breakdown ─────────────────────────────────────
	GovernanceApprovedCount  int `json:"governance_approved_count"`
	GovernanceRejectedCount  int `json:"governance_rejected_count"`  // compliance risk flag
	GovernanceEscalatedCount int `json:"governance_escalated_count"`

	// ── D2: Average evidence pack completeness score ─────────────────────────
	AvgPackCompletenessScore float64 `json:"avg_pack_completeness_score"`

	// ── D4: Settlement evidence coverage ─────────────────────────────────────
	SettlementEvidenceCoverage float64 `json:"settlement_evidence_coverage"`

	// ── D5: Attachment evidence coverage ─────────────────────────────────────
	AttachmentEvidenceCoverage float64 `json:"attachment_evidence_coverage"`

	// ── Cross-layer Proof Readiness components (sourced from ambiguity projection) ──
	MatchReliabilityScore      float64 `json:"match_reliability_score"`      // ambiguity.DecisionSuccessRate
	ReferenceCompletenessScore float64 `json:"reference_completeness_score"` // 1 - ambiguity.ProviderRefMissingRate

	// ── D7: Weak evidence rate ────────────────────────────────────────────────
	WeakEvidenceCount int     `json:"weak_evidence_count"`
	WeakEvidenceRate  float64 `json:"weak_evidence_rate"`

	// ── Composite defensibility score (0–65) ────────────────────────────
	// Computed from the rubric in spec §10.3.
	DefensibilityScore float64 `json:"defensibility_score"`

	// ── Tier ─────────────────────────────────────────────────────────────
	DefensibilityTier string `json:"defensibility_tier"` // STRONG | GOOD | WEAK | FRAGILE

	// ── Weakest cohort ────────────────────────────────────────────────────
	WeakestProofRef string `json:"weakest_proof_ref,omitempty"`

	// ── Compliance alerts ─────────────────────────────────────────────────
	// Non-empty when governance_rejected > 0 or compliance risk is high.
	ComplianceAlert string `json:"compliance_alert,omitempty"`

	// ── Recommended action ────────────────────────────────────────────────
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// ComputeAndSave builds a DEFENSIBILITY snapshot and persists it.
//
// Called after every GovernanceDecisionCreatedEvent and EvidencePackReadyEvent.
// Also updates defensibility_tier on the batch_contracts row when a batchID
// is supplied (i.e. when the governance decision is batch-scoped).
func (s *DefensibilityIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	batchID string, // empty when event is not batch-scoped
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read current defensibility projection
	def, err := s.projRepo.GetDefensibilitySummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave GetDefensibilitySummary tenant=%s: %w",
			tenantID, err)
	}
	if def == nil || def.TotalIntents == 0 {
		return nil
	}

	// Step 1b: read ambiguity projection for cross-layer Proof Readiness components.
	// Non-fatal — if ambiguity data is not yet available the three components default to 0.
	amb, _ := s.projRepo.GetAmbiguitySummary(ctx, tenantID)

	// Step 1c: read pattern.tenant_summary for proof_readiness_score (dispute_ready_pct component 4).
	// Non-fatal — defaults to 0 until the first batch summary event arrives.
	pat, _ := s.projRepo.GetPatternTenantSummary(ctx, tenantID)

	// Step 2: build snapshot
	snap := s.buildSnapshot(def, amb, pat)

	// Step 3: persist snapshot
	projRefs := []string{"defensibility.summary", "ambiguity.summary"}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "deterministic_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "DEFENSIBILITY",
		ScopeType:          "TENANT",
		ScopeRef:           nil,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave Create snapshot tenant=%s: %w",
			tenantID, err)
	}

	// Step 3b: write dispute_ready_pct back to the projection so the policy engine
	// (policy_service.go) can read it without querying intelligence_snapshots.
	if err := s.projRepo.AtomicUpdateDefensibilityDisputeReady(
		ctx, tenantID, snap.DisputeReadyPct, windowStart,
	); err != nil {
		// Non-fatal — snapshot already written; policy engine uses stale value until next event.
		log.Printf("defensibility_svc: AtomicUpdateDefensibilityDisputeReady tenant=%s: %v", tenantID, err)
	}

	// Step 4: if batch-scoped, update the defensibility_tier on batch_contracts
	// This lets GET /v1/intelligence/batches/{id} return the correct tier
	// without needing to join intelligence_snapshots.
	if batchID != "" {
		if err := s.batchRepo.SetDefensibilityTier(ctx, batchID, snap.DefensibilityTier); err != nil {
			// Non-fatal — the snapshot was already written
			return fmt.Errorf("defensibility_svc: SetDefensibilityTier batch=%s: %w", batchID, err)
		}
	}

	return nil
}

// buildSnapshot converts a DefensibilityValue projection into a full snapshot.
// amb may be nil if the ambiguity projection is not yet populated.
// pat may be nil if the pattern.tenant_summary projection is not yet populated.
func (s *DefensibilityIntelligenceService) buildSnapshot(dv *models.DefensibilityValue, amb *models.AmbiguityValue, pat *models.PatternTenantSummaryValue) DefensibilitySnapshot {
	snap := DefensibilitySnapshot{
		AuditReadyPct:            dv.AuditReadyPct,
		DisputeReadyPct:          computeDisputeReadyPct(dv, pat),
		GovernanceCoveragePct:    dv.GovernanceCoveragePct,
		EvidencePackRate:         dv.EvidencePackRate,
		ReplayabilityPct:         dv.ReplayabilityPct,
		TotalIntents:             dv.TotalIntents,
		WithEvidencePack:         dv.WithEvidencePack,
		WithGovernanceDecision:   dv.WithGovernanceDecision,
		WithReplayEquivalence:    dv.WithReplayEquivalence,
		WithKYCChecked:           dv.WithKYCChecked,
		WithAMLChecked:           dv.WithAMLChecked,
		GovernanceApprovedCount:    dv.GovernanceApprovedCount,
		GovernanceRejectedCount:    dv.GovernanceRejectedCount,
		GovernanceEscalatedCount:   dv.GovernanceEscalatedCount,
		WeakestProofRef:            dv.WeakestProofRef,
		AvgPackCompletenessScore:   dv.AvgPackCompletenessScore,
		SettlementEvidenceCoverage: dv.SettlementEvidenceCoverage,
		AttachmentEvidenceCoverage: dv.AttachmentEvidenceCoverage,
		WeakEvidenceCount:          dv.WeakEvidenceCount,
		WeakEvidenceRate:           dv.WeakEvidenceRate,
		ComputedAt:                 time.Now().UTC(),
	}

	// Store cross-layer components for transparency in the snapshot
	if amb != nil {
		snap.MatchReliabilityScore = amb.DecisionSuccessRate
		snap.ReferenceCompletenessScore = 1.0 - amb.ProviderRefMissingRate
		if snap.ReferenceCompletenessScore < 0 {
			snap.ReferenceCompletenessScore = 0
		}
	}

	// Compute Proof Readiness Score (total = 65 points)
	snap.DefensibilityScore = s.computeScore(dv, amb)
	snap.DefensibilityTier = defensibilityTier(snap.DefensibilityScore)
	snap.RecommendedAction = s.recommendedAction(dv)

	if dv.GovernanceRejectedCount > 0 {
		snap.ComplianceAlert = fmt.Sprintf(
			"%d governance decisions were REJECTED — compliance review required",
			dv.GovernanceRejectedCount,
		)
	}

	return snap
}

// computeDisputeReadyPct computes the new dispute pack readiness score (0–1).
//
// Formula: (avg_intent_quality + avg_mapping_confidence + avg_pack_completeness + proof_readiness) / 4
//
//   - avg_intent_quality:    running avg of IntentQualityScore from IntentCreatedEvent
//   - avg_mapping_confidence: running avg of MappingConfidence from CanonicalSettlementCreatedEvent
//   - avg_pack_completeness:  running avg of PackCompletenessScore from EvidencePackReadyEvent (D2)
//   - proof_readiness:        last batch ProofReadinessScore from pattern.tenant_summary
//
// pat may be nil when no batch summary has arrived yet; proof_readiness defaults to 0.
func computeDisputeReadyPct(dv *models.DefensibilityValue, pat *models.PatternTenantSummaryValue) float64 {
	proofReadiness := 0.0
	if pat != nil {
		proofReadiness = pat.ProofReadinessScore
	}
	pct := (dv.AvgIntentQualityScore + dv.AvgMappingConfidence + dv.AvgPackCompletenessScore + proofReadiness) / 4.0
	if pct > 1.0 {
		pct = 1.0
	}
	if pct < 0 {
		pct = 0
	}
	return pct
}

// computeScore computes the Proof Readiness Score.
// Returns a score 0–65.
//
// FORMULA (7 components):
//
//	0.20 × evidence_pack_coverage      — do complete evidence packs exist?
//	0.15 × governance_coverage         — what % of intents have governance decisions?
//	0.20 × match_reliability_score     — how reliable are attachment decisions? (ambiguity layer)
//	0.15 × reference_completeness      — are carrier/provider references present? (ambiguity layer)
//	0.15 × settlement_evidence_coverage — what % of packs include a settlement leaf?
//	0.10 × replay_equivalence_rate     — are packs replay-equivalent?
//	0.05 × (1 - ambiguity_rate)        — how free of ambiguous decisions is this tenant?
//
// amb may be nil (ambiguity projection not yet available); affected components default to 0.
func (s *DefensibilityIntelligenceService) computeScore(dv *models.DefensibilityValue, amb *models.AmbiguityValue) float64 {
	if dv.TotalIntents == 0 {
		return 0
	}
	n := float64(dv.TotalIntents)

	// Component 1 (weight 0.20): evidence_pack_coverage
	// Use AvgPackCompletenessScore (D2) when available; fall back to pack presence rate.
	var evidencePackCoverage float64
	if dv.AvgPackCompletenessScore > 0 {
		evidencePackCoverage = dv.AvgPackCompletenessScore
	} else {
		evidencePackCoverage = float64(dv.WithEvidencePack) / n
	}
	if evidencePackCoverage > 1.0 {
		evidencePackCoverage = 1.0
	}

	// Component 2 (weight 0.15): governance_coverage
	govCoverage := float64(dv.WithGovernanceDecision) / n

	// Component 3 (weight 0.20): match_reliability_score
	// DecisionSuccessRate from the ambiguity projection: fraction of attachment
	// decisions that are unambiguous, non-colliding, and settled at the intended amount.
	var matchReliability float64
	if amb != nil {
		matchReliability = amb.DecisionSuccessRate
	}

	// Component 4 (weight 0.15): reference_completeness_score
	// 1 - ProviderRefMissingRate: how complete are carrier/provider references?
	var refCompleteness float64
	if amb != nil {
		refCompleteness = 1.0 - amb.ProviderRefMissingRate
		if refCompleteness < 0 {
			refCompleteness = 0
		}
	}

	// Component 5 (weight 0.15): settlement_evidence_coverage (D4)
	// Falls back to replay-equivalence proxy when D4 not yet accumulated.
	var settlementEvidence float64
	if dv.SettlementEvidenceCoverage > 0 {
		settlementEvidence = dv.SettlementEvidenceCoverage
	} else {
		settlementEvidence = float64(dv.WithReplayEquivalence) / n
	}

	// Component 6 (weight 0.10): replay_equivalence_rate (D6)
	replayRate := float64(dv.WithReplayEquivalence) / n

	// Component 7 (weight 0.05): (1 - ambiguity_rate)
	lowAmbiguity := 1.0
	if amb != nil {
		lowAmbiguity = 1.0 - amb.AmbiguityRate
		if lowAmbiguity < 0 {
			lowAmbiguity = 0
		}
	}

	score := (0.20*evidencePackCoverage +
		0.15*govCoverage +
		0.20*matchReliability +
		0.15*refCompleteness +
		0.15*settlementEvidence +
		0.10*replayRate +
		0.05*lowAmbiguity) * 65

	if score > 65 {
		score = 65
	}
	return score
}

// defensibilityTier maps a 0–65 score to a tier.
func defensibilityTier(score float64) string {
	switch {
	case score >= 55.25:
		return "STRONG"
	case score >= 45.5:
		return "GOOD"
	case score >= 32.5:
		return "WEAK"
	default:
		return "FRAGILE"
	}
}

func (s *DefensibilityIntelligenceService) recommendedAction(dv *models.DefensibilityValue) string {
	if dv.TotalIntents == 0 {
		return ""
	}
	// If fewer than 70% of intents have governance coverage, regenerate evidence
	if dv.GovernanceCoveragePct < 0.70 {
		return "REGENERATE_EVIDENCE: governance decision coverage below 70% — rebuild evidence packs"
	}
	// If fewer than 80% have evidence packs, escalate
	if dv.EvidencePackRate < 0.80 {
		return "ESCALATE: evidence pack rate below 80% — audit-readiness at risk"
	}
	if dv.GovernanceRejectedCount > 0 {
		return "ESCALATE: governance rejections detected — compliance team review required"
	}
	return ""
}
