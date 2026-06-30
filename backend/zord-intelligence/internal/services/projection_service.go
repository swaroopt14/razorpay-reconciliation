package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ProjectionService computes and stores KPI projections from Kafka events.
//
// PHASE 4 ADDITIONS:
// The six intelligence layer services are injected here so that the five
// Grade A stub handlers (HandleSettlementCreated, HandleAttachmentDecision,
// HandleVarianceRecord, HandleBatchSummaryUpdated, HandleGovernanceDecision)
// can call them after updating their respective projection_state counters.
//
// PHASE 6 ADDITIONS:
// IntelligenceMode is injected at construction time and consulted inside
// the three Grade B-only handlers to gate finality-grade intelligence computation.
//
// GRADE B GATING DESIGN:
//
//	All Kafka events are ALWAYS ingested and idempotency-checked regardless of mode.
//	This is critical: stopping event ingestion in Grade A would cause missed events
//	that could never be replayed once the tenant upgrades to Grade B.
//
//	What the mode gates is INTELLIGENCE COMPUTATION:
//	  Grade A: leakage, ambiguity, defensibility, RCA, pattern, recommendation
//	  Grade B: additionally computes finality-grade projections (success_rate,
//	           finality_latency, SLA compliance, retry recovery, fusion conflict)
//
//	In Grade A, the Grade B computation blocks are skipped with a log trace.
//	The raw event counters (MarkProcessed, idempotency) still run.
//
// Dependency injection pattern: main.go creates all repos and services,
// then passes them into NewProjectionService.
type ProjectionService struct {
	projRepo      *persistence.ProjectionRepo
	policyService *PolicyService
	slaRepo       *persistence.SLATimerRepo
	batchRepo     *persistence.BatchContractRepo

	// ── Phase 4: Six intelligence layer services ──────────────────────────
	leakageSvc        *LeakageIntelligenceService
	leakagePredSvc    *LeakagePredictionService
	ambiguitySvc      *AmbiguityIntelligenceService
	defensibilitySvc  *DefensibilityIntelligenceService
	rcaSvc            *RCAIntelligenceService
	patternSvc        *PatternIntelligenceService
	recommendationSvc *RecommendationIntelligenceService

	// ── Phase 6: Intelligence mode ────────────────────────────────────────
	// Controls whether Grade B-only intelligence computation runs.
	// Set from config.IntelligenceMode at construction time.
	// Use s.isGradeB() throughout handlers — never read this field directly.
	mode models.IntelligenceMode
}

// NewProjectionService creates a ProjectionService with all Phase 4 intelligence services.
//
// PHASE 6: mode parameter added. Pass cfg.IntelligenceMode from main.go.
// All six intelligence services are required. main.go constructs them and injects.
func NewProjectionService(
	projRepo *persistence.ProjectionRepo,
	batchRepo *persistence.BatchContractRepo,
	policyService *PolicyService,
	slaRepo *persistence.SLATimerRepo,
	leakageSvc *LeakageIntelligenceService,
	leakagePredSvc *LeakagePredictionService,
	ambiguitySvc *AmbiguityIntelligenceService,
	defensibilitySvc *DefensibilityIntelligenceService,
	rcaSvc *RCAIntelligenceService,
	patternSvc *PatternIntelligenceService,
	recommendationSvc *RecommendationIntelligenceService,
	mode models.IntelligenceMode, // PHASE 6
) *ProjectionService {
	// Normalise empty string to GRADE_A so handlers can safely call IsGradeB()
	if !mode.Valid() {
		mode = models.IntelligenceModeGradeA
	}
	return &ProjectionService{
		projRepo:          projRepo,
		batchRepo:         batchRepo,
		policyService:     policyService,
		slaRepo:           slaRepo,
		leakageSvc:        leakageSvc,
		leakagePredSvc:    leakagePredSvc,
		ambiguitySvc:      ambiguitySvc,
		defensibilitySvc:  defensibilitySvc,
		rcaSvc:            rcaSvc,
		patternSvc:        patternSvc,
		recommendationSvc: recommendationSvc,
		mode:              mode, // PHASE 6
	}
}

// isGradeB returns true when running in Full Finality / Control Mode.
// Use this to gate Grade B-only intelligence computation inside handlers.
func (s *ProjectionService) isGradeB() bool {
	return s.mode.IsGradeB()
}

// Mode returns the current IntelligenceMode.
// Used by the intelligence mode handler to serve GET /v1/intelligence/mode.
func (s *ProjectionService) Mode() models.IntelligenceMode {
	return s.mode
}

// ── EventHandler interface methods ────────────────────────────────────────────
// These 7 methods satisfy the EventHandler interface in kafka/consumer.go.
// consumer.go calls them when a Kafka message arrives on each topic.

// HandleIntentCreated seeds tracking when a new payout intent arrives.
//
// WHAT WAS BROKEN:
//
//	SeedSLATimer existed in sla_worker.go but was never called here.
//	Every intent was created with no SLA timer → the sla_worker had nothing
//	to check → SLA breach alerts never fired → ops was flying blind.
//
// WHAT WE DO NOW:
//  1. Atomically increment the pending backlog counter for this corridor
//  2. Seed an SLA timer so the sla_worker can detect deadline breaches
func (s *ProjectionService) HandleIntentCreated(
	ctx context.Context,
	e models.IntentCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	// corridor_id might be null for now (Grade A/B pivot transition)
	corridorID := e.CorridorID
	if corridorID == "" {
		corridorID = "UNKNOWN"
	}

	log.Printf("[intent.created] RECEIVED event_id=%s tenant=%s intent=%s source=%s amount=%s corridor=%s dup_risk=%v",
		e.EventID, e.TenantID, e.IntentID, e.SourceSystem, e.Amount, e.CorridorID, e.DuplicateRiskFlag)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleIntentCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[intent.created] SKIPPED duplicate event_id=%s tenant=%s intent=%s",
			e.EventID, e.TenantID, e.IntentID)
		return nil
	}
	window := todayWindow(e.CreatedAt)

	if intendedMinor, err := decimal.NewFromString(e.Amount); err != nil {
		log.Printf("HandleIntentCreated: could not parse amount=%q intent=%s tenant=%s: %v",
			e.Amount, e.IntentID, e.TenantID, err)
	} else if intendedMinor.IsPositive() {
		if err := s.projRepo.AtomicIncrementLeakageIntendedTotal(
			ctx, e.TenantID, intendedMinor, window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleIntentCreated leakage denominator intent=%s: %w", e.IntentID, err)
		}
	}

	// Step 1: atomically add to the pending backlog (race-safe SQL upsert)
	if err := s.projRepo.AtomicIncrementPending(
		ctx, e.TenantID, corridorID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleIntentCreated pending corridor=%s: %w", corridorID, err)
	}

	// ── L7: Duplicate risk exposure (tenant-level) ────────────────────────────
	if e.DuplicateRiskFlag {
		if amt, parseErr := decimal.NewFromString(e.Amount); parseErr == nil && amt.IsPositive() {
			if err := s.projRepo.AtomicIncrementLeakageDuplicateRisk(
				ctx, e.TenantID, amt, window.start, window.end,
			); err != nil {
				log.Printf("HandleIntentCreated: AtomicIncrementLeakageDuplicateRisk failed intent=%s: %v",
					e.IntentID, err)
			}
			// Per-batch attribution: duplicate risk exposure
			if e.ClientBatchRef != "" {
				if batchErr := s.batchRepo.AtomicAddBatchDuplicateRiskExposure(
					ctx, e.ClientBatchRef, e.TenantID, amt,
				); batchErr != nil {
					log.Printf("HandleIntentCreated: AtomicAddBatchDuplicateRiskExposure failed intent=%s batch=%s: %v",
						e.IntentID, e.ClientBatchRef, batchErr)
				}
			}
		}
	}

	// Per-batch attribution: missing client reference
	if e.ClientPayoutRef == "" && e.ClientBatchRef != "" {
		if batchErr := s.batchRepo.AtomicIncrementBatchMissingRef(
			ctx, e.ClientBatchRef, e.TenantID, 1,
		); batchErr != nil {
			log.Printf("HandleIntentCreated: AtomicIncrementBatchMissingRef failed intent=%s batch=%s: %v",
				e.IntentID, e.ClientBatchRef, batchErr)
		}
	}

	// ── P3: Same-beneficiary-amount density per merchant batch ────────────────
	if e.ClientBatchRef != "" && e.BeneficiaryFingerprint != "" {
		pairKey := fmt.Sprintf("%s:%s", e.BeneficiaryFingerprint, e.Amount)
		if err := s.projRepo.AtomicUpsertBatchIntentDensity(
			ctx, e.TenantID, e.ClientBatchRef, pairKey, window.start, window.end,
		); err != nil {
			log.Printf("HandleIntentCreated: AtomicUpsertBatchIntentDensity failed intent=%s batch=%s: %v",
				e.IntentID, e.ClientBatchRef, err)
		}
	}

	// ── Pattern Intelligence: Source quality projection ───────────────────────
	// Extract intent quality signals and group by source_system.
	// These fields were previously received but not materialised into projections.
	if e.SourceSystem != "" {
		intendedMinorForSource := decimal.Zero
		if amt, err := decimal.NewFromString(e.Amount); err == nil {
			intendedMinorForSource = amt
		}
		srcDelta := persistence.SourceQualityDelta{
			IntentCount:            1,
			IntentAmountMinor:      intendedMinorForSource,
			MissingClientRefCount:  boolToInt(e.ClientPayoutRef == ""),
			LowMatchabilityCount:   boolToInt(e.MatchabilityScore > 0 && e.MatchabilityScore < 0.60),
			LowProofReadinessCount: boolToInt(e.ProofReadinessScore > 0 && e.ProofReadinessScore < 0.60),
			LowQualityScoreCount:   boolToInt(e.IntentQualityScore > 0 && e.IntentQualityScore < 0.60),
			BatchRef:               e.ClientBatchRef,
		}
		if e.DuplicateRiskFlag {
			srcDelta.DuplicateRiskCount = 1
			srcDelta.DuplicateRiskAmountMinor = intendedMinorForSource
		}
		if err := s.projRepo.AtomicUpsertSourceQuality(
			ctx, e.TenantID, e.SourceSystem, srcDelta, window.start, window.end,
		); err != nil {
			log.Printf("HandleIntentCreated: AtomicUpsertSourceQuality failed intent=%s source=%s: %v",
				e.IntentID, e.SourceSystem, err)
		}
	}

	// ── Pattern Intelligence: extended P2 (duplicate risk amount + missing ref) ─
	// Replace the existing AtomicIncrementPatternP2 call below with the extended version.
	// The old call is removed; this one tracks the amount and missing client ref too.
	if intendedAmt, parseErr := decimal.NewFromString(e.Amount); parseErr == nil {
		if err := s.projRepo.AtomicIncrementPatternP2WithAmount(
			ctx, e.TenantID,
			e.DuplicateRiskFlag,
			intendedAmt,
			e.ClientPayoutRef == "",
			window.start, window.end,
		); err != nil {
			log.Printf("HandleIntentCreated: AtomicIncrementPatternP2WithAmount failed intent=%s: %v",
				e.IntentID, err)
		}

		if e.ClientBatchRef != "" {
			providerKey, rail := deriveLeakageProviderAndRail(corridorID, e.ProviderHint, e.SourceSystem)
			if err := s.batchRepo.AtomicAccumulateIntentFeatures(
				ctx,
				e.ClientBatchRef,
				e.TenantID,
				intendedAmt,
				e.Currency,
				e.SourceSystem,
				rail,
				e.IntentType,
				providerKey,
				e.CreatedAt,
				e.ClientPayoutRef != "",
			); err != nil {
				log.Printf("HandleIntentCreated: AtomicAccumulateIntentFeatures failed intent=%s batch=%s: %v",
					e.IntentID, e.ClientBatchRef, err)
			}
		}
	}

	// Step 2: seed the SLA timer (BUG FIX — this was missing before)
	// We log failures but do NOT return an error here.
	// Reason: the backlog increment already succeeded. If SLA seeding fails
	// (e.g. transient DB hiccup), we want Kafka to commit the offset — the
	// backlog data is correct. An ops alert about SLA seeding is better than
	// reprocessing the event and double-counting the backlog.

	// Fix — ensure event has the defaulted corridorID for downstream logic
	e.CorridorID = corridorID

	if err := s.slaRepo.SeedTimer(ctx, e); err != nil {
		log.Printf("HandleIntentCreated: SeedTimer failed intent=%s corridor=%s: %v",
			e.IntentID, corridorID, err)
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, corridorID, "canonical.intent.created", e.EventID,
	); err != nil {
		log.Printf("HandleIntentCreated: EvaluateForEvent failed tenant=%s corridor=%s amount=%s currency=%s: intent=%s event_id=%s contract_id=%s created_at=%s trace_id=%s: %v",
			e.TenantID, e.CorridorID, e.Amount, e.Currency, e.IntentID, e.EventID, e.ContractID, e.CreatedAt, e.TraceID, err)
	}

	// ── Dispute Readiness: intent quality component ───────────────────────────
	if e.IntentQualityScore > 0 {
		if err := s.projRepo.AtomicRecordDefensibilityIntentQuality(
			ctx, e.TenantID, e.IntentQualityScore, window.start, window.end,
		); err != nil {
			log.Printf("HandleIntentCreated: AtomicRecordDefensibilityIntentQuality failed intent=%s: %v",
				e.IntentID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleIntentCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[intent.created] STORED OK event_id=%s tenant=%s intent=%s source=%s batch=%s",
		e.EventID, e.TenantID, e.IntentID, e.SourceSystem, e.ClientBatchRef)
	return nil
}

// HandleDispatchCreated tracks payout dispatch attempts.
//
// PHASE 6 MODE GATING:
// Retry recovery rate computation is Grade B only — it requires ZPI to own
// dispatch so that attempt counts are authoritative.
// In Grade A, the event is ingested and marked processed (idempotency preserved),
// but no retry_recovery projections are updated.
func (s *ProjectionService) HandleDispatchCreated(
	ctx context.Context,
	e models.DispatchAttemptCreatedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleDispatchCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	log.Printf("HandleDispatchCreated: attempt=%s intent=%s corridor=%s attempt_no=%d",
		e.AttemptID, e.IntentID, e.CorridorID, e.AttemptNo)

	// PHASE 6: retry recovery projections are Grade B only.
	// In Grade A we ingest and mark processed, but do not compute retry metrics.
	if s.isGradeB() {
		window := todayWindow(e.DispatchAt)

		if e.AttemptNo > 1 {
			if err := s.projRepo.AtomicIncrementRetryAttempt(
				ctx, e.TenantID, e.CorridorID, window.start, window.end,
			); err != nil {
				return err
			}
		} else {
			if err := s.projRepo.AtomicIncrementFirstAttempt(
				ctx, e.TenantID, e.CorridorID, window.start, window.end,
			); err != nil {
				return err
			}
		}
	} else {
		log.Printf("HandleDispatchCreated: Grade A mode — skipping retry recovery computation attempt=%s",
			e.AttemptID)
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "dispatch.attempt.created", e.EventID,
	); err != nil {
		log.Printf("HandleDispatchCreated: EvaluateForEvent failed tenant=%s corridor=%s: %v",
			e.TenantID, e.CorridorID, err)
	}
	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleDispatchCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleOutcomeNormalized updates the failure taxonomy when a FAILED outcome arrives.
// Called for every webhook/poll/statement signal — even provisional ones.
// Only FAILED signals with a reason code update the taxonomy.
func (s *ProjectionService) HandleOutcomeNormalized(
	ctx context.Context,
	e models.OutcomeNormalizedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleOutcomeNormalized IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	if e.StatusCandidate != "FAILED" || e.ReasonCode == "" {
		if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
			return fmt.Errorf("HandleOutcomeNormalized MarkProcessed event_id=%s: %w", e.EventID, err)
		}
		return nil
	}

	window := todayWindow(e.OccurredAt)

	if err := s.projRepo.AtomicIncrementFailureReason(
		ctx, e.TenantID, e.CorridorID, e.ReasonCode, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleOutcomeNormalized taxonomy corridor=%s reason=%s: %w",
			e.CorridorID, e.ReasonCode, err)
	}

	// Did this failure spike trigger any policy rules?
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "outcome.event.normalized", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleOutcomeNormalized MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleFinalityCertIssued processes a finality certificate from Service 5.
// A finality certificate means a payout reached a terminal state (SETTLED/FAILED/REVERSED).
//
// PHASE 6 MODE GATING:
//
// ALL modes: event is ingested, idempotency-checked, SLA timer resolved.
//
//	Skipping ingestion in Grade A would lose events permanently — not acceptable.
//
// GRADE B ONLY: finality-grade intelligence computation runs:
//  1. success_rate  — settled/total count for this corridor
//  2. finality_latency histogram — time from intent creation to finality
//  3. pending_backlog — decrement (this payout is done)
//  4. provider_ref_missing_rate — UTR/RRN/BankRef quality
//  5. conflict_rate_in_fusion — Outcome Fusion signal conflicts
//  6. retry_recovery_rate — retried payouts that reached SETTLED
//
// In Grade A these projections are skipped with a trace log. The finality cert
// is still marked processed so it is never double-counted if mode later upgrades.
//
// WHY SKIP IN GRADE A?
//
//	In Grade A, ZPI does not own dispatch. Finality certs may arrive from an
//	external source with incomplete signal coverage. Publishing corridor success
//	rates based on partial data would misrepresent ZPI's intelligence quality
//	and undermine the commercial case for Grade B upgrade.
//	Spec Section 5: "expose only the contracted intelligence surface in early mode."
func (s *ProjectionService) HandleFinalityCertIssued(
	ctx context.Context,
	e models.FinalityCertIssuedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" || e.CertificateID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, isProcessedErr := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if isProcessedErr != nil {
		return fmt.Errorf("HandleFinalityCertIssued IsProcessed event_id=%s: %w", e.EventID, isProcessedErr)
	}
	if processed {
		return nil
	}

	finalityProcessed, finalityProcessedErr := s.projRepo.IsFinalityProcessed(ctx, e.TenantID, e.CertificateID)
	if finalityProcessedErr != nil {
		return fmt.Errorf("HandleFinalityCertIssued IsFinalityProcessed certificate_id=%s: %w", e.CertificateID, finalityProcessedErr)
	}
	if finalityProcessed {
		return nil
	}

	window := todayWindow(e.DecisionAt)

	// ── PHASE 6: Grade B-only finality intelligence ───────────────────────
	// Updates 1–6 compute projections that require ZPI to own dispatch.
	// In Grade A mode these are skipped — the event is still marked processed.
	//
	// We gate at the COMPUTATION level, not the ingestion level.
	// Ingestion (idempotency + SLA resolution below) runs in all modes.
	if s.isGradeB() {
		// ── Update 1: success_rate ────────────────────────────────────────
		var err error
		switch e.FinalState {
		case "SETTLED":
			err = s.projRepo.AtomicIncrementSuccess(
				ctx, e.TenantID, e.CorridorID, window.start, window.end,
			)
		default:
			err = s.projRepo.AtomicIncrementFailure(
				ctx, e.TenantID, e.CorridorID, window.start, window.end,
			)
		}
		if err != nil {
			return fmt.Errorf("HandleFinalityCertIssued success_rate corridor=%s: %w",
				e.CorridorID, err)
		}

		// ── Update 2: finality latency histogram ──────────────────────────
		ttfSeconds := e.DecisionAt.Sub(e.IntentCreatedAt).Seconds()
		if ttfSeconds < 0 {
			log.Printf("HandleFinalityCertIssued: negative TTF cert=%s (clock skew), clamping to 0",
				e.CertificateID)
			ttfSeconds = 0
		}
		if err := s.projRepo.AtomicRecordLatencySample(
			ctx, e.TenantID, e.CorridorID, ttfSeconds, window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleFinalityCertIssued latency corridor=%s: %w",
				e.CorridorID, err)
		}

		// ── Update 3: pending backlog ─────────────────────────────────────
		if err := s.projRepo.AtomicDecrementPending(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleFinalityCertIssued pending corridor=%s: %w",
				e.CorridorID, err)
		}

		// ── Update 4: provider_ref_missing_rate ───────────────────────────
		if err := s.projRepo.AtomicRecordProviderRef(
			ctx, e.TenantID, e.CorridorID, e.HasProviderRef, window.start, window.end,
		); err != nil {
			log.Printf("HandleFinalityCertIssued: AtomicRecordProviderRef failed cert=%s: %v",
				e.CertificateID, err)
		}

		// ── Update 5: conflict_rate_in_fusion ─────────────────────────────
		if err := s.projRepo.AtomicRecordFusionConflict(
			ctx, e.TenantID, e.CorridorID,
			e.ConflictCount, e.ConflictTypes,
			window.start, window.end,
		); err != nil {
			log.Printf("HandleFinalityCertIssued: AtomicRecordFusionConflict failed cert=%s: %v",
				e.CertificateID, err)
		}

		// ── Update 6: retry_recovery_rate ─────────────────────────────────
		if e.FinalState == "SETTLED" {
			if err := s.projRepo.AtomicIncrementRetryRecovered(
				ctx, e.TenantID, e.CorridorID, window.start, window.end,
			); err != nil {
				log.Printf("HandleFinalityCertIssued: AtomicIncrementRetryRecovered failed cert=%s: %v",
					e.CertificateID, err)
			}
		}
	} else {
		// Grade A: log that we received a finality cert but are not computing
		// finality-grade intelligence. This is expected and correct.
		// The log helps ops confirm Grade B upgrade is working once they flip the mode.
		log.Printf("HandleFinalityCertIssued: Grade A mode — skipping finality intelligence cert=%s tenant=%s corridor=%s final_state=%s",
			e.CertificateID, e.TenantID, e.CorridorID, e.FinalState)
	}

	// ── Resolve the SLA timer ─────────────────────────────────────────────
	// Mark as RESOLVED so sla_worker doesn't fire a breach alert for a payout
	// that already finished. Log failures — don't let them fail the event.
	if err := s.slaRepo.ResolveTimer(ctx, e.IntentID, e.TenantID); err != nil {
		log.Printf("HandleFinalityCertIssued: ResolveTimer failed intent=%s: %v",
			e.IntentID, err)
	}

	// ── Track SLA Compliance ───────────────────────────────────────────────
	// Record whether this payout met its SLA deadline
	if err := s.HandleSLATimerResolved(ctx, e.TenantID); err != nil {
		log.Printf("HandleFinalityCertIssued: HandleSLATimerResolved failed tenant=%s: %v",
			e.TenantID, err)
	}

	// ── Trigger policy evaluation ─────────────────────────────────────────
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "finality.certificate.issued", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkFinalityProcessed(ctx, e.TenantID, e.CertificateID); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued MarkFinalityProcessed certificate_id=%s: %w", e.CertificateID, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleFinalContractUpdated is called when the final contract read model updates.
// Primary use: trigger event-based policy evaluation.
func (s *ProjectionService) HandleFinalContractUpdated(
	ctx context.Context,
	e models.FinalContractUpdatedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleFinalContractUpdated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "final.contract.updated", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleFinalContractUpdated MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleStatementMatch updates the statement_match_rate projection.
//
// Called when Service 5 emits a StatementMatchEvent on the
// "statement.match.event" Kafka topic (new topic, added per Service 5 spec).
//
// MATCHED events:   payout was found in the bank/PSP settlement statement.
// UNMATCHED events: payout settled per signals but NOT in statement after 24h.
//
// A rising UNMATCHED rate is a finance alarm:
//   - Signals say SETTLED but money not confirmed in statement
//   - Could indicate settlement delay, PSP error, or leakage
//   - Finance team can't close books cleanly
func (s *ProjectionService) HandleStatementMatch(
	ctx context.Context,
	e models.StatementMatchEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleStatementMatch IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.CreatedAt)
	matched := e.MatchStatus == "MATCHED"

	if err := s.projRepo.AtomicRecordStatementMatch(
		ctx, e.TenantID, e.CorridorID, matched, e.AgedSeconds, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleStatementMatch corridor=%s status=%s: %w",
			e.CorridorID, e.MatchStatus, err)
	}

	// Trigger policy evaluation — a spike in UNMATCHED events should fire
	// the reconciliation policy (P_STATEMENT_MISMATCH_SPIKE)
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "statement.match.event", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleStatementMatch MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}
func (s *ProjectionService) HandleEvidencePackReady(
	ctx context.Context,
	e models.EvidencePackReadyEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	log.Printf("[evidence.pack.created] RECEIVED event_id=%s tenant=%s pack=%s intent=%s completeness=%.2f leaves=%d/%d",
		e.EventID, e.TenantID, e.EvidencePackID, e.IntentID, e.PackCompletenessScore, e.LeafCount, e.RequiredLeafCount)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleEvidencePackReady IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[evidence.pack.created] SKIPPED duplicate event_id=%s tenant=%s pack=%s",
			e.EventID, e.TenantID, e.EvidencePackID)
		return nil
	}
	window := todayWindow(e.OccurredAt)

	// Update legacy evidence_readiness projection (existing behaviour)
	if err := s.projRepo.AtomicIncrementEvidence(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleEvidencePackReady tenant=%s: %w", e.TenantID, err)
	}

	// PHASE 4: Update DEFENSIBILITY projection — this intent now has an evidence pack.
	// Grade A already derives total_intents from attachment decisions, so evidence
	// coverage must update only the numerator here.
	if err := s.projRepo.AtomicIncrementDefensibilityEvidencePack(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		// Log but don't fail — legacy evidence_readiness was already updated
		log.Printf("HandleEvidencePackReady: AtomicIncrementDefensibilityEvidencePack failed tenant=%s: %v",
			e.TenantID, err)
	} else {
		// ── D2/D4/D5: Record pack completeness and leaf presence ──────────────
		if err := s.projRepo.AtomicRecordEvidencePackQuality(
			ctx, e.TenantID, e.PackCompletenessScore,
			e.SettlementLeafPresentFlag, e.AttachmentDecisionLeafPresentFlag,
			window.start, window.end,
		); err != nil {
			log.Printf("HandleEvidencePackReady: AtomicRecordEvidencePackQuality failed tenant=%s: %v",
				e.TenantID, err)
		}
		// Recompute defensibility snapshot now that evidence pack rate changed
		if err := s.defensibilitySvc.ComputeAndSave(ctx, e.TenantID, "", window.start, window.end); err != nil {
			log.Printf("HandleEvidencePackReady: defensibilitySvc failed tenant=%s: %v",
				e.TenantID, err)
		}
	}

	// ── Pattern Intelligence: Missing leaf rate tracking ──────────────────────
	// LeafCount and RequiredLeafCount were previously received but never stored.
	// Required to compute missing_leaf_rate = (required - actual) / required.
	if e.RequiredLeafCount > 0 {
		if err := s.projRepo.AtomicRecordEvidenceLeafCoverage(
			ctx, e.TenantID, e.LeafCount, e.RequiredLeafCount, window.start, window.end,
		); err != nil {
			log.Printf("HandleEvidencePackReady: AtomicRecordEvidenceLeafCoverage failed tenant=%s pack=%s: %v",
				e.TenantID, e.EvidencePackID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleEvidencePackReady MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[evidence.pack.created] STORED OK event_id=%s tenant=%s pack=%s intent=%s completeness=%.2f missing_leaves=%d",
		e.EventID, e.TenantID, e.EvidencePackID, e.IntentID, e.PackCompletenessScore,
		e.RequiredLeafCount-e.LeafCount)
	return nil
}

// HandleDLQItem processes a per-intent manual review event from Service 2.
//
// This event fires when a payment row is routed to human review before dispatch.
// ZPI uses it to compute manual_review_rate_by_source, which powers the
// "Fix Source Export" and "Escalate Source System" recommendation types.
//
// Processing order:
//  1. Idempotency check (prevent double-counting on Kafka retries)
//  2. Update source quality projection with manual review signal
//  3. Trigger recommendation recompute (pattern data changed)
func (s *ProjectionService) HandleDLQItem(
	ctx context.Context,
	e models.DLQItemEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleDLQItem: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	log.Printf("[payments.intent.dlq] RECEIVED event_id=%s tenant=%s intent=%s batch=%s source=%s amount=%s reason=%s",
		e.EventID, e.TenantID, e.IntentID, e.BatchID, e.SourceSystem, e.AmountMinor, e.ReasonCode)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleDLQItem IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[payments.intent.dlq] SKIPPED duplicate event_id=%s tenant=%s intent=%s source=%s",
			e.EventID, e.TenantID, e.IntentID, e.SourceSystem)
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Update source quality projection with manual review signal.
	// This is the primary intelligence input for the "Fix Source Export" recommendation.
	if e.SourceSystem != "" {
		dlqDelta := persistence.SourceQualityDelta{
			ManualReviewCount:       1,
			ManualReviewAmountMinor: e.AmountMinor,
			ManualReviewReasonCode:  e.ReasonCode,
		}
		if err := s.projRepo.AtomicUpsertSourceQuality(
			ctx, e.TenantID, e.SourceSystem, dlqDelta, window.start, window.end,
		); err != nil {
			log.Printf("HandleDLQItem: AtomicUpsertSourceQuality failed intent=%s source=%s: %v",
				e.IntentID, e.SourceSystem, err)
		}
	}

	// Recompute tenant-level Pattern snapshot so manual review data appears immediately.
	// DLQItem events may arrive after the last BatchSummary-triggered snapshot;
	// without this call the PatternSnapshot.TenantManualReviewRate would stay stale.
	if err := s.patternSvc.RecomputeTenantKPIs(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleDLQItem: patternSvc.RecomputeTenantKPIs failed intent=%s: %v", e.IntentID, err)
	}

	// Trigger recommendation recompute — manual review data affects source-fix recommendations.
	if err := s.recommendationSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleDLQItem: recommendationSvc failed intent=%s: %v", e.IntentID, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleDLQItem MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[payments.intent.dlq] STORED OK event_id=%s tenant=%s intent=%s source=%s reason=%s amount=%s — manual_review projection updated, pattern snapshot recomputed",
		e.EventID, e.TenantID, e.IntentID, e.SourceSystem, e.ReasonCode, e.AmountMinor)
	return nil
}

// HandleDLQEvent counts DLQ failures per original topic for ops visibility.
func (s *ProjectionService) HandleDLQEvent(
	ctx context.Context,
	e models.DLQEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.OriginalTopic == "" {
		log.Printf("invalid event: missing required fields tenant=%s event_id=%s topic=%s",
			e.TenantID, e.EventID, e.OriginalTopic)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleDLQEvent IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.FailedAt)
	if err := s.projRepo.AtomicIncrementDLQ(
		ctx, e.TenantID, e.OriginalTopic, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleDLQEvent topic=%s: %w", e.OriginalTopic, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleDLQEvent MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// ── Private helpers ───────────────────────────────────────────────────────────

type windowBounds struct {
	start time.Time
	end   time.Time
}

// todayWindow returns a 24-hour UTC window starting at midnight of the given time.
// All events on the same calendar day share the same window bucket.
func todayWindow(t time.Time) windowBounds {
	start := t.UTC().Truncate(24 * time.Hour)
	return windowBounds{
		start: start,
		end:   start.Add(24 * time.Hour),
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA BREACH RATE HANDLERS (new for Gap #4)
// ─────────────────────────────────────────────────────────────────────────────

// HandleSLATimerBreached is called by sla_worker when an SLA timer exceeds its deadline.
//
// Business logic:
//   - An intent had a deadline (created_at + 6 hours)
//   - Current time is now past that deadline
//   - The payout is still PENDING (not finalized)
//   - This is a breach
//
// What we do:
//  1. Calculate how late we are: breach_duration = now - deadline
//  2. Increment the breach counter
//  3. Track the breach duration for averaging
//  4. Update the projection
func (s *ProjectionService) HandleSLATimerBreached(
	ctx context.Context,
	tenantID string,
	breachDurationSeconds float64,
) error {
	window := todayWindow(time.Now())

	if err := s.projRepo.AtomicIncrementSLABreached(
		ctx, tenantID, breachDurationSeconds, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleSLATimerBreached tenant=%s: %w", tenantID, err)
	}

	return nil
}

// HandleSLATimerResolved is called when an SLA timer reaches finality BEFORE its deadline.
//
// Business logic:
//   - An intent had a deadline
//   - The payout reached SETTLED/FAILED/REVERSED before deadline
//   - This is on-time delivery
//
// What we do:
//  1. Increment on_time counter
//  2. Increment total_processed counter
//  3. Update the projection
func (s *ProjectionService) HandleSLATimerResolved(
	ctx context.Context,
	tenantID string,
) error {
	window := todayWindow(time.Now())

	if err := s.projRepo.AtomicIncrementSLAOnTime(
		ctx, tenantID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleSLATimerResolved tenant=%s: %w", tenantID, err)
	}

	return nil
}

// =============================================================================
// PHASE 4 — Grade A intelligence handlers
// =============================================================================
//
// These five handlers implement the full Grade A intelligence computation for
// the pivoted ZPI spec. They replace the Phase 2 stubs.
//
// Each handler follows the same pattern:
//   1. Validate required fields
//   2. Idempotency check (skip already-processed events)
//   3. Atomic projection update (race-safe SQL)
//   4. Intelligence snapshot recomputation (non-fatal)
//   5. Policy evaluation (non-fatal)
//   6. MarkProcessed
//
// FINTECH PRINCIPLE: steps 3–5 are ordered so that the atomic projection
// write (step 3) always succeeds before snapshot computation (step 4).
// If snapshot computation fails, the raw projection data is still correct
// and the next event will trigger another snapshot computation attempt.
// =============================================================================

// HandleSettlementCreated processes a canonical settlement observation from Service 5B.
//
// PHASE 4 LOGIC:
// A settlement observation arriving with POOR attachment readiness and no
// matching intent is the earliest signal of an ORPHAN_SETTLEMENT leakage event.
// We record it into the LEAKAGE projection here, then trigger the leakage
// intelligence service to recompute the snapshot.
//
// IMPORTANT: We do NOT record a leakage event for every settlement — only for
// those with StatusObservation = "SETTLED" AND AttachmentReadiness = "POOR"
// (meaning Service 5B could not find a candidate intent at all).
// The definitive MATCH_UNRESOLVED signal comes from Service 5C via
// HandleAttachmentDecision. This handler only catches the earliest orphan signal.
func (s *ProjectionService) HandleSettlementCreated(
	ctx context.Context,
	e models.CanonicalSettlementCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleSettlementCreated: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	log.Printf("[canonical.settlement.created] RECEIVED event_id=%s tenant=%s settlement=%s batch=%s provider=%s bank=%s rail=%s amount=%s status=%s",
		e.EventID, e.TenantID, e.SettlementID, e.BatchID, e.ProviderID, e.BankID, e.PaymentRail, e.SettledAmountMinor, e.StatusObservation)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleSettlementCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[canonical.settlement.created] SKIPPED duplicate event_id=%s tenant=%s settlement=%s",
			e.EventID, e.TenantID, e.SettlementID)
		return nil
	}
	log.Printf("HandleSettlementCreated: tenant=%s event_id=%s trace_id=%s occurred_at=%s settlement_id=%s batch_id=%s payment_rail=%s source_type=%s source_strength=%s provider_id=%s source_system_id=%s bank_id=%s parse_conf=%.2f amount=%s currency=%s date=%s utr=%s rrn=%s bank_ref=%s provider_ref=%s client_ref=%s richness=%.2f readiness=%.2f status=%s ingest_run_id=%s",
		e.TenantID, e.EventID, e.TraceID, e.OccurredAt,
		e.SettlementID, e.BatchID, e.PaymentRail, e.SourceType, e.SourceStrength, e.ProviderID, e.SourceSystemID, e.BankID, e.ParseConfidence,
		e.SettledAmountMinor, e.Currency, e.SettlementDate,
		e.UTR, e.RRN, e.BankRef, e.ProviderRef, e.ClientRef,
		e.CarrierRichness, e.AttachmentReadiness, e.StatusObservation, e.IngestRunID)

	settlementOccurredAt := e.OccurredAt
	if settlementOccurredAt.IsZero() {
		settlementOccurredAt = time.Now().UTC()
	}
	window := todayWindow(settlementOccurredAt)

	// Classify both float scores from Service 5B into tiers.
	// ZPI owns the threshold constants; Service 5B only sends raw numbers.
	readiness := classifyAttachmentReadiness(e.AttachmentReadiness)
	carrierTier := classifyCarrierRichness(e.CarrierRichness)

	// Emit an early ambiguity warning when carrier data is POOR.
	// This is the earliest possible signal — before Service 5C even attempts
	// to attach this settlement to an intent. The actual provider_ref_missing_rate
	// projection is updated later by HandleAttachmentDecision (which has corridor scope).
	if carrierTier == "POOR" {
		log.Printf("HandleSettlementCreated: CARRIER_POOR settlement_id=%s tenant=%s richness=%.2f — ambiguity risk HIGH, attachment will likely be UNRESOLVED",
			e.SettlementID, e.TenantID, e.CarrierRichness)
	}

	// Record ORPHAN_SETTLEMENT leakage signal when a settled observation
	// has no attachment candidates at all.
	// POOR means Service 5B scored this settlement too low to find any candidate intent.
	if e.StatusObservation == "SETTLED" && readiness == "POOR" {
		if err := s.projRepo.AtomicRecordLeakage(
			ctx,
			e.TenantID,
			"ORPHAN_SETTLEMENT",
			decimal.Zero,         // intendedMinor = 0 (no intent found)
			e.SettledAmountMinor, // orphanMinor = settled amount
			window.start, window.end,
		); err != nil {
			log.Printf("HandleSettlementCreated: AtomicRecordLeakage failed settlement=%s: %v",
				e.SettlementID, err)
		} else {
			// Recompute leakage intelligence snapshot
			if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
				log.Printf("HandleSettlementCreated: leakageSvc.ComputeAndSave failed tenant=%s: %v",
					e.TenantID, err)
			}
		}
		// Per-batch attribution: orphan settlement amount
		if e.BatchID != "" && e.SettledAmountMinor.IsPositive() {
			if batchErr := s.batchRepo.AtomicAddBatchOrphanAmount(
				ctx, e.BatchID, e.TenantID, e.SettledAmountMinor,
			); batchErr != nil {
				log.Printf("HandleSettlementCreated: AtomicAddBatchOrphanAmount failed settlement=%s batch=%s: %v",
					e.SettlementID, e.BatchID, batchErr)
			}
		}
	}

	// ── L2: Accumulate total observed settled volume for ALL settlements ──
	// Tracks every confirmed settled amount regardless of attachment readiness.
	// Numerator and denominator for leakage rate are computed separately.
	if err := s.projRepo.AtomicIncrementSettledVolume(
		ctx, e.TenantID, e.SettledAmountMinor, window.start, window.end,
	); err != nil {
		log.Printf("HandleSettlementCreated: AtomicIncrementSettledVolume failed settlement=%s: %v",
			e.SettlementID, err)
	}

	// ── A8: Record carrier completeness for ALL settlements ───────────────
	// A settlement is carrier-complete when CarrierRichness >= 0.60 (3 of 5 carriers populated).
	isCarrierComplete := e.CarrierRichness >= 0.60
	if err := s.projRepo.AtomicRecordCarrierCompleteness(
		ctx, e.TenantID, isCarrierComplete, window.start, window.end,
	); err != nil {
		log.Printf("HandleSettlementCreated: AtomicRecordCarrierCompleteness failed settlement=%s: %v",
			e.SettlementID, err)
	}

	log.Printf("HandleSettlementCreated: settlement_id=%s tenant=%s source=%s readiness=%s(score=%.2f) carrier=%s(richness=%.2f) confidence=%.2f",
		e.SettlementID, e.TenantID, e.SourceSystemID, readiness, e.AttachmentReadiness, carrierTier, e.CarrierRichness, e.ParseConfidence)

	// Accumulate settlement signals into RCA fragment for this intent.
	// SettlementDate is a string ("2026-04-08"); intended amount lives on the intent event.
	if e.BatchID != "" && e.SettlementID != "" {
		sigS := SettlementSignals{
			SourceStrengthClass:  e.SourceStrength,
			ObservationKind:      "SETTLEMENT",
			ParseConfidence:      e.ParseConfidence,
			MappingConfidence:    e.MappingConfidence,
			CarrierRichnessScore: e.CarrierRichness,
			ReasonText:           e.StatusObservation,
			IntendedAmountMinor:  0, // populated from intent event, not settlement
			SettledAmountMinor:   e.SettledAmountMinor.IntPart(),
			MissingClientRef:     e.ClientRef == "",
			MissingProviderRef:   e.ProviderRef == "",
			MissingBankRef:       e.BankRef == "" && e.UTR == "" && e.RRN == "",
			SettlementDate:       time.Time{}, // string field; zero time used for duration math
			IntendedDate:         time.Time{},
		}
		if err := s.rcaSvc.AccumulateSettlementFragment(ctx, e.TenantID, e.BatchID, e.SettlementID, sigS); err != nil {
			log.Printf("HandleSettlementCreated: AccumulateSettlementFragment failed settlement=%s: %v", e.SettlementID, err)
		}
	}

	// ── R4/R5/R6: Parser and mapping weakness per source system ───────────────
	if e.SourceSystemID != "" {
		if err := s.projRepo.AtomicRecordRCAQuality(
			ctx, e.TenantID, e.SourceSystemID, e.ParseConfidence, e.MappingConfidence,
			window.start, window.end,
		); err != nil {
			log.Printf("HandleSettlementCreated: AtomicRecordRCAQuality failed settlement=%s: %v",
				e.SettlementID, err)
		}
	}

	// ── Pattern Intelligence: Provider quality projection ─────────────────────
	// Groups parse/mapping/carrier/attachment quality metrics by PSP provider.
	// ProviderID, BankID, PaymentRail are new fields from Service 5B (upstream contract).
	if e.ProviderID != "" {
		isOrphan := e.StatusObservation == "SETTLED" && readiness == "POOR"
		provDelta := persistence.ProviderQualityDelta{
			SettlementCount:         1,
			SettlementAmountMinor:   e.SettledAmountMinor,
			ParseConfidence:         e.ParseConfidence,
			MappingConfidence:       e.MappingConfidence,
			CarrierRichness:         e.CarrierRichness,
			AttachmentReadiness:     e.AttachmentReadiness,
			OrphanCount:             boolToInt(isOrphan),
			MissingProviderRefCount: boolToInt(e.ProviderRef == ""),
			MissingClientRefCount:   boolToInt(e.ClientRef == ""),
		}
		if err := s.projRepo.AtomicUpsertProviderQuality(
			ctx, e.TenantID, e.ProviderID, provDelta, window.start, window.end,
		); err != nil {
			log.Printf("HandleSettlementCreated: AtomicUpsertProviderQuality failed settlement=%s provider=%s: %v",
				e.SettlementID, e.ProviderID, err)
		}
	}

	// ── Pattern Intelligence: Bank quality projection ──────────────────────────
	if e.BankID != "" {
		bankDelta := persistence.BankQualityDelta{
			SettlementCount:     1,
			MissingBankRefCount: boolToInt(e.BankRef == "" && e.UTR == "" && e.RRN == ""),
			MissingUTRCount:     boolToInt(e.UTR == ""),
		}
		if err := s.projRepo.AtomicUpsertBankQuality(
			ctx, e.TenantID, e.BankID, bankDelta, window.start, window.end,
		); err != nil {
			log.Printf("HandleSettlementCreated: AtomicUpsertBankQuality failed settlement=%s bank=%s: %v",
				e.SettlementID, e.BankID, err)
		}
	}

	// ── Pattern Intelligence: Bank reference coverage (per-batch) ─────────────
	// Tracks how many settlement observations for this batch carried a
	// bank-side reference (BankRef, UTR, or RRN), regardless of match status.
	// bank_reference_coverage = bank_ref_present_count / settlement_ref_count.
	if e.BatchID != "" {
		hasBankRef := e.BankRef != "" || e.UTR != "" || e.RRN != ""
		if err := s.batchRepo.AtomicAddBatchBankRefStats(ctx, e.BatchID, e.TenantID, hasBankRef); err != nil {
			log.Printf("HandleSettlementCreated: AtomicAddBatchBankRefStats failed settlement=%s batch=%s: %v",
				e.SettlementID, e.BatchID, err)
		}
	}

	// ── Dispute Readiness: mapping confidence component ──────────────────────
	if e.MappingConfidence > 0 {
		if err := s.projRepo.AtomicRecordDefensibilityMappingConfidence(
			ctx, e.TenantID, e.MappingConfidence, window.start, window.end,
		); err != nil {
			log.Printf("HandleSettlementCreated: AtomicRecordDefensibilityMappingConfidence failed settlement=%s: %v",
				e.SettlementID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleSettlementCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[canonical.settlement.created] STORED OK event_id=%s tenant=%s settlement=%s provider=%s bank=%s amount=%s carrier_richness=%.2f",
		e.EventID, e.TenantID, e.SettlementID, e.ProviderID, e.BankID, e.SettledAmountMinor, e.CarrierRichness)
	return nil
}

// HandleAttachmentDecision processes an attachment decision from Service 5C.
//
// PHASE 4 LOGIC — This is the most important Grade A handler.
// Every attachment decision feeds TWO intelligence layers:
//
//  1. LEAKAGE:   MATCH_UNRESOLVED → intent exists but no settlement found
//     → record UNMATCHED_INTENT leakage
//
//  2. AMBIGUITY: ALL decisions → update ambiguity projection
//     → MATCH_AMBIGUOUS / MATCH_UNRESOLVED → increment ambiguity counters
//     → ALL decisions → update running confidence average
//
// After both projections are updated, we recompute both intelligence snapshots
// and then recompute the RECOMMENDATION snapshot which reads from both.
//
// ORDERING: projections are updated atomically first, then snapshots are computed.
// If snapshot computation fails (non-fatal), the projection data is still correct
// and the next event will trigger another snapshot computation attempt.
func (s *ProjectionService) HandleAttachmentDecision(
	ctx context.Context,
	e models.AttachmentDecisionCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleAttachmentDecision: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	log.Printf("[attachment.decision.created] RECEIVED event_id=%s tenant=%s decision=%s intent=%s batch=%s confidence=%.2f candidate_set=%d provider_id=%s client_refernce=%s",
		e.EventID, e.TenantID, e.DecisionType, e.IntentID, e.BatchID, e.ConfidenceScore, e.CandidateSetSize, e.ProviderID, e.ClientReference)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleAttachmentDecision IsProcessed event_id=%s:%w", e.EventID, err)
	}
	if processed {
		log.Printf("[attachment.decision.created] SKIPPED duplicate event_id=%s tenant=%s decision=%s",
			e.EventID, e.TenantID, e.DecisionType)
		return nil
	}

	window := todayWindow(e.OccurredAt)
	supportingCarriers := supportingCarrierNames(e.SupportingCarriers)
	batchIDForAttribution := e.BatchID
	isUnresolvedDecision := strings.EqualFold(e.DecisionType, "MATCH_UNRESOLVED")
	isAmbiguousDecision := strings.EqualFold(e.DecisionType, "MATCH_AMBIGUOUS")
	intendedAmountMinor := e.IntendedAmountMinor

	// ── Step 1: Update LEAKAGE projection for MATCH_UNRESOLVED ───────────
	// A MATCH_UNRESOLVED decision means a settlement observation exists but
	// Service 5C could not find any matching intent for it — or an intent
	// exists with no matching settlement. The full intended amount is at risk.
	if isUnresolvedDecision {
		if err := s.projRepo.AtomicRecordLeakage(
			ctx,
			e.TenantID,
			"UNMATCHED_INTENT",
			intendedAmountMinor,
			decimal.Zero,
			window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleAttachmentDecision AtomicRecordLeakage decision=%s: %w",
				e.DecisionID, err)
		}
	}

	// Per-batch attribution: unmatched_amount_minor.
	// Both MATCH_UNRESOLVED (no settlement found) and MATCH_AMBIGUOUS (settlement
	// could not be confidently attached) leave the intended amount unconfirmed —
	// money at risk — so both contribute to this batch's unmatched amount.
	if (isUnresolvedDecision || isAmbiguousDecision) && batchIDForAttribution != "" && intendedAmountMinor.IsPositive() {
		if batchErr := s.batchRepo.AtomicAddBatchUnmatchedAmount(
			ctx, batchIDForAttribution, e.TenantID, intendedAmountMinor,
		); batchErr != nil {
			log.Printf("HandleAttachmentDecision: AtomicAddBatchUnmatchedAmount failed decision=%s batch=%s: %v",
				e.DecisionID, batchIDForAttribution, batchErr)
		}
	}

	// ── L7b: Confirmed duplicate exposure for MATCH_DUPLICATE ────────────
	if strings.EqualFold(e.DecisionType, "MATCH_DUPLICATE") {
		if err := s.projRepo.AtomicIncrementLeakageConfirmedDuplicate(
			ctx, e.TenantID, intendedAmountMinor, window.start, window.end,
		); err != nil {
			log.Printf("HandleAttachmentDecision: AtomicIncrementLeakageConfirmedDuplicate failed decision=%s: %v",
				e.DecisionID, err)
		}
	}

	// ── Step 2: Update AMBIGUITY projection for ALL decisions ─────────────
	// Every attachment decision contributes to the running confidence average
	// and the total_decisions denominator, regardless of decision type.
	// A5: low confidence when ConfidenceScore < 0.70 (aligned with weakestCohortSignal threshold)
	// A6: collision when more than one candidate competed for attachment
	// A7: ScoreMargin is pre-computed upstream as WinningScore - RunnerUpScore
	isLowConfidence := e.ConfidenceScore < 0.70
	hasCollision := e.CandidateSetSize > 1
	// A9: a decision is "successful" when it is unambiguous, has a single
	// (non-colliding) candidate, and the settled amount exactly matches the
	// intended amount.
	isSuccessfulDecision := e.AmbiguityScore <= 0.30 &&
		e.CandidateSetSize <= 1 &&
		e.SettledAmountMinor.Equal(e.IntendedAmountMinor)
	if err := s.projRepo.AtomicRecordAttachmentDecision(
		ctx,
		e.TenantID,
		e.DecisionType,
		e.ConfidenceScore,
		intendedAmountMinor,
		supportingCarriers,
		isLowConfidence,
		hasCollision,
		e.ScoreMargin,
		isSuccessfulDecision,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleAttachmentDecision AtomicRecordAttachmentDecision decision=%s: %w",
			e.DecisionID, err)
	}

	// ── Step 2a: Update PROVIDER QUALITY projection (decision-side stats) ──
	// Merges decision-derived counts (total_decisions, successful_decision_count,
	// ambiguous/unresolved) into the same pattern.provider.{id} projection that
	// HandleSettlementCreated populates with settlement-side stats (e.g. orphan_rate).
	if e.ProviderID != "" {
		isAmbiguous := e.DecisionType == "MATCH_AMBIGUOUS"
		isUnresolved := e.DecisionType == "MATCH_UNRESOLVED"
		if err := s.projRepo.AtomicUpsertProviderQuality(
			ctx, e.TenantID, e.ProviderID,
			persistence.ProviderQualityDelta{
				DecisionCount:           1,
				AmbiguousDecisionCount:  boolToInt(isAmbiguous),
				UnresolvedDecisionCount: boolToInt(isUnresolved),
				SuccessfulDecisionCount: boolToInt(isSuccessfulDecision),
			},
			window.start, window.end,
		); err != nil {
			log.Printf("HandleAttachmentDecision: AtomicUpsertProviderQuality failed decision=%s provider=%s: %v",
				e.DecisionID, e.ProviderID, err)
		}
	}

	// ── Step 2b: Increment DEFENSIBILITY denominator (Grade A path) ──────
	// In Grade A mode there are no intent.created or evidence.pack.ready events,
	// so total_intents must be driven from attachment decisions. Each decision
	// is 1 intent. hasEvidencePack=false — evidence pack info is not in this event.
	if err := s.projRepo.AtomicIncrementDefensibilityIntent(
		ctx, e.TenantID, false, window.start, window.end,
	); err != nil {
		log.Printf("HandleAttachmentDecision: AtomicIncrementDefensibilityIntent failed decision=%s: %v",
			e.DecisionID, err)
	}

	// ── Step 3: Recompute intelligence snapshots ──────────────────────────
	// These are non-fatal — a failure to write a snapshot does not corrupt
	// the projection data written above. The next event will retry.

	if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: leakageSvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	if err := s.ambiguitySvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: ambiguitySvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	// Recompute recommendation snapshot after both upstream layers updated
	if err := s.recommendationSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: recommendationSvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	// ── Step 4: Trigger policy evaluation ────────────────────────────────
	// Policies P_LEAKAGE_UNMATCHED and P_AMBIGUITY_RATE_HIGH fire here.
	// corridorID may be empty for tenant-scoped policies — pass it through.
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "attachment.decision.created", e.EventID,
	); err != nil {
		log.Printf("HandleAttachmentDecision: EvaluateForEvent failed decision=%s: %v",
			e.DecisionID, err)
	}

	// Accumulate attachment signals into RCA fragment for this intent.
	if batchIDForAttribution != "" && e.IntentID != "" {
		sigA := AttachmentSignals{
			DecisionType:    e.DecisionType,
			AmbiguityScore:  e.AmbiguityScore,
			ConfidenceScore: e.ConfidenceScore,
			CandidateCount:  e.CandidateSetSize,
		}
		if err := s.rcaSvc.AccumulateAttachmentFragment(ctx, e.TenantID, batchIDForAttribution, e.IntentID, sigA); err != nil {
			log.Printf("HandleAttachmentDecision: AccumulateAttachmentFragment failed decision=%s: %v", e.DecisionID, err)
		}
	}

	// NOTE: AttachmentDecisionCreatedEvent (5C) carries ProviderID (source_system),
	// which feeds the decision-side counters (total_decisions, ambiguous_decisions,
	// unresolved_decisions, successful_decision_count) into pattern.provider.{id}
	// via Step 2a above. Settlement-side stats (e.g. orphan_rate) for the same
	// provider key come from CanonicalSettlementCreatedEvent (5B) via HandleSettlementCreated.

	// ── Pattern Intelligence: Client reference coverage (per-batch) ───────────
	// Tracks how many attachment decisions for this batch carried a
	// client-side reference (ClientReference), regardless of decision type.
	// client_reference_coverage = client_ref_present_count / decision_ref_count.
	if e.BatchID != "" {
		hasClientRef := e.ClientReference != ""
		if err := s.batchRepo.AtomicAddBatchClientRefStats(ctx, e.BatchID, e.TenantID, hasClientRef); err != nil {
			log.Printf("HandleAttachmentDecision: AtomicAddBatchClientRefStats failed decision=%s batch=%s: %v",
				e.DecisionID, e.BatchID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleAttachmentDecision MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[attachment.decision.created] STORED OK event_id=%s tenant=%s decision=%s intent=%s batch=%s confidence=%.2f",
		e.EventID, e.TenantID, e.DecisionType, e.IntentID, e.BatchID, e.ConfidenceScore)
	return nil
}

func supportingCarrierNames(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}

	var carrierMap map[string]interface{}
	if err := json.Unmarshal(raw, &carrierMap); err == nil {
		names := make([]string, 0, len(carrierMap))
		for name, value := range carrierMap {
			if value == nil {
				continue
			}
			names = append(names, name)
		}
		return names
	}

	var carrierList []string
	if err := json.Unmarshal(raw, &carrierList); err == nil {
		return carrierList
	}

	return nil
}

func extractClientPayoutRefCandidate(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}

	var carrierMap map[string]interface{}
	if err := json.Unmarshal(raw, &carrierMap); err != nil {
		return ""
	}
	for _, key := range []string{
		"client_reference_candidate",
		"client_payout_ref",
		"client_ref",
		"client_reference",
	} {
		if ref := normalizeCarrierString(carrierMap[key]); ref != "" {
			return ref
		}
	}
	return ""
}

func normalizeCarrierString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case map[string]interface{}:
		for _, nestedKey := range []string{"value", "candidate", "reference", "ref"} {
			if nested := normalizeCarrierString(typed[nestedKey]); nested != "" {
				return nested
			}
		}
	}
	return ""
}

// HandleVarianceRecord processes a financial variance record from Service 5C.
//
// PHASE 4 LOGIC:
// A variance record is the definitive signal of a financial discrepancy —
// a settlement WAS matched to an intent, but the amounts or dates don't agree.
//
// UNDER_SETTLEMENT: the most common type. PSP settled less than intended.
//
//	→ add variance_amount_minor to leakage.under_settlement_amount_minor
//
// REVERSAL: settled then reversed — money paid out then clawed back.
//
//	→ add to leakage.reversal_exposure_minor (tracked separately — different risk)
//
// DEDUCTION: PSP deducted a fee.
//
//	→ whitelisted (pre-agreed) deductions: record for audit, don't count as leakage
//	→ non-whitelisted: count as leakage in UNDER_SETTLEMENT bucket
//
// VALUE_DATE_MISMATCH / CROSS_PERIOD: date discrepancies.
//
//	→ these affect accounting periods, not money amounts.
//	→ we record them as UNDER_SETTLEMENT with varianceAmountMinor=0 for count tracking.
//
// OVER_SETTLEMENT: received MORE than intended.
//
//	→ not leakage — but track separately for audit / financial reconciliation.
//	→ we skip over-settlement from the leakage projection (spec §10.1).
func (s *ProjectionService) HandleVarianceRecord(
	ctx context.Context,
	e models.VarianceRecordCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleVarianceRecord: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	log.Printf("[variance.record.created] RECEIVED event_id=%s tenant=%s variance=%s type=%s amount=%s batch=%s intent=%s whitelisted=%v provider_id=%s",
		e.EventID, e.TenantID, e.VarianceID, e.VarianceType, e.VarianceAmountMinor, e.BatchID, e.IntentID, e.IsWhitelisted, e.ProviderID)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleVarianceRecord IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[variance.record.created] SKIPPED duplicate event_id=%s tenant=%s variance=%s",
			e.EventID, e.TenantID, e.VarianceID)
		return nil
	}

	window := todayWindow(e.OccurredAt)
	batchIDForAttribution := e.BatchID

	// ── Per-batch attribution: reversal exposure ─────────────────────────────
	if e.VarianceType == "REVERSAL" && batchIDForAttribution != "" {
		if batchErr := s.batchRepo.AtomicAddBatchReversalExposure(
			ctx, batchIDForAttribution, e.TenantID, e.VarianceAmountMinor.Abs(),
		); batchErr != nil {
			log.Printf("HandleVarianceRecord: AtomicAddBatchReversalExposure failed variance=%s batch=%s: %v",
				e.VarianceID, batchIDForAttribution, batchErr)
		}
	}

	// ── Per-batch attribution: variance breakdown (explained vs unexplained) + missing refs
	if e.VarianceType != "OVER_SETTLEMENT" && e.VarianceType != "REVERSAL" && batchIDForAttribution != "" {
		missingRef := e.ProviderRefMissingFlag || e.BankRefMissingFlag
		if batchErr := s.batchRepo.AtomicAddBatchVarianceBreakdown(
			ctx, batchIDForAttribution, e.TenantID,
			e.VarianceAmountMinor.Abs(),
			e.IsWhitelisted,
			missingRef,
		); batchErr != nil {
			log.Printf("HandleVarianceRecord: AtomicAddBatchVarianceBreakdown failed variance=%s batch=%s: %v",
				e.VarianceID, batchIDForAttribution, batchErr)
		}
	}

	// ── Pattern Intelligence: Track OVER_SETTLEMENT separately ───────────────
	// Previously skipped entirely; now recorded for over-settlement pattern detection.
	if e.VarianceType == "OVER_SETTLEMENT" {
		if err := s.projRepo.AtomicRecordOverSettlement(
			ctx, e.TenantID, e.VarianceAmountMinor.Abs(), window.start, window.end,
		); err != nil {
			log.Printf("HandleVarianceRecord: AtomicRecordOverSettlement failed variance=%s: %v",
				e.VarianceID, err)
		}
	}

	// Skip OVER_SETTLEMENT — it's not leakage (we received more, not less).
	// Also skip OVER_SETTLEMENT in the ML features to avoid label contamination.
	if e.VarianceType != "OVER_SETTLEMENT" {
		// Use the absolute variance amount. VarianceAmountMinor from Service 5C
		// is already the absolute difference (intended - settled).
		varianceMinor := e.VarianceAmountMinor
		if varianceMinor.IsNegative() {
			varianceMinor = varianceMinor.Neg() // ensure positive for leakage calculation
		}

		if err := s.projRepo.AtomicRecordVariance(
			ctx,
			e.TenantID,
			e.VarianceType,
			varianceMinor,
			e.IntendedAmountMinor,
			e.IsWhitelisted,
			window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleVarianceRecord AtomicRecordVariance variance=%s: %w",
				e.VarianceID, err)
		}

		// ── P7: Track value-date mismatch count ───────────────────────────
		// VALUE_DATE_MISMATCH is a timing-only variance: the settlement arrived
		// on a different value date than intended. It is already recorded in
		// AtomicRecordVariance (non-reversal path with zero amount), but we
		// also keep a dedicated counter in the leakage projection for P7 rate.
		if e.VarianceType == "VALUE_DATE_MISMATCH" {
			if err := s.projRepo.AtomicIncrementValueDateMismatch(
				ctx, e.TenantID, window.start, window.end,
			); err != nil {
				log.Printf("HandleVarianceRecord: AtomicIncrementValueDateMismatch failed variance=%s: %v",
					e.VarianceID, err)
			}
		}

		// Recompute leakage intelligence snapshot
		if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
			log.Printf("HandleVarianceRecord: leakageSvc failed variance=%s: %v",
				e.VarianceID, err)
		}

		// Recompute recommendations (leakage changed)
		if err := s.recommendationSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
			log.Printf("HandleVarianceRecord: recommendationSvc failed variance=%s: %v",
				e.VarianceID, err)
		}

		// ── D7: Weak evidence tracking ────────────────────────────────────────
		if e.EvidenceGapFlag {
			if err := s.projRepo.AtomicIncrementDefensibilityWeakEvidence(
				ctx, e.TenantID, window.start, window.end,
			); err != nil {
				log.Printf("HandleVarianceRecord: AtomicIncrementDefensibilityWeakEvidence failed variance=%s: %v",
					e.VarianceID, err)
			}
		}

		// ── P6: Settlement delay P95 + P50 accumulation ──────────────────────
		// Extended to also compute P50 (median) alongside the existing P95.
		if e.SettlementDelayDays > 0 {
			if err := s.projRepo.AtomicAppendPatternP6WithP50(
				ctx, e.TenantID, e.SettlementDelayDays, window.start, window.end,
			); err != nil {
				log.Printf("HandleVarianceRecord: AtomicAppendPatternP6WithP50 failed variance=%s: %v",
					e.VarianceID, err)
			}
		}

		// ── Pattern Intelligence: Cross-period tracking ───────────────────────
		if e.CrossPeriodFlag {
			if err := s.projRepo.AtomicIncrementCrossPeriod(
				ctx, e.TenantID, window.start, window.end,
			); err != nil {
				log.Printf("HandleVarianceRecord: AtomicIncrementCrossPeriod failed variance=%s: %v",
					e.VarianceID, err)
			}
		}

		// ── Pattern Intelligence: Whitelisted deduction tracking ─────────────
		// Record whitelisted deduction amounts separately so the dashboard can
		// distinguish "expected PSP fees" from genuine unexplained leakage.
		if e.IsWhitelisted && varianceMinor.IsPositive() {
			if err := s.projRepo.AtomicRecordWhitelistedDeduction(
				ctx, e.TenantID, varianceMinor, window.start, window.end,
			); err != nil {
				log.Printf("HandleVarianceRecord: AtomicRecordWhitelistedDeduction failed variance=%s: %v",
					e.VarianceID, err)
			}
		}

		// NOTE: Provider/source grouping for variance patterns comes exclusively from
		// CanonicalSettlementCreatedEvent (5B) via HandleSettlementCreated.
		// VarianceRecordCreatedEvent (5C) does not carry provider/source fields.
	}

	// Trigger policy evaluation for P_LEAKAGE_UNDER_SETTLEMENT
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "variance.record.created", e.EventID,
	); err != nil {
		log.Printf("HandleVarianceRecord: EvaluateForEvent failed variance=%s: %v",
			e.VarianceID, err)
	}

	log.Printf("HandleVarianceRecord: variance_id=%s type=%s amount=%s corridor=%s batch=%s intended=%s settled=%s reason=%s whitelisted=%v cross_period=%v tenant=%s",
		e.VarianceID, e.VarianceType, e.VarianceAmountMinor, e.CorridorID, e.BatchID, e.IntendedAmountMinor, e.SettledAmountMinor, e.DeductionReason, e.IsWhitelisted, e.CrossPeriodFlag, e.TenantID)

	// Accumulate variance signals into RCA fragment for this intent.
	if batchIDForAttribution != "" && e.IntentID != "" {
		sigV := VarianceSignals{
			VarianceType:        e.VarianceType,
			AmountVarianceMinor: e.VarianceAmountMinor.IntPart(),
			ValueDateMismatch:   e.ExpectedValueDate != "" && e.ActualValueDate != "" && e.ExpectedValueDate != e.ActualValueDate,
			CrossPeriodFlag:     e.CrossPeriodFlag,
		}
		if err := s.rcaSvc.AccumulateVarianceFragment(ctx, e.TenantID, batchIDForAttribution, e.IntentID, sigV); err != nil {
			log.Printf("HandleVarianceRecord: AccumulateVarianceFragment failed variance=%s: %v", e.VarianceID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleVarianceRecord MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[variance.record.created] STORED OK event_id=%s tenant=%s variance=%s type=%s amount=%s whitelisted=%v batch=%s",
		e.EventID, e.TenantID, e.VarianceID, e.VarianceType, e.VarianceAmountMinor, e.IsWhitelisted, e.BatchID)
	return nil
}

// HandleBatchSummaryUpdated processes a batch summary event from Service 5C.
//
// PHASE 4 LOGIC:
// 1. Update batch.health.{batch_id} projection — time-series history for trend queries.
// 2. Compute PATTERN intelligence snapshot (batch risk score, signals, tier).
// 3. Trigger policy evaluation for P_AMBIGUITY_BATCH_REVIEW and P_PATTERN_BATCH_RISK.
func (s *ProjectionService) HandleBatchSummaryUpdated(
	ctx context.Context,
	e models.BatchSummaryUpdatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.BatchID == "" {
		log.Printf("HandleBatchSummaryUpdated: missing required fields tenant=%s event_id=%s batch_id=%s",
			e.TenantID, e.EventID, e.BatchID)
		return nil
	}

	log.Printf("[batch.summary.updated] RECEIVED event_id=%s tenant=%s batch=%s status=%s total=%d intended=%s ambiguity=%.2f original_settled=%s ambiguous_count=%d ambiguous_amount=%s conflicted_count=%d conflicted_amount=%s unresolved_count=%d unresolved_intended_amount=%s",
		e.EventID, e.TenantID, e.BatchID, e.BatchFinalityStatus, e.TotalCount, e.TotalIntendedAmountMinor, e.AmbiguityScore, e.OriginalSettledAmountMinor,
		e.AmbiguousCount, e.AmbiguousAmount, e.ConflictedCount, e.ConflictedAmount, e.UnresolvedCount, e.UnresolvedIntendedAmount)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[batch.summary.updated] SKIPPED duplicate event_id=%s tenant=%s batch=%s",
			e.EventID, e.TenantID, e.BatchID)
		return nil
	}
	log.Printf(
		"HandleBatchSummaryUpdated tenant_id=%s event_id=%s batch_id=%s occurred_at=%s trace_id=%s source_reference=%s corridor_id=%s total_count=%d success_count=%d failed_count=%d pending_count=%d reversed_count=%d partial_recon_count=%d total_intended_amount_minor=%s total_confirmed_amount_minor=%s total_variance_minor=%s ambiguity_score=%f match_confidence=%f batch_finality_status=%s original_settled_amount_minor=%s total_intent_count = %d matched_intent_count = %d unresolved_intent_count = %d orphan_observation_count = %d exact_match_count = %d high_confidence_count = %d ambiguous_count = %d ambiguous_amount = %s conflicted_count = %d conflicted_amount = %s unresolved_count = %d unresolved_intended_amount = %s original_intended_amount = %s matched_intended_amount = %s matched_observed_amount = %s orphan_observed_amount = %s matched_pair_variance = %s net_batch_delta = %s intent_count_coverage = %f intent_value_coverage = %f observed_count_allocation_coverage = %f observed_value_allocation_coverage = %f",
		e.TenantID,
		e.EventID,
		e.BatchID,
		e.OccurredAt,
		e.TraceID,
		e.SourceReference,
		e.CorridorID,
		e.TotalCount,
		e.SuccessCount,
		e.FailedCount,
		e.PendingCount,
		e.ReversedCount,
		e.PartialReconCount,
		e.TotalIntendedAmountMinor.String(),
		e.TotalConfirmedAmountMinor.String(),
		e.TotalVarianceMinor.String(),
		e.AmbiguityScore,
		e.MatchConfidence,
		e.BatchFinalityStatus,
		e.OriginalSettledAmountMinor.String(),
		e.TotalIntentCount,
		e.MatchedIntentCount,
		e.UnresolvedIntentCount,
		e.OrphanObservationCount,
		e.ExactMatchCount,
		e.HighConfidenceCount,
		e.AmbiguousCount,
		e.AmbiguousAmount.String(),
		e.ConflictedCount,
		e.ConflictedAmount.String(),
		e.UnresolvedCount,
		e.UnresolvedIntendedAmount.String(),
		e.OriginalIntendedAmount.String(),
		e.MatchedIntendedAmount.String(),
		e.MatchedObservedAmount.String(),
		e.OrphanObservedAmount.String(),
		e.MatchedPairVariance.String(),
		e.NetBatchDelta.String(),
		e.IntentCountCoverage,
		e.IntentValueCoverage,
		e.ObservationCountCoverage,
		e.ObservationValueCoverage,
	)
	occurredAt := e.OccurredAt
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}
	window := todayWindow(occurredAt)

	// Step 1: Update batch.health projection (full snapshot replacement) — P1 fields included
	if err := s.projRepo.AtomicUpdateBatchHealthFull(
		ctx,
		e.TenantID,
		e.BatchID,
		e.TotalCount,
		e.SuccessCount,
		e.FailedCount,
		e.PendingCount,
		e.ReversedCount,
		e.PartialReconCount,
		e.TotalIntendedAmountMinor,
		e.TotalConfirmedAmountMinor,
		e.TotalVarianceMinor,
		e.AmbiguityScore,
		e.BatchFinalityStatus,
		e.ExactMatchCount,
		e.HighConfidenceCount,
		e.AmbiguousCount,
		e.UnresolvedCount,
		e.ConflictedCount,
		e.AggregateScore,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated AtomicUpdateBatchHealthFull batch=%s: %w",
			e.BatchID, err)
	}

	// Issue 10 Fix: Upsert batch to contracts immediately alongside projection window to keep Batch API aligned.
	bc := persistence.BatchContract{
		BatchID:                    e.BatchID,
		TenantID:                   e.TenantID,
		SourceReference:            nil, // Mapped if upstream adds it via Event Schema
		TotalCount:                 e.TotalCount,
		SuccessCount:               e.SuccessCount,
		FailedCount:                e.FailedCount,
		PendingCount:               e.PendingCount,
		ReversedCount:              e.ReversedCount,
		PartialReconCount:          e.PartialReconCount,
		TotalIntendedAmountMinor:   e.TotalIntendedAmountMinor,
		TotalConfirmedAmountMinor:  e.TotalConfirmedAmountMinor,
		OriginalSettledAmountMinor: e.OriginalSettledAmountMinor,
		TotalVarianceMinor:         e.TotalVarianceMinor,
		BatchFinalityStatus:        e.BatchFinalityStatus,
		AmbiguityScore:             &e.AmbiguityScore,
		MatchConfidence:            &e.MatchConfidence,
		TotalIntentCount:           e.TotalIntentCount,
		MatchedIntentCount:         e.MatchedIntentCount,
		AmbiguousCount:             e.AmbiguousCount,
		UnresolvedIntentCount:      e.UnresolvedCount,
		ConflictedCount:            e.ConflictedCount,
		OrphanObservationCount:     e.OrphanObservationCount,
		OriginalIntendedAmountMinor: e.OriginalIntendedAmount,
		AmbiguousAmountMinor:       e.AmbiguousAmount,
		UnresolvedIntendedAmountMinor: e.UnresolvedIntendedAmount,
		ConflictedAmountMinor:      e.ConflictedAmount,
		OrphanObservedAmountMinor:  e.OrphanObservedAmount,
		NetBatchDeltaMinor:         e.NetBatchDelta,
		IntentCountCoverage:        e.IntentCountCoverage,
		IntentValueCoverage:        e.IntentValueCoverage,
		ObservedCountAllocationCoverage: e.ObservationCountCoverage,
		ObservedValueAllocationCoverage: e.ObservationValueCoverage,
		LastUpdatedAt:              time.Now(),
		CreatedAt:                  time.Now(),
	}
	if err := s.batchRepo.Upsert(ctx, bc); err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated batchRepo.Upsert batch=%s: %w", e.BatchID, err)
	}

	// Capture one immutable leakage feature row once the batch reaches the
	// canonicalized summary stage. We only attempt inference for genuinely
	// pre-settlement summaries, so finalized batches never get a late forecast.
	if s.leakagePredSvc != nil {
		allowPrediction := !isTerminalBatchFinalityStatus(e.BatchFinalityStatus) &&
			e.TotalConfirmedAmountMinor.LessThanOrEqual(decimal.Zero) &&
			e.OriginalSettledAmountMinor.LessThanOrEqual(decimal.Zero)
		s.leakagePredSvc.CaptureBatchOnce(ctx, e.TenantID, e.BatchID, window.start, window.end, allowPrediction)
	}

	// If batch reached a terminal state, the true ambiguity outcome is now known.
	// Feed it back to the LR model as a labeled training example (online SGD).
	if e.BatchFinalityStatus == "FULLY_SETTLED" || e.BatchFinalityStatus == "FAILED" {
		s.ambiguitySvc.TrainOnLabel(ctx, e.TenantID, e.BatchID, e.AmbiguityScore, window.start, window.end)
	}
	if e.BatchFinalityStatus == "FULLY_SETTLED" || e.BatchFinalityStatus == "FAILED" || e.BatchFinalityStatus == "CLOSED" || e.PendingCount == 0 {
		if s.leakagePredSvc != nil {
			s.leakagePredSvc.TrainOnLabel(ctx, e.TenantID, e.BatchID)
		}
	}

	// Step 2: Compute PATTERN intelligence snapshot
	if err := s.patternSvc.ComputeAndSave(ctx, e.TenantID, e.BatchID, window.start, window.end); err != nil {
		log.Printf("HandleBatchSummaryUpdated: patternSvc failed batch=%s: %v", e.BatchID, err)
	}

	// Step 2b: Compute DEFENSIBILITY snapshot and stamp batch_contracts.defensibility_tier.
	// batchRepo.Upsert above guarantees the row exists, so SetDefensibilityTier UPDATE succeeds.
	if err := s.defensibilitySvc.ComputeAndSave(ctx, e.TenantID, e.BatchID, window.start, window.end); err != nil {
		log.Printf("HandleBatchSummaryUpdated: defensibilitySvc failed batch=%s: %v", e.BatchID, err)
	}

	if leakage, err := s.projRepo.GetLeakageSummary(ctx, e.TenantID); err != nil {
		log.Printf("HandleBatchSummaryUpdated: leakage denominator check failed batch=%s: %v", e.BatchID, err)
	} else if leakage != nil && leakage.TotalIntendedAmountMinor.IsPositive() {
		if !leakage.TotalIntendedAmountMinor.Equal(e.TotalIntendedAmountMinor) {
			log.Printf("HandleBatchSummaryUpdated: leakage denominator mismatch batch=%s batch_summary_total=%s leakage_total=%s tenant=%s",
				e.BatchID, e.TotalIntendedAmountMinor, leakage.TotalIntendedAmountMinor, e.TenantID)
		} else {
			log.Printf("HandleBatchSummaryUpdated: leakage denominator aligned batch=%s total=%s tenant=%s",
				e.BatchID, e.TotalIntendedAmountMinor, e.TenantID)
		}
	}

	// Step 3: Trigger policy evaluation
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "batch.summary.updated", e.EventID,
	); err != nil {
		log.Printf("HandleBatchSummaryUpdated: EvaluateForEvent failed batch=%s: %v", e.BatchID, err)
	}

	log.Printf("HandleBatchSummaryUpdated: batch_id=%s status=%s total=%d pending=%d variance=%s ambiguity=%.2f tenant=%s",
		e.BatchID, e.BatchFinalityStatus, e.TotalCount, e.PendingCount,
		e.TotalVarianceMinor, e.AmbiguityScore, e.TenantID)

	// Trigger HDBSCAN RCA clustering after all batch signals are accumulated.
	// Non-fatal: a clustering failure never blocks batch finality processing.
	if err := s.rcaSvc.ComputeAndSaveGradeA(
		ctx, e.TenantID, e.BatchID, e.BatchFinalityStatus, window.start, window.end,
	); err != nil {
		log.Printf("HandleBatchSummaryUpdated: rcaSvc.ComputeAndSaveGradeA failed batch=%s: %v", e.BatchID, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[batch.summary.updated] STORED OK event_id=%s tenant=%s batch=%s status=%s total=%d success=%d failed=%d pending=%d ambiguity=%.2f ambiguous_count=%d ambiguous_amount=%s conflicted_count=%d conflicted_amount=%s unresolved_count=%d unresolved_intended_amount=%s",
		e.EventID, e.TenantID, e.BatchID, e.BatchFinalityStatus,
		e.TotalCount, e.SuccessCount, e.FailedCount, e.PendingCount, e.AmbiguityScore,
		e.AmbiguousCount, e.AmbiguousAmount, e.ConflictedCount, e.ConflictedAmount, e.UnresolvedCount, e.UnresolvedIntendedAmount)
	return nil
}

// HandleGovernanceDecision processes a governance decision from Service 6.
//
// PHASE 4 LOGIC:
// Every governance decision updates the DEFENSIBILITY intelligence layer.
// This is the critical audit-grade signal: "did a human or system approve
// this payment with full KYC/AML checks, and is the evidence replayable?"
//
// Steps:
//
//  1. AtomicRecordGovernanceCoverage → increments governance coverage counters
//     (with_governance_decision, with_kyc_checked, with_aml_checked,
//     with_replay_equivalence, governance_approved/rejected/escalated counts)
//
//  2. Recompute DEFENSIBILITY snapshot → updated audit_ready_pct,
//     defensibility_tier, compliance alerts
//
//  3. Recompute RECOMMENDATION snapshot → compliance alerts surface as cards
//
//  4. Trigger policy evaluation → P_DEFENSIBILITY_AUDIT_RISK may fire
//     if audit_ready_pct drops below 80%
//
// REJECTED governance decisions are the most critical compliance signal.
// They are flagged in both the defensibility snapshot AND the policy engine.
func (s *ProjectionService) HandleGovernanceDecision(
	ctx context.Context,
	e models.GovernanceDecisionCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.IntentID == "" {
		log.Printf("HandleGovernanceDecision: missing required fields tenant=%s event_id=%s intent_id=%s",
			e.TenantID, e.EventID, e.IntentID)
		return nil
	}

	log.Printf("[governance.decision.created] RECEIVED event_id=%s tenant=%s gdec=%s intent=%s outcome=%s kyc=%v aml=%v replay=%v",
		e.EventID, e.TenantID, e.GovernanceDecisionID, e.IntentID, e.DecisionOutcome, e.KYCChecked, e.AMLChecked, e.ReplayEquivalent)

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleGovernanceDecision IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		log.Printf("[governance.decision.created] SKIPPED duplicate event_id=%s tenant=%s gdec=%s",
			e.EventID, e.TenantID, e.GovernanceDecisionID)
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Step 1: Update DEFENSIBILITY projection with this governance decision.
	// This is the primary atomic write — must succeed before snapshot computation.
	if err := s.projRepo.AtomicRecordGovernanceCoverage(
		ctx,
		e.TenantID,
		e.DecisionOutcome,
		e.KYCChecked,
		e.AMLChecked,
		e.ReplayEquivalent,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleGovernanceDecision AtomicRecordGovernanceCoverage gdec=%s: %w",
			e.GovernanceDecisionID, err)
	}

	// Step 2: Recompute DEFENSIBILITY snapshot.
	// Pass batchID from the evidence pack context if available.
	// GovernanceDecisionCreatedEvent doesn't carry a batch_id directly,
	// so we pass empty string (tenant-scoped snapshot only).
	if err := s.defensibilitySvc.ComputeAndSave(
		ctx, e.TenantID, "", window.start, window.end,
	); err != nil {
		log.Printf("HandleGovernanceDecision: defensibilitySvc failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	// Step 3: Recompute RECOMMENDATION snapshot.
	if err := s.recommendationSvc.ComputeAndSave(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		log.Printf("HandleGovernanceDecision: recommendationSvc failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	// Step 4: Trigger policy evaluation.
	// Topic "governance.decision.created" fires P_DEFENSIBILITY_AUDIT_RISK
	// and P_DEFENSIBILITY_EVIDENCE_WEAK.
	// corridorID is not applicable for governance decisions (tenant-scoped).
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, "", "governance.decision.created", e.EventID,
	); err != nil {
		log.Printf("HandleGovernanceDecision: EvaluateForEvent failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	log.Printf("HandleGovernanceDecision: gdec_id=%s intent=%s outcome=%s kyc=%v aml=%v replay=%v tenant=%s",
		e.GovernanceDecisionID, e.IntentID, e.DecisionOutcome,
		e.KYCChecked, e.AMLChecked, e.ReplayEquivalent, e.TenantID)

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleGovernanceDecision MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	log.Printf("[governance.decision.created] STORED OK event_id=%s tenant=%s gdec=%s intent=%s outcome=%s",
		e.EventID, e.TenantID, e.GovernanceDecisionID, e.IntentID, e.DecisionOutcome)
	return nil
}

// ── Attachment readiness classifier ──────────────────────────────────────────
//
// Service 5B now emits AttachmentReadiness as a float64 score (0.0–1.0).
// ZPI owns the threshold classification. Thresholds are named constants so
// that a single change here propagates everywhere without hunting magic numbers.
//
// Thresholds (agreed with Service 5B on 2026-05-06):
//   > 0.6  → READY   : enough carriers to auto-attach with high confidence
//   > 0.3  → PARTIAL : some carriers present, may need human review
//   ≤ 0.3  → POOR    : insufficient carriers, orphan settlement risk

const (
	attachReadinessReadyThreshold   = 0.6
	attachReadinessPartialThreshold = 0.3
)

// classifyAttachmentReadiness maps a 0.0–1.0 score from Service 5B into one
// of three tiers used by ZPI's leakage and pattern intelligence layers.
func classifyAttachmentReadiness(score float64) string {
	switch {
	case score > attachReadinessReadyThreshold:
		return "READY"
	case score > attachReadinessPartialThreshold:
		return "PARTIAL"
	default:
		return "POOR"
	}
}

// ── Carrier richness classifier ───────────────────────────────────────────────
//
// carrier_richness is a float64 score (0.0–1.0) that measures what fraction
// of the five carrier reference fields (UTR, RRN, BankRef, ProviderRef,
// ClientRef) are populated in the settlement observation from Service 5B.
//
//   score = count(non-null carriers) / 5
//
// ZPI classifies this into three tiers. Thresholds are named constants so
// any recalibration is a single-line change with immediate test coverage.
//
// Thresholds (agreed with Service 5B on 2026-05-06):
//   > 0.6  → RICH    : 3–5 carriers present, attachment can proceed confidently
//   > 0.3  → PARTIAL : 1–2 carriers present, human review may be needed
//   ≤ 0.3  → POOR    : 0–1 carriers present, high ambiguity risk at attachment time

const (
	carrierRichnessRichThreshold    = 0.6
	carrierRichnessPartialThreshold = 0.3
)

// classifyCarrierRichness maps a 0.0–1.0 score from Service 5B into a tier.
// The tier is used in HandleSettlementCreated to emit an early ambiguity warning
// before Service 5C's attachment decision arrives.
func classifyCarrierRichness(score float64) string {
	switch {
	case score > carrierRichnessRichThreshold:
		return "RICH"
	case score > carrierRichnessPartialThreshold:
		return "PARTIAL"
	default:
		return "POOR"
	}
}

func deriveLeakageProviderAndRail(corridorID, providerHint, sourceSystem string) (string, string) {
	corridorID = strings.TrimSpace(corridorID)
	providerHint = strings.TrimSpace(providerHint)
	sourceSystem = strings.TrimSpace(sourceSystem)

	var providerKey string
	var rail string

	if corridorID != "" && !strings.EqualFold(corridorID, "UNKNOWN") {
		parts := strings.Split(corridorID, ".")
		if len(parts) >= 2 {
			providerKey = strings.ToLower(strings.TrimSpace(parts[0]))
			rail = strings.ToUpper(strings.TrimSpace(parts[len(parts)-1]))
		} else {
			rail = strings.ToUpper(corridorID)
		}
	}

	if providerKey == "" && providerHint != "" {
		hintUpper := strings.ToUpper(providerHint)
		if !strings.Contains(hintUpper, "RAIL") &&
			hintUpper != "UPI" &&
			hintUpper != "IMPS" &&
			hintUpper != "NEFT" &&
			hintUpper != "RTGS" &&
			hintUpper != "BANK" {
			providerKey = strings.ToLower(providerHint)
		}
	}

	if providerKey == "" && sourceSystem != "" {
		providerKey = strings.ToLower(sourceSystem)
	}

	if rail == "" && providerHint != "" {
		hintUpper := strings.ToUpper(providerHint)
		switch {
		case strings.Contains(hintUpper, "UPI"):
			rail = "UPI"
		case strings.Contains(hintUpper, "IMPS"):
			rail = "IMPS"
		case strings.Contains(hintUpper, "NEFT"):
			rail = "NEFT"
		case strings.Contains(hintUpper, "RTGS"):
			rail = "RTGS"
		case strings.Contains(hintUpper, "BANK"):
			rail = "BANK"
		}
	}

	if providerKey == "" {
		providerKey = "UNKNOWN"
	}
	if rail == "" {
		rail = "UNKNOWN"
	}
	return providerKey, rail
}

func isTerminalBatchFinalityStatus(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "FULLY_SETTLED", "PARTIALLY_SETTLED", "FAILED", "REQUIRES_REVIEW", "CLOSED":
		return true
	default:
		return false
	}
}
