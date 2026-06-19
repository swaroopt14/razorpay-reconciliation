package services

// recommendation_intelligence_service.go
//
// Implements spec Section 10.6 — Recommendation Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the latest snapshots from the other five intelligence layers
// (LEAKAGE, AMBIGUITY, DEFENSIBILITY, RCA, PATTERN) and synthesises them
// into a single RECOMMENDATION snapshot with ranked, actionable next steps.
//
// This is the "brain" of Service 7 — it translates intelligence into actions.
//
// KEY PRINCIPLE (spec §10.6):
//   "The underlying recommendation logic should still be rooted in deterministic
//   or explainable upstream signals."
//   LLM can help with presentation (Phase 7), but logic is deterministic here.
//
// RECOMMENDATION CARDS:
// Each card has:
//   - priority:        CRITICAL | HIGH | MEDIUM | LOW
//   - action:          the Decision constant (e.g. "REQUEST_SOURCE_PATCH")
//   - title:           short human-readable description
//   - reason:          what triggered this recommendation (links to source snapshot)
//   - source:          which intelligence layer flagged this
//   - amount_at_stake_minor: the financial impact (0 if not money-related)
//   - priority_score:  ML doc rule-based score 0.0–1.0
//
// PRIORITY SCORE FORMULA (ML doc §8.4):
//   priority_score = (impact × confidence × urgency × recurrence × actionability) / effort
//
//   urgency:       CRITICAL=1.0, HIGH=0.8, MEDIUM=0.5, LOW=0.2
//   impact:        0.30 base + clamp(amount_at_stake / 5_000_000, 0, 0.70)
//   confidence:    0.85 — deterministic signals carry high certainty
//   recurrence:    0.70 — intelligence issues recur without intervention
//   actionability: 0.90 — every ZPI action maps to a concrete next step
//   effort:        1.0  — normalisation denominator (Phase 7 will calibrate per action)
//
// Within each priority tier, cards are sorted by priority_score descending
// so the most impactful action in each tier rises to the top.

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// RecommendationIntelligenceService synthesises all other intelligence layers
// into ranked, actionable recommendation cards.
type RecommendationIntelligenceService struct {
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewRecommendationIntelligenceService creates a RecommendationIntelligenceService.
func NewRecommendationIntelligenceService(
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
) *RecommendationIntelligenceService {
	return &RecommendationIntelligenceService{snapshotRepo: snapshotRepo}
}

// RecommendationSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = RECOMMENDATION.
type RecommendationSnapshot struct {
	// Ranked list of recommendation cards (sorted by priority then priority_score)
	Cards []RecommendationCard `json:"cards"`

	// Summary counts by priority
	CriticalCount int `json:"critical_count"`
	HighCount     int `json:"high_count"`
	MediumCount   int `json:"medium_count"`
	LowCount      int `json:"low_count"`

	// Total amount at stake across all CRITICAL + HIGH recommendations
	TotalAmountAtStakeMinor decimal.Decimal `json:"total_amount_at_stake_minor"`

	// Rec1: recommendation_priority_score — highest priority_score across all cards
	// Summarises the urgency of the most critical outstanding recommendation (0.0–1.0).
	RecommendationPriorityScore float64 `json:"recommendation_priority_score"`

	// Rec2: recommendation_impact_estimate — total financial exposure of CRITICAL+HIGH cards
	// Gives the finance team a single headline figure for all high-priority open actions.
	RecommendationImpactEstimateMinor decimal.Decimal `json:"recommendation_impact_estimate_minor"`

	// Source snapshot IDs used to build this recommendation set
	SourceSnapshotIDs []string `json:"source_snapshot_ids"`

	ComputedAt time.Time `json:"computed_at"`
}

// RecommendationCard is one actionable recommendation.
type RecommendationCard struct {
	CardID             string          `json:"card_id"`            // "rec_" + uuid — stable ID for UI dedup
	Priority           string          `json:"priority"`           // CRITICAL | HIGH | MEDIUM | LOW
	Action             string          `json:"action"`             // Decision constant
	Title              string          `json:"title"`              // short title for UI card
	Reason             string          `json:"reason"`             // what triggered this
	SourceLayer        string          `json:"source_layer"`       // LEAKAGE | AMBIGUITY | DEFENSIBILITY | RCA | PATTERN
	SourceSnapshotID   string          `json:"source_snapshot_id"` // which snapshot this came from
	AmountAtStakeMinor decimal.Decimal `json:"amount_at_stake_minor,omitempty"`
	PriorityScore      float64         `json:"priority_score"` // rule-based 0.0–1.0 score (ML doc §8.4)

	// ── Pattern Intelligence enrichments ────────────────────────────────────
	// These fields provide attribution and expected improvement for pattern-driven cards.
	// They are omitted on legacy cards produced from the non-pattern intelligence layers.
	AffectedSourceSystem string `json:"affected_source_system,omitempty"` // which source system triggered this
	AffectedProviderID   string `json:"affected_provider_id,omitempty"`   // which PSP/bank triggered this
	AffectedBatchCount   int    `json:"affected_batch_count,omitempty"`   // how many batches are affected
	ExpectedImprovement  string `json:"expected_improvement,omitempty"`   // e.g. "Reduce ambiguous attachments by ~45-60%"
	ActionOwner          string `json:"action_owner,omitempty"`           // e.g. "Finance / Source System Owner"
	// Confidence: how certain is this recommendation, based on how much data backs it.
	// HIGH = 100+ data points, MEDIUM = 20–99, LOW = <20.
	// This is the human-readable confidence level required by the spec (section 3).
	Confidence string `json:"confidence,omitempty"` // HIGH | MEDIUM | LOW
}

// computePriorityScore implements the ML doc §8.4 rule-based priority formula:
//
//	priority_score = (impact × confidence × urgency × recurrence × actionability) / effort
//
// Returns a value in [0.0, 1.0] rounded to 3 decimal places.
func (s *RecommendationIntelligenceService) computePriorityScore(
	priority string,
	amountAtStakeMinor decimal.Decimal,
) float64 {
	urgencyMap := map[string]float64{
		"CRITICAL": 1.0,
		"HIGH":     0.8,
		"MEDIUM":   0.5,
		"LOW":      0.2,
	}
	urgency, ok := urgencyMap[priority]
	if !ok {
		urgency = 0.2
	}

	// impact: base 0.30 + financial exposure contribution (scales to 1.0 at ₹50L)
	impact := 0.30 + math.Min(amountAtStakeMinor.InexactFloat64()/5_000_000.0, 0.70)

	const (
		confidence    = 0.85 // deterministic signals have well-known accuracy
		recurrence    = 0.70 // intelligence issues typically persist until fixed
		actionability = 0.90 // every ZPI card maps to a concrete remediation step
		effort        = 1.0  // normalisation denominator; Phase 7 will calibrate
	)

	score := (impact * confidence * urgency * recurrence * actionability) / effort
	if score > 1.0 {
		score = 1.0
	}
	return math.Round(score*1000) / 1000
}

// confidenceFromDataPoints converts a data point count to a human-readable
// confidence level (spec section 3). More data = higher confidence.
//   >= 100 → HIGH   (statistically robust — multiple batches over time)
//   >= 20  → MEDIUM (enough to see a pattern, may change with more data)
//   <  20  → LOW    (early signal — monitor but don't act without more evidence)
func confidenceFromDataPoints(n int) string {
	switch {
	case n >= 100:
		return "HIGH"
	case n >= 20:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// ComputeAndSave reads the latest snapshots from each intelligence layer
// and produces a RECOMMENDATION snapshot.
//
// Called by HandleAttachmentDecision, HandleVarianceRecord, HandleGovernanceDecision,
// and HandleBatchSummaryUpdated — i.e. after any event that could change the
// intelligence landscape.
//
// IMPORTANT: We only read the LATEST snapshot per layer. If no snapshot exists
// for a layer yet (e.g. no failures → no RCA snapshot), that layer is skipped.
// This is correct: we never generate phantom recommendations from missing data.
func (s *RecommendationIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	var cards []RecommendationCard
	var sourceIDs []string

	// ── Read LEAKAGE snapshot ──────────────────────────────────────────────
	leakageSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "LEAKAGE", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read LEAKAGE snap: %w", err)
	}
	if leakageSnap != nil {
		sourceIDs = append(sourceIDs, leakageSnap.SnapshotID)
		cards = append(cards, s.cardsFromLeakage(leakageSnap)...)
	}

	// ── Read AMBIGUITY snapshot ────────────────────────────────────────────
	ambSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "AMBIGUITY", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read AMBIGUITY snap: %w", err)
	}
	if ambSnap != nil {
		sourceIDs = append(sourceIDs, ambSnap.SnapshotID)
		cards = append(cards, s.cardsFromAmbiguity(ambSnap)...)
	}

	// ── Read DEFENSIBILITY snapshot ───────────────────────────────────────
	defSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "DEFENSIBILITY", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read DEFENSIBILITY snap: %w", err)
	}
	if defSnap != nil {
		sourceIDs = append(sourceIDs, defSnap.SnapshotID)
		cards = append(cards, s.cardsFromDefensibility(defSnap)...)
	}

	// ── Read RCA_CLUSTER snapshot (HDBSCAN) ──────────────────────────────
	rcaSnap, err := s.snapshotRepo.GetLatestByTypeAnyScope(ctx, tenantID, "RCA_CLUSTER", "TENANT")
	if err == nil && rcaSnap != nil {
		sourceIDs = append(sourceIDs, rcaSnap.SnapshotID)
		if card := s.cardFromRCA(rcaSnap); card != nil {
			cards = append(cards, *card)
		}
	}

	// ── Read PATTERN snapshot (BATCH scope — existing batch risk cards) ──────
	patternSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "PATTERN", "BATCH", nil)
	if err == nil && patternSnap != nil {
		sourceIDs = append(sourceIDs, patternSnap.SnapshotID)
		if card := s.cardFromPattern(patternSnap); card != nil {
			cards = append(cards, *card)
		}
	}

	// ── Read PATTERN snapshot (TENANT scope — multi-dimensional pattern cards) ─
	// The TENANT-scoped pattern snapshot carries source quality, provider quality,
	// ambiguity by source, variance patterns, manual review, evidence, and timing.
	tenantPatternSnap, tenantPatternErr := s.snapshotRepo.GetLatestByType(ctx, tenantID, "PATTERN", "TENANT", nil)
	if tenantPatternErr == nil && tenantPatternSnap != nil {
		sourceIDs = append(sourceIDs, tenantPatternSnap.SnapshotID)
		cards = append(cards, s.cardsFromTenantPattern(tenantPatternSnap)...)
	}

	// If no cards at all, still write an empty recommendation snapshot
	// so the API has something to return (empty is better than 404).

	// Sort cards: CRITICAL first, then HIGH, MEDIUM, LOW;
	// within the same tier, sort by priority_score descending so the
	// highest-impact action in each tier rises to the top.
	priorityOrder := map[string]int{"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
	sort.Slice(cards, func(i, j int) bool {
		pi := priorityOrder[cards[i].Priority]
		pj := priorityOrder[cards[j].Priority]
		if pi != pj {
			return pi < pj
		}
		return cards[i].PriorityScore > cards[j].PriorityScore
	})

	// Build summary
	snap := RecommendationSnapshot{
		Cards:             cards,
		SourceSnapshotIDs: sourceIDs,
		ComputedAt:        time.Now().UTC(),
	}
	for _, c := range cards {
		switch c.Priority {
		case "CRITICAL":
			snap.CriticalCount++
			snap.TotalAmountAtStakeMinor = snap.TotalAmountAtStakeMinor.Add(c.AmountAtStakeMinor)
			snap.RecommendationImpactEstimateMinor = snap.RecommendationImpactEstimateMinor.Add(c.AmountAtStakeMinor)
		case "HIGH":
			snap.HighCount++
			snap.TotalAmountAtStakeMinor = snap.TotalAmountAtStakeMinor.Add(c.AmountAtStakeMinor)
			snap.RecommendationImpactEstimateMinor = snap.RecommendationImpactEstimateMinor.Add(c.AmountAtStakeMinor)
		case "MEDIUM":
			snap.MediumCount++
		case "LOW":
			snap.LowCount++
		}
		// Rec1: track the highest priority_score across all cards
		if c.PriorityScore > snap.RecommendationPriorityScore {
			snap.RecommendationPriorityScore = c.PriorityScore
		}
	}

	// Persist
	projRefsJSON, _ := json.Marshal(sourceIDs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("recommendation_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "rule_based_v1"
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "RECOMMENDATION",
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

// cardsFromLeakage extracts recommendation cards from a LEAKAGE snapshot.
func (s *RecommendationIntelligenceService) cardsFromLeakage(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var lsnap LeakageSnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &lsnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	// CRITICAL: leakage above 5%
	if lsnap.LeakagePercentage > 0.05 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "CRITICAL",
			Action:             "ESCALATE",
			Title:              fmt.Sprintf("%.1f%% of intended volume is leaking", lsnap.LeakagePercentage*100),
			Reason:             fmt.Sprintf("Total leakage: ₹%s minor units across %d unmatched intents", lsnap.TotalAmountMinor, lsnap.UnmatchedIntentCount),
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.TotalAmountMinor,
			PriorityScore:      s.computePriorityScore("CRITICAL", lsnap.TotalAmountMinor),
		})
	}

	// HIGH: unmatched intents > 10
	if lsnap.UnmatchedIntentCount > 10 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "REQUEST_SOURCE_PATCH",
			Title:              fmt.Sprintf("%d intents have no settlement match", lsnap.UnmatchedIntentCount),
			Reason:             "Source system is not producing settlement references — fix carrier fields",
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.UnmatchedAmountMinor,
			PriorityScore:      s.computePriorityScore("HIGH", lsnap.UnmatchedAmountMinor),
		})
	}

	// HIGH: reversals
	if lsnap.ReversalCount > 0 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "ESCALATE",
			Title:              fmt.Sprintf("%d reversals detected after successful settlement", lsnap.ReversalCount),
			Reason:             "Reversals indicate PSP clawback or manual recall — finance review required",
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.ReversalExposureMinor,
			PriorityScore:      s.computePriorityScore("HIGH", lsnap.ReversalExposureMinor),
		})
	}

	// Prepare-and-sign recommendation when leakage is HIGH
	if lsnap.LeakagePercentage > 0.025 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "MEDIUM",
			Action:           "PREPARE_AND_SIGN_RECOMMENDED",
			Title:            "Consider Zord prepare-and-sign mode to reduce future leakage",
			Reason:           fmt.Sprintf("Leakage rate %.1f%% exceeds 2.5%% — prepare-and-sign would improve traceability", lsnap.LeakagePercentage*100),
			SourceLayer:      "LEAKAGE",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("MEDIUM", decimal.Zero),
		})
	}

	return cards
}

// cardFromRCA extracts a recommendation card from an RCA_CLUSTER (HDBSCAN) snapshot.
// Uses the highest-severity cluster as the primary card signal.
// Handles both the old flat format (mlclient.RCAClusterResult) and the new enriched
// TENANT format that wraps the cluster result under the "cluster_result" key.
func (s *RecommendationIntelligenceService) cardFromRCA(
	snap *persistence.IntelligenceSnapshot,
) *RecommendationCard {
	result, err := mlclient.UnmarshalRCAClusterResult(snap.SnapshotJSON)
	if err != nil {
		return nil
	}

	// Find the first public, non-empty cluster to surface.
	var top *mlclient.RCAClusterSummary
	for i := range result.TopClusters {
		c := &result.TopClusters[i]
		if !c.InternalOnly && c.Size > 0 {
			top = c
			break
		}
	}
	if top == nil {
		return nil
	}

	priority := top.Severity
	if priority == "" {
		priority = "HIGH"
	}

	return &RecommendationCard{
		CardID:           "rec_" + uuid.New().String(),
		Priority:         priority,
		Action:           top.DefaultActionContract,
		Title:            fmt.Sprintf("RCA Cluster: %s (%s)", top.ClusterCode, top.ClusterLabel),
		Reason:           top.RecommendedAction,
		SourceLayer:      "RCA",
		SourceSnapshotID: snap.SnapshotID,
		PriorityScore:    s.computePriorityScore(priority, decimal.NewFromInt(top.AffectedAmountMinor)),
	}
}

// cardFromPattern extracts a recommendation card from a PATTERN snapshot.
func (s *RecommendationIntelligenceService) cardFromPattern(
	snap *persistence.IntelligenceSnapshot,
) *RecommendationCard {
	var psnap PatternSnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &psnap); err != nil {
		return nil
	}

	if !psnap.PrepareAndSignRecommended {
		return nil
	}

	return &RecommendationCard{
		CardID:             "rec_" + uuid.New().String(),
		Priority:           "MEDIUM",
		Action:             "PREPARE_AND_SIGN_RECOMMENDED",
		Title:              "Batch Quality Risk Detected",
		Reason:             psnap.RecommendedAction,
		SourceLayer:        "PATTERN",
		SourceSnapshotID:   snap.SnapshotID,
		AmountAtStakeMinor: psnap.TotalVarianceMinor,
		PriorityScore:      s.computePriorityScore("MEDIUM", psnap.TotalVarianceMinor),
	}
}

// cardsFromAmbiguity extracts recommendation cards from an AMBIGUITY snapshot.
func (s *RecommendationIntelligenceService) cardsFromAmbiguity(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var asnap AmbiguitySnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &asnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	if asnap.AmbiguityRate > 0.10 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "CRITICAL",
			Action:             "REVIEW_AMBIGUOUS_BATCH",
			Title:              fmt.Sprintf("%.1f%% of attachment decisions are ambiguous", asnap.AmbiguityRate*100),
			Reason:             asnap.WeakestCohortSignal,
			SourceLayer:        "AMBIGUITY",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: asnap.ValueAtRiskMinor,
			PriorityScore:      s.computePriorityScore("CRITICAL", asnap.ValueAtRiskMinor),
		})
	} else if asnap.AmbiguityRate > 0.05 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "REQUEST_SOURCE_PATCH",
			Title:              fmt.Sprintf("%.1f%% ambiguity rate — source data quality needs improvement", asnap.AmbiguityRate*100),
			Reason:             asnap.WeakestCohortSignal,
			SourceLayer:        "AMBIGUITY",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: asnap.ValueAtRiskMinor,
			PriorityScore:      s.computePriorityScore("HIGH", asnap.ValueAtRiskMinor),
		})
	}

	if asnap.ProviderRefMissingRate > 0.15 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "HIGH",
			Action:           "REQUEST_STRONGER_CARRIER_CONTRACT",
			Title:            fmt.Sprintf("%.1f%% of decisions have no carrier references", asnap.ProviderRefMissingRate*100),
			Reason:           "PSP is not returning UTR/RRN — renegotiate contract to require reference fields",
			SourceLayer:      "AMBIGUITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("HIGH", decimal.Zero),
		})
	}

	return cards
}

// ── PATTERN INTELLIGENCE RECOMMENDATION CARDS ────────────────────────────────
//
// cardsFromTenantPattern is the main dispatcher for all pattern-intelligence-driven
// recommendation cards. It reads the enriched TENANT-scoped PatternSnapshot and
// calls individual card builders for each of the 10 recommendation types.
//
// Card builders are deterministic: they fire only when a threshold is crossed.
// Each threshold is chosen to avoid noise — only persistent, impactful patterns
// produce cards. Thresholds are documented inline.
func (s *RecommendationIntelligenceService) cardsFromTenantPattern(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var psnap PatternSnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &psnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	// Recommendation 1: Fix Source File / Schema
	cards = append(cards, s.buildFixSourceFileRecs(&psnap, snap.SnapshotID)...)

	// Recommendation 2: Add Stronger Payment References
	cards = append(cards, s.buildStrengthenReferencesRecs(&psnap, snap.SnapshotID)...)

	// Recommendation 3: Move Flow to Prepare-and-Sign
	cards = append(cards, s.buildPrepareAndSignRecs(&psnap, snap.SnapshotID)...)

	// Recommendation 4: Review Duplicate-Risk Cluster
	if card := s.buildDuplicateRiskReviewRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation 5: Update Variance / Deduction Policy
	if card := s.buildUpdateVariancePolicyRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation 6: Generate / Regenerate Evidence Pack
	if card := s.buildRegenerateEvidenceRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation 8: Change Expected SLA Window
	if card := s.buildSLAWindowAdjustRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation 9: Escalate Specific Source System
	if card := s.buildEscalateSourceRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation 10: Move to Dispatch / Control Mode
	if card := s.buildMoveToControlModeRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	// Recommendation #4 from spec §9: Reprocess with corrected mapping profile
	cards = append(cards, s.buildRemappingRecs(&psnap, snap.SnapshotID)...)

	// Recommendation #5 from spec §9: Backfill settlement/bank data (from Pattern layer)
	if card := s.buildBackfillFromPatternRec(&psnap, snap.SnapshotID); card != nil {
		cards = append(cards, *card)
	}

	return cards
}

// buildFixSourceFileRecs fires when a source system has a high manual review rate
// or high schema mismatch rate. One card per offending source system (max 3).
//
// Trigger thresholds (from spec §4, recommendation type 1):
//   manual_review_rate > 0.10  OR  missing_client_ref_rate > 0.20
func (s *RecommendationIntelligenceService) buildFixSourceFileRecs(
	psnap *PatternSnapshot,
	snapID string,
) []RecommendationCard {
	var cards []RecommendationCard
	count := 0
	for _, src := range psnap.SourceQualityPatterns {
		if count >= 3 {
			break
		}
		if src.ManualReviewRate <= 0.10 && src.MissingClientRefRate <= 0.20 {
			continue
		}

		priority := "HIGH"
		if src.ManualReviewRate > 0.30 || src.MissingClientRefRate > 0.40 {
			priority = "CRITICAL"
		}

		title := fmt.Sprintf("Fix source export for %s — %.1f%% manual review rate",
			src.SourceSystem, src.ManualReviewRate*100)
		reason := fmt.Sprintf(
			"Source system %s has manual_review_rate=%.1f%% and missing_client_payout_ref_rate=%.1f%% over the current window (%d intents). Primary reason codes are driving reconciliation overhead.",
			src.SourceSystem, src.ManualReviewRate*100, src.MissingClientRefRate*100, src.TotalIntentCount)

		cards = append(cards, RecommendationCard{
			CardID:               "rec_" + uuid.New().String(),
			Priority:             priority,
			Action:               "REQUEST_SOURCE_PATCH",
			Title:                title,
			Reason:               reason,
			SourceLayer:          "PATTERN",
			SourceSnapshotID:     snapID,
			AmountAtStakeMinor:   src.ManualReviewAmount,
			PriorityScore:        s.computePriorityScore(priority, src.ManualReviewAmount),
			AffectedSourceSystem: src.SourceSystem,
			AffectedBatchCount:   src.BatchCount,
			Confidence:           confidenceFromDataPoints(src.TotalIntentCount),
			ExpectedImprovement:  "Reduce manual review rate by estimated 60–80% for this source after schema fix",
			ActionOwner:          "Source System Owner / Finance",
		})
		count++
	}
	return cards
}

// buildStrengthenReferencesRecs fires when missing_client_ref_rate or
// ambiguity collision_rate is high for a source system.
//
// Trigger: missing_client_ref_rate > 0.15 OR collision_rate > 0.20
func (s *RecommendationIntelligenceService) buildStrengthenReferencesRecs(
	psnap *PatternSnapshot,
	snapID string,
) []RecommendationCard {
	var cards []RecommendationCard
	count := 0
	for _, src := range psnap.AmbiguityBySource {
		if count >= 2 {
			break
		}
		// Also check source quality for missing ref
		missingRefRate := 0.0
		for _, sq := range psnap.SourceQualityPatterns {
			if sq.SourceSystem == src.SourceSystem {
				missingRefRate = sq.MissingClientRefRate
				break
			}
		}

		if missingRefRate <= 0.15 && src.CollisionRate <= 0.20 {
			continue
		}

		cards = append(cards, RecommendationCard{
			CardID:   "rec_" + uuid.New().String(),
			Priority: "HIGH",
			Action:   "REQUEST_SOURCE_PATCH",
			Title: fmt.Sprintf("Strengthen references for %s — %.1f%% collision rate",
				src.SourceSystem, src.CollisionRate*100),
			Reason: fmt.Sprintf(
				"Source %s has collision_rate=%.1f%% and missing_client_payout_ref_rate=%.1f%%. %.0f minor units became ambiguous due to missing stable business references.",
				src.SourceSystem, src.CollisionRate*100, missingRefRate*100, src.ValueAtRiskMinor.InexactFloat64()),
			SourceLayer:          "PATTERN",
			SourceSnapshotID:     snapID,
			AmountAtStakeMinor:   src.ValueAtRiskMinor,
			PriorityScore:        s.computePriorityScore("HIGH", src.ValueAtRiskMinor),
			AffectedSourceSystem: src.SourceSystem,
			Confidence:           confidenceFromDataPoints(src.TotalDecisions),
			ExpectedImprovement:  "Reduce ambiguous attachments by estimated 45–60% after adding client_payout_ref / VoucherNo",
			ActionOwner:          "Source System Owner",
		})
		count++
	}
	return cards
}

// buildPrepareAndSignRecs fires when a source system has recurring high-value
// ambiguity combined with low proof readiness — the classic Prepare-and-Sign signal.
//
// Trigger: top ambiguous source has rate > 0.15 AND value_at_risk > 500_000 minor units
func (s *RecommendationIntelligenceService) buildPrepareAndSignRecs(
	psnap *PatternSnapshot,
	snapID string,
) []RecommendationCard {
	var cards []RecommendationCard
	threshold := decimal.NewFromInt(500_000)
	count := 0
	for _, src := range psnap.AmbiguityBySource {
		if count >= 2 {
			break
		}
		if src.AmbiguityRate <= 0.15 || src.ValueAtRiskMinor.LessThan(threshold) {
			continue
		}

		// Check if source has low proof readiness
		lowProofReadiness := false
		for _, sq := range psnap.SourceQualityPatterns {
			if sq.SourceSystem == src.SourceSystem && sq.LowMatchabilityRate > 0.20 {
				lowProofReadiness = true
				break
			}
		}
		if !lowProofReadiness && src.AmbiguityRate <= 0.25 {
			continue // Only trigger if proof readiness is also weak or ambiguity is very high
		}

		cards = append(cards, RecommendationCard{
			CardID:   "rec_" + uuid.New().String(),
			Priority: "HIGH",
			Action:   "PREPARE_AND_SIGN_RECOMMENDED",
			Title: fmt.Sprintf("Move %s to Prepare-and-Sign — recurring ambiguity pattern detected",
				src.SourceSystem),
			Reason: fmt.Sprintf(
				"Source %s shows %.1f%% ambiguity rate with %.0f minor units at risk across %d attachment decisions. The source cannot preserve reliable business references — Zord carriers would eliminate this ambiguity.",
				src.SourceSystem, src.AmbiguityRate*100, src.ValueAtRiskMinor.InexactFloat64(), src.TotalDecisions),
			SourceLayer:          "PATTERN",
			SourceSnapshotID:     snapID,
			AmountAtStakeMinor:   src.ValueAtRiskMinor,
			PriorityScore:        s.computePriorityScore("HIGH", src.ValueAtRiskMinor),
			AffectedSourceSystem: src.SourceSystem,
			Confidence:           confidenceFromDataPoints(src.TotalDecisions),
			ExpectedImprovement:  "Eliminate attachment ambiguity for this flow — Zord carriers appear in all settlement files",
			ActionOwner:          "Finance / Technical Integration",
		})
		count++
	}
	return cards
}

// buildDuplicateRiskReviewRec fires when duplicate risk exposure is material.
// Trigger: duplicate_risk_rate > 0.05 OR duplicate_risk_exposure_minor > 1_000_000
func (s *RecommendationIntelligenceService) buildDuplicateRiskReviewRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	threshold := decimal.NewFromInt(1_000_000)
	if psnap.DuplicateRiskRate <= 0.05 && psnap.DuplicateRiskExposureMinor.LessThan(threshold) {
		return nil
	}

	priority := "HIGH"
	if psnap.DuplicateRiskRate > 0.10 {
		priority = "CRITICAL"
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: priority,
		Action:   "REVIEW_AMBIGUOUS_BATCH",
		Title: fmt.Sprintf("Review duplicate-risk cluster — %.1f%% of intents flagged",
			psnap.DuplicateRiskRate*100),
		Reason: fmt.Sprintf(
			"%.0f minor units across duplicate-risk flagged intents. Pattern: same vendor + same invoice + same amount repeated. Review cluster before payment movement or settlement closure.",
			psnap.DuplicateRiskExposureMinor.InexactFloat64()),
		SourceLayer:         "PATTERN",
		SourceSnapshotID:    snapID,
		AmountAtStakeMinor:  psnap.DuplicateRiskExposureMinor,
		PriorityScore:       s.computePriorityScore(priority, psnap.DuplicateRiskExposureMinor),
		Confidence:          confidenceFromDataPoints(int(psnap.DuplicateRiskExposureMinor.IntPart())),
		ExpectedImprovement: "Prevent confirmed duplicate exposure by reviewing before dispatch",
		ActionOwner:         "Finance / Operations",
	}
}

// buildUpdateVariancePolicyRec fires when recurring variances are not whitelisted
// but appear to follow a fee/deduction pattern (whitelisted amount > 0 but
// unexplained amount also remains high).
//
// Trigger: whitelisted_deduction_amount > 100_000 AND unexplained still > 0
func (s *RecommendationIntelligenceService) buildUpdateVariancePolicyRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	minWhitelisted := decimal.NewFromInt(100_000)
	if psnap.WhitelistedDeductionAmountMinor.LessThan(minWhitelisted) {
		return nil
	}
	if !psnap.UnexplainedVarianceAmountMinor.IsPositive() {
		return nil
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: "MEDIUM",
		Action:   "ADVISORY_RECOMMENDATION",
		Title:    "Update deduction policy — recurring fee variances detected",
		Reason: fmt.Sprintf(
			"%.0f minor units in whitelisted deductions detected alongside %.0f minor units unexplained variance. Some recurring deductions may qualify for whitelist policy addition to eliminate false leakage alerts.",
			psnap.WhitelistedDeductionAmountMinor.InexactFloat64(),
			psnap.UnexplainedVarianceAmountMinor.InexactFloat64()),
		SourceLayer:         "PATTERN",
		SourceSnapshotID:    snapID,
		AmountAtStakeMinor:  psnap.UnexplainedVarianceAmountMinor,
		PriorityScore:       s.computePriorityScore("MEDIUM", psnap.UnexplainedVarianceAmountMinor),
		Confidence:          "MEDIUM",
		ExpectedImprovement: "Eliminate false leakage alerts for expected PSP fees/TDS by adding to policy whitelist",
		ActionOwner:         "Finance",
	}
}

// buildRegenerateEvidenceRec fires when evidence pack coverage is low or
// missing leaf rate is above threshold.
// Trigger: evidence_pack_coverage < 0.80 OR missing_leaf_rate > 0.10
func (s *RecommendationIntelligenceService) buildRegenerateEvidenceRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	if psnap.EvidencePackCoverage >= 0.80 && psnap.MissingLeafRate <= 0.10 {
		return nil
	}

	priority := "MEDIUM"
	if psnap.EvidencePackCoverage < 0.50 || psnap.MissingLeafRate > 0.30 {
		priority = "HIGH"
	}

	reason := fmt.Sprintf(
		"Evidence pack coverage is %.1f%% (threshold 80%%). Missing leaf rate is %.1f%% — some packs are incomplete. Missing leaf types prevent audit-ready certification.",
		psnap.EvidencePackCoverage*100, psnap.MissingLeafRate*100)

	return &RecommendationCard{
		CardID:              "rec_" + uuid.New().String(),
		Priority:            priority,
		Action:              "REGENERATE_EVIDENCE",
		Title:               fmt.Sprintf("Evidence gap — %.1f%% pack coverage, %.1f%% missing leaf rate", psnap.EvidencePackCoverage*100, psnap.MissingLeafRate*100),
		Reason:              reason,
		SourceLayer:         "PATTERN",
		SourceSnapshotID:    snapID,
		PriorityScore:       s.computePriorityScore(priority, decimal.Zero),
		Confidence:          "HIGH",
		ExpectedImprovement: "Reach audit-ready threshold after regenerating missing evidence leaves",
		ActionOwner:         "Compliance / Engineering",
	}
}

// buildSLAWindowAdjustRec fires when settlement delay P95 consistently exceeds
// the expected same-day settlement window.
// Trigger: settlement_delay_p95 > 1 day (settlements regularly take more than 1 day)
func (s *RecommendationIntelligenceService) buildSLAWindowAdjustRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	// Only fire if P95 > 1 day and there is material delay beyond same-day expectation
	if psnap.SettlementDelayP95Days <= 1.0 {
		return nil
	}

	priority := "MEDIUM"
	if psnap.SettlementDelayP95Days > 3.0 {
		priority = "HIGH"
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: priority,
		Action:   "ADVISORY_RECOMMENDATION",
		Title: fmt.Sprintf("SLA window adjustment — settlement delay p95 is %.1f days",
			psnap.SettlementDelayP95Days),
		Reason: fmt.Sprintf(
			"Settlement delay p95=%.1f days, p50=%.1f days. The configured expected window is likely 1 day for same-day rails. Adjusting the SLA window to match actual provider behavior will reduce false escalations.",
			psnap.SettlementDelayP95Days, psnap.SettlementDelayP50Days),
		SourceLayer:         "PATTERN",
		SourceSnapshotID:    snapID,
		PriorityScore:       s.computePriorityScore(priority, decimal.Zero),
		Confidence:          "MEDIUM",
		ExpectedImprovement: "Eliminate false SLA breach alerts after window calibration",
		ActionOwner:         "Operations / Finance",
	}
}

// buildEscalateSourceRec fires when a single source system dominates manual review,
// ambiguity, AND variance — the triple-failure pattern that warrants escalation.
// Trigger: same source_system is WeakestSourceSystem AND TopAmbiguousSourceSystem
func (s *RecommendationIntelligenceService) buildEscalateSourceRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	if psnap.WeakestSourceSystem == "" || psnap.TopAmbiguousSourceSystem == "" {
		return nil
	}
	// Only escalate if the same source dominates both quality and ambiguity
	if psnap.WeakestSourceSystem != psnap.TopAmbiguousSourceSystem {
		return nil
	}
	// And the issue is significant enough
	if psnap.WeakestSourceManualReviewRate <= 0.15 && psnap.TopAmbiguousSourceRate <= 0.15 {
		return nil
	}

	sourceSystem := psnap.WeakestSourceSystem
	// Find the amount at risk for this source
	amountAtRisk := decimal.Zero
	for _, src := range psnap.AmbiguityBySource {
		if src.SourceSystem == sourceSystem {
			amountAtRisk = src.ValueAtRiskMinor
			break
		}
	}

	// Find batch count for this source to populate AffectedBatchCount
	affectedBatches := 0
	for _, sq := range psnap.SourceQualityPatterns {
		if sq.SourceSystem == sourceSystem {
			affectedBatches = sq.BatchCount
			break
		}
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: "CRITICAL",
		Action:   "ESCALATE",
		Title: fmt.Sprintf("Escalate source system %s — dominates manual review and ambiguity",
			sourceSystem),
		Reason: fmt.Sprintf(
			"Source system %s is the #1 contributor to manual review (%.1f%%) and attachment ambiguity (%.1f%%). This source requires immediate mapping profile fix or schema update to prevent continued operational overhead.",
			sourceSystem, psnap.WeakestSourceManualReviewRate*100, psnap.TopAmbiguousSourceRate*100),
		SourceLayer:          "PATTERN",
		SourceSnapshotID:     snapID,
		AmountAtStakeMinor:   amountAtRisk,
		PriorityScore:        s.computePriorityScore("CRITICAL", amountAtRisk),
		AffectedSourceSystem: sourceSystem,
		AffectedBatchCount:   affectedBatches,
		Confidence:           "HIGH",
		ExpectedImprovement:  "Reduce manual review and ambiguity for this flow by >70% after source fix",
		ActionOwner:          "Source System Owner / Finance",
	}
}

// buildMoveToControlModeRec fires when high-value recurring ambiguity persists
// and the current evidence mode (Grade A supplied-data proof) is insufficient
// for the volume/value at risk.
// Trigger: top_ambiguous_source_rate > 0.20 AND value_at_risk > 2_000_000 minor
func (s *RecommendationIntelligenceService) buildMoveToControlModeRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	threshold := decimal.NewFromInt(2_000_000)
	if psnap.TopAmbiguousSourceRate <= 0.20 {
		return nil
	}
	if psnap.TopAmbiguousSourceSystem == "" {
		return nil
	}
	// Find value at risk
	amountAtRisk := decimal.Zero
	for _, src := range psnap.AmbiguityBySource {
		if src.SourceSystem == psnap.TopAmbiguousSourceSystem {
			amountAtRisk = src.ValueAtRiskMinor
			break
		}
	}
	if amountAtRisk.LessThan(threshold) {
		return nil
	}

	affectedBatches := 0
	for _, sq := range psnap.SourceQualityPatterns {
		if sq.SourceSystem == psnap.TopAmbiguousSourceSystem {
			affectedBatches = sq.BatchCount
			break
		}
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: "HIGH",
		Action:   "DISPATCH_MODE_RECOMMENDED",
		Title: fmt.Sprintf("Move high-value flow to Dispatch/Control mode — %.0f minor units at risk",
			amountAtRisk.InexactFloat64()),
		Reason: fmt.Sprintf(
			"Source %s has %.1f%% ambiguity rate with %.0f minor units at risk. Supplied-data proof (Mode A) has reached its evidence ceiling for this flow. Moving to Prepare-and-Sign or Dispatch mode would create carrier-level proof that eliminates ambiguity.",
			psnap.TopAmbiguousSourceSystem, psnap.TopAmbiguousSourceRate*100, amountAtRisk.InexactFloat64()),
		SourceLayer:          "PATTERN",
		SourceSnapshotID:     snapID,
		AmountAtStakeMinor:   amountAtRisk,
		PriorityScore:        s.computePriorityScore("HIGH", amountAtRisk),
		AffectedSourceSystem: psnap.TopAmbiguousSourceSystem,
		AffectedBatchCount:   affectedBatches,
		Confidence:           "HIGH",
		ExpectedImprovement:  "Eliminate ambiguity permanently — Zord carriers appear in bank/settlement data",
		ActionOwner:          "Finance / Technical Integration",
	}
}

// buildRemappingRecs fires when a provider has consistently weak parse or mapping
// confidence, indicating the source mapping profile needs updating.
// Spec §9 recommendation #4: "Reprocess with corrected mapping profile."
//
// Trigger: avg_parse_confidence < 0.70 OR avg_mapping_confidence < 0.70 for a provider
// with enough settlements to be statistically meaningful (≥ 10).
func (s *RecommendationIntelligenceService) buildRemappingRecs(
	psnap *PatternSnapshot,
	snapID string,
) []RecommendationCard {
	var cards []RecommendationCard
	count := 0
	for _, prov := range psnap.ProviderQualityPatterns {
		if count >= 2 {
			break
		}
		// Only fire if we have enough data and quality is measurably weak
		weakParse := prov.AvgParseConfidence > 0 && prov.AvgParseConfidence < 0.70
		weakMapping := prov.AvgParseConfidence > 0 && prov.AvgParseConfidence < 0.70
		if !weakParse && !weakMapping {
			continue
		}

		priority := "MEDIUM"
		issue := "parse"
		confScore := prov.AvgParseConfidence
		if weakMapping && prov.AvgParseConfidence > prov.AvgParseConfidence {
			issue = "mapping"
			confScore = prov.AvgParseConfidence
		}
		if weakParse && weakMapping {
			issue = "parse and mapping"
			priority = "HIGH"
		}

		cards = append(cards, RecommendationCard{
			CardID:   "rec_" + uuid.New().String(),
			Priority: priority,
			Action:   "REQUEST_SOURCE_PATCH",
			Title: fmt.Sprintf("Reprocess with corrected mapping profile — %s %s confidence %.0f%%",
				prov.ProviderID, issue, confScore*100),
			Reason: fmt.Sprintf(
				"Provider %s has avg_%s_confidence=%.2f (threshold 0.70). Settlement files from this provider are being parsed with low reliability. A corrected mapping profile or updated parser template would improve attachment accuracy.",
				prov.ProviderID, issue, confScore),
			SourceLayer:        "PATTERN",
			SourceSnapshotID:   snapID,
			PriorityScore:      s.computePriorityScore(priority, decimal.Zero),
			AffectedProviderID: prov.ProviderID,
			Confidence:         "MEDIUM",
			ExpectedImprovement: fmt.Sprintf(
				"Improve %s confidence above 0.70 threshold — reduces ambiguous attachments from this provider",
				issue),
			ActionOwner: "Engineering / Data Operations",
		})
		count++
	}
	return cards
}

// buildBackfillFromPatternRec fires when pending_beyond_sla_rate is high,
// surfacing it from the Pattern layer (not just Leakage layer).
// Spec §9 recommendation #5: "Upload/backfill missing settlement or bank file."
//
// Trigger: pending_beyond_sla_rate > 0.05 (5% of intents pending beyond SLA window)
func (s *RecommendationIntelligenceService) buildBackfillFromPatternRec(
	psnap *PatternSnapshot,
	snapID string,
) *RecommendationCard {
	if psnap.PendingBeyondSLARate <= 0.05 {
		return nil
	}

	priority := "HIGH"
	if psnap.PendingBeyondSLARate > 0.15 {
		priority = "CRITICAL"
	}

	return &RecommendationCard{
		CardID:   "rec_" + uuid.New().String(),
		Priority: priority,
		Action:   "ADVISORY_RECOMMENDATION",
		Title: fmt.Sprintf("Backfill needed — %.1f%% of intents pending beyond SLA window",
			psnap.PendingBeyondSLARate*100),
		Reason: fmt.Sprintf(
			"%.1f%% of payment intents are unresolved beyond the expected settlement window. This typically means the bank statement or PSP settlement file has not arrived. Trigger a backfill or upload the latest settlement file.",
			psnap.PendingBeyondSLARate*100),
		SourceLayer:         "PATTERN",
		SourceSnapshotID:    snapID,
		PriorityScore:       s.computePriorityScore(priority, decimal.Zero),
		Confidence:          confidenceFromDataPoints(int(psnap.PendingBeyondSLARate * 1000)),
		ExpectedImprovement: "Resolve pending intents and prevent cascading SLA breach alerts after backfill",
		ActionOwner:         "Operations / Finance",
	}
}

// cardsFromDefensibility extracts recommendation cards from a DEFENSIBILITY snapshot.
func (s *RecommendationIntelligenceService) cardsFromDefensibility(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var dsnap DefensibilitySnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &dsnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	if dsnap.AuditReadyPct < 0.70 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "HIGH",
			Action:           "REGENERATE_EVIDENCE",
			Title:            fmt.Sprintf("Only %.1f%% of payments are audit-ready", dsnap.AuditReadyPct*100),
			Reason:           "Governance coverage and evidence pack rate are below audit thresholds",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("HIGH", decimal.Zero),
		})
	}

	if dsnap.GovernanceRejectedCount > 0 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "CRITICAL",
			Action:           "ESCALATE",
			Title:            fmt.Sprintf("%d governance decisions were REJECTED", dsnap.GovernanceRejectedCount),
			Reason:           "Rejected governance decisions indicate compliance violations",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("CRITICAL", decimal.Zero),
		})
	}

	if dsnap.ReplayabilityPct < 0.60 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "MEDIUM",
			Action:           "REGENERATE_EVIDENCE",
			Title:            fmt.Sprintf("Only %.1f%% of decisions are replay-equivalent", dsnap.ReplayabilityPct*100),
			Reason:           "Low replay coverage means disputes will be hard to defend",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("MEDIUM", decimal.Zero),
		})
	}

	return cards
}
