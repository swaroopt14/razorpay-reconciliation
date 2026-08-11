package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT ENGINE
//
// FIXES APPLIED IN THIS FILE:
//
//   FIX #2  — IntentValueCoverage was always 1.0 because matchedIntendedAmount
//              was accumulated for matched intents only but then used as both
//              numerator AND total. Renamed accumulator; coverage now correct.
//
//   FIX #3  — Replay did not clean up stale orphan/ambiguous/conflicted/unresolved
//              records for the job. DELETE statements now run at the top of
//              persistAttachmentOutputs inside the transaction before any INSERT.
//
//   FIX #5  — loadObservationsByBatch referenced non-existent column
//              LOWER(settlement_batch_id). Removed; only batch_reference and
//              client_batch_id are used.
//
//   FIX #6  — Advisory lock was acquired on a pinned connection (lockConn) but
//              all engine queries ran through the pool (db.DB), making the lock
//              ineffective. Replaced with pg_try_advisory_xact_lock inside the
//              persistence transaction so it is connection-agnostic and
//              auto-released at commit/rollback.
//
//   FIX #7  — N+1 query: findCandidateObservations was called once per intent
//              (10 000 DB round-trips for a 10 000-intent batch). Replaced with
//              findAllCandidateObservationsBatch which issues one query for all
//              intents and distributes results in-memory via isCandidate.
//
//   FIX #10 — AttachmentOutboxService re-fetched canonical_intents that the
//              engine already held in memory. Engine now builds and passes an
//              intentMap to the outbox service; the redundant DB query is gone.
//
//   FIX #15 — GovernanceState was never checked. Intents in CANCELLED / EXPIRED /
//              REJECTED / VOIDED are now short-circuited to MATCH_UNRESOLVED
//              with reason GOVERNANCE_STATE_NON_ATTACHABLE before scoring.
//
//   FIX #19 — Dead function insertAttachmentJob removed.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/kafka"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
)

// AttachmentEngine is the main service struct for Service 5C.
type AttachmentEngine struct{}
type VectorIndexPublisher interface {
	PublishVectorIndexRequest(ctx context.Context, event kafka.VectorIndexRequestEvent) error
}

var vectorIndexPublisher VectorIndexPublisher

func SetVectorIndexPublisher(p VectorIndexPublisher) {
	vectorIndexPublisher = p
}

func emitOutcomeBatchSummaryVectorIndex(batchSummary models.BatchAttachmentSummary) {
	if vectorIndexPublisher == nil {
		return
	}

	tenantID := strings.TrimSpace(batchSummary.TenantID.String())
	entityID := strings.TrimSpace(batchSummary.BatchAttachmentSummaryID.String())
	batchID := ""
	if batchSummary.BatchID != nil {
		batchID = strings.TrimSpace(*batchSummary.BatchID)
	}

	if tenantID == "" || entityID == "" {
		return
	}

	event := kafka.VectorIndexRequestEvent{
		EventID:         uuid.NewString(),
		SchemaVersion:   models.SchemaVersionV1,
		EventType:       kafka.VectorIndexEventRequested,
		SourceService:   "zord-outcome-engine",
		SourceEventType: "batch_attachment_summary.saved.v1",
		TenantID:        tenantID,
		EntityType:      "outcome_batch_summary",
		EntityID:        entityID,
		BatchID:         batchID,
		Operation:       kafka.VectorIndexOperationUpsert,
		OccurredAt:      time.Now().UTC(),
		ContentVersion:  "v1",
		Metadata: map[string]string{
			"batch_status": batchSummary.BatchAttachmentStatus,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := vectorIndexPublisher.PublishVectorIndexRequest(ctx, event); err != nil {
		log.Printf("[outcome-engine][vector-index] publish failed tenant=%s entity=outcome_batch_summary id=%s err=%v", tenantID, entityID, err)
		return
	}

	log.Printf("[outcome-engine][vector-index] publish ok tenant=%s entity=outcome_batch_summary id=%s", tenantID, entityID)
}

// nonAttachableGovernanceStates lists governance states for which no attachment
// attempt should be made. The intent is already terminal.
// FIX #15
var nonAttachableGovernanceStates = map[string]bool{
	"CANCELLED": true,
	"EXPIRED":   true,
	"REJECTED":  true,
	"VOIDED":    true,
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

func (e *AttachmentEngine) RunForBatch(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
	preRegisteredJobID uuid.UUID,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=INTENT_BATCH tenant=%s batch_ref=%s job=%s",
		tenantID, batchRef, preRegisteredJobID)

	intentMap, err := loadMasterIntentsByBatchRef(ctx, tenantID, batchRef)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForBatch: load intents: %w", err)
	}
	if len(intentMap) == 0 {
		return nil, fmt.Errorf("attachment.RunForBatch: no intents found for batch_ref=%s", batchRef)
	}

	intents := make([]models.CanonicalIntent, 0, len(intentMap))
	for _, intent := range intentMap {
		intents = append(intents, intent)
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSettlementBatch, batchRef, intents, preRegisteredJobID)
}

func (e *AttachmentEngine) RunForJob(
	ctx context.Context,
	tenantID uuid.UUID,
	ingestRunID string,
	preRegisteredJobID uuid.UUID,
) (*models.AttachmentJob, error) {
	ingestRunID = strings.TrimSpace(ingestRunID)
	if ingestRunID == "" {
		return nil, fmt.Errorf("attachment.RunForJob: ingest_run_id is required")
	}

	log.Printf("attachment.engine.start scope=INGEST_RUN tenant=%s ingest_run_id=%s job=%s",
		tenantID, ingestRunID, preRegisteredJobID)

	observations, err := loadObservationsByJobID(ctx, tenantID, ingestRunID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForJob: load observations: %w", err)
	}
	if len(observations) == 0 {
		return nil, fmt.Errorf("attachment.RunForJob: no observations found for ingest_run_id=%s", ingestRunID)
	}

	intentMap, err := loadIntentsForIngestRunObservations(ctx, tenantID, observations)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForJob: load intents: %w", err)
	}
	if len(intentMap) == 0 {
		return nil, fmt.Errorf("attachment.RunForJob: no intents found for ingest_run_id=%s", ingestRunID)
	}

	intents := make([]models.CanonicalIntent, 0, len(intentMap))
	for _, intent := range intentMap {
		intents = append(intents, intent)
	}
	sort.Slice(intents, func(i, j int) bool {
		return intents[i].IntentID.String() < intents[j].IntentID.String()
	})

	return e.runAttachment(ctx, tenantID, models.JobScopeIngestRun, ingestRunID, intents, preRegisteredJobID)
}

func (e *AttachmentEngine) RunForSingleIntent(
	ctx context.Context,
	tenantID uuid.UUID,
	intentID uuid.UUID,
	preRegisteredJobID uuid.UUID,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=SINGLE_INTENT tenant=%s intent=%s job=%s",
		tenantID, intentID, preRegisteredJobID)

	intent, err := loadIntentByID(ctx, tenantID, intentID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForSingleIntent: %w", err)
	}

	scopeRef := intentID.String()
	if intent.ClientBatchRef != nil && *intent.ClientBatchRef != "" {
		scopeRef = *intent.ClientBatchRef
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSingleIntent, scopeRef,
		[]models.CanonicalIntent{*intent}, preRegisteredJobID)
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

func (e *AttachmentEngine) runAttachment(
	ctx context.Context,
	tenantID uuid.UUID,
	scopeType string,
	scopeRef string,
	intents []models.CanonicalIntent,
	preRegisteredJobID uuid.UUID,
) (*models.AttachmentJob, error) {

	// FIX #6: advisory lock is now acquired INSIDE the persistence transaction
	// via pg_try_advisory_xact_lock so it works correctly with the connection
	// pool. The old lockConn pattern is removed entirely.
	lockKey := advisoryLockKey(tenantID, scopeType+"|"+scopeRef)

	profile, err := loadRuleProfile(ctx, tenantID)
	if err != nil {
		log.Printf("attachment.engine.no_profile tenant=%s err=%v — using defaults", tenantID, err)
		profile = defaultRuleProfile(tenantID)
	}
	policy := parseRuleProfile(profile)

	now := time.Now().UTC()
	job := &models.AttachmentJob{
		AttachmentJobID:        preRegisteredJobID,
		TenantID:               tenantID,
		JobScopeType:           scopeType,
		ScopeRef:               scopeRef,
		MatchingRulesetVersion: RulesetVersion,
		Status:                 "RUNNING",
		CreatedAt:              now,
		StartedAt:              &now,
	}

	// ── Reverse scan: load master observation list ────────────────────────────
	var masterObservationMap map[uuid.UUID]models.CanonicalSettlementObservation
	switch scopeType {
	case models.JobScopeSettlementBatch:
		masterObservationMap, err = loadMasterObservationsByBatchRef(ctx, tenantID, scopeRef)
		if err != nil {
			log.Printf("attachment.engine.master_obs_load_warn job=%s err=%v", job.AttachmentJobID, err)
			masterObservationMap = map[uuid.UUID]models.CanonicalSettlementObservation{}
		}
	case models.JobScopeIngestRun:
		observations, loadErr := loadObservationsByJobID(ctx, tenantID, scopeRef)
		if loadErr != nil {
			log.Printf("attachment.engine.master_obs_load_warn job=%s ingest_run_id=%s err=%v",
				job.AttachmentJobID, scopeRef, loadErr)
			masterObservationMap = map[uuid.UUID]models.CanonicalSettlementObservation{}
		} else {
			masterObservationMap = make(map[uuid.UUID]models.CanonicalSettlementObservation, len(observations))
			for _, obs := range observations {
				masterObservationMap[obs.SettlementObservationID] = obs
			}
		}
	default:
		masterObservationMap = map[uuid.UUID]models.CanonicalSettlementObservation{}
	}

	matchedObservationIDs := make(map[uuid.UUID]bool)
	obsDecisionTypes := make(map[uuid.UUID][]string)

	var (
		allDecisions  []models.AttachmentDecision
		allVariances  []models.VarianceRecord
		allCandidates []models.AttachmentCandidate
		// FIX #2: renamed from totalIntendedAmount to matchedIntendedAmount.
		// This accumulator only grows when a winner observation is found.
		// It is the correct numerator for IntentValueCoverage.
		matchedIntendedAmount     decimal.Decimal
		clientBatchRef            *string
		claimedObservationIDs     = make(map[uuid.UUID]bool)
		allScannedObservationsMap = make(map[uuid.UUID]models.CanonicalSettlementObservation)
	)

	counters := struct {
		exact, high, ambiguous, unresolved, conflicted int
	}{}

	candidateIngestRunID := ""
	if scopeType == models.JobScopeIngestRun {
		candidateIngestRunID = scopeRef
	}

	// FIX #7: batch-load ALL candidate observations for all intents in one
	// query instead of one query per intent (N+1 → 1).
	allCandidatesMap, err := findAllCandidateObservationsBatch(
		ctx, tenantID, intents, candidateIngestRunID)
	if err != nil {
		return nil, fmt.Errorf("attachment.engine: batch candidate load: %w", err)
	}

	for _, intent := range intents {

		// FIX #15: skip intents in non-attachable governance states.
		if nonAttachableGovernanceStates[intent.GovernanceState] {
			decision := buildUnresolvedDecision(
				tenantID, intent.IntentID, job.AttachmentJobID,
				"GOVERNANCE_STATE_NON_ATTACHABLE",
			)
			allDecisions = append(allDecisions, decision)
			counters.unresolved++
			log.Printf("attachment.engine.governance_skip intent=%s state=%s",
				intent.IntentID, intent.GovernanceState)
			continue
		}

		// FIX #7: use the pre-loaded candidate map; filter excluded IDs in Go.
		rawCandidates := allCandidatesMap[intent.IntentID]
		observations := make([]models.CanonicalSettlementObservation, 0, len(rawCandidates))
		for _, o := range rawCandidates {
			if !claimedObservationIDs[o.SettlementObservationID] {
				observations = append(observations, o)
			}
		}

		for _, obs := range observations {
			allScannedObservationsMap[obs.SettlementObservationID] = obs
		}

		var scored []CandidateScore
		for _, obs := range observations {
			cs := ScoreCandidate(obs, intent, profile)
			cs.SettlementObservationID = obs.SettlementObservationID
			cs.IntentID = intent.IntentID
			scored = append(scored, cs)
		}

		sort.Slice(scored, func(i, j int) bool {
			return scored[i].Total > scored[j].Total
		})

		decisionType, reasonCode := SelectDecisionType(scored, profile)

		if len(scored) > 0 {
			scored[0].ConfidenceBucket = ClassifyConfidenceContext(
				scored[0], scored, policy.ManualReviewThresholds)
			for i := 1; i < len(scored); i++ {
				singleRanked := []CandidateScore{scored[i]}
				scored[i].ConfidenceBucket = ClassifyConfidenceContext(
					scored[i], singleRanked, policy.ManualReviewThresholds)
			}
		}

		candidates := buildCandidateRows(tenantID, job.AttachmentJobID, intent.IntentID, scored, observations)
		allCandidates = append(allCandidates, candidates...)

		var topObs models.CanonicalSettlementObservation
		if len(scored) > 0 {
			for _, o := range observations {
				if o.SettlementObservationID == scored[0].SettlementObservationID {
					topObs = o
					break
				}
			}
		}

		ambiguityScore := ComputeAmbiguityScore(scored, decisionType, topObs, policy)

		var (
			winnerObsID   *uuid.UUID
			winningScore  float64
			runnerUpScore *float64
			scoreMargin   *float64
			confScore     float64
			matchConf     float64
			relMargin     *float64
		)

		if len(scored) > 0 {
			topID := scored[0].SettlementObservationID
			winnerObsID = &topID
			winningScore = scored[0].Total
			confScore = ComputeConfidenceScore(scored[0], decisionType, scored, topObs, policy)
			matchConf = ComputeMatchConfidence(scored[0])
		}

		if decisionType == models.DecisionMatchAmbiguous ||
			decisionType == models.DecisionMatchConflicted ||
			decisionType == models.DecisionMatchUnresolved {
			winnerObsID = nil
		}

		if winnerObsID != nil && claimedObservationIDs[*winnerObsID] {
			log.Printf("attachment.engine.double_match_detected intent=%s obs=%s - demoting to AMBIGUOUS",
				intent.IntentID, *winnerObsID)
			decisionType = models.DecisionMatchAmbiguous
			reasonCode = "OBSERVATION_ALREADY_CLAIMED_IN_JOB"
			winnerObsID = nil
		}

		if len(scored) > 1 {
			s := scored[1].Total
			runnerUpScore = &s
			m := winningScore - s
			scoreMargin = &m
			rm := m / max(winningScore, 1.0)
			relMargin = &rm
		}

		for _, cs := range scored {
			obsID := cs.SettlementObservationID
			obsDecisionTypes[obsID] = append(obsDecisionTypes[obsID], decisionType)
		}

		if winnerObsID != nil &&
			(decisionType == models.DecisionMatchExact || decisionType == models.DecisionMatchHighConfidence) {
			matchedObservationIDs[*winnerObsID] = true
			claimedObservationIDs[*winnerObsID] = true
		}

		var topScore *CandidateScore
		if len(scored) > 0 {
			topScore = &scored[0]
		}
		var topObsPtr *models.CanonicalSettlementObservation
		if len(scored) > 0 && topObs.SettlementObservationID != uuid.Nil {
			topObsPtr = &topObs
		}
		carriers := buildMatchEvidenceCarriers(intent, topObsPtr, topScore)
		carriersJSON, _ := json.Marshal(carriers)

		candidateSetHash := computeCandidateSetHash(intent.IntentID, RulesetVersion, scored)

		reasonDetail := map[string]interface{}{
			"candidate_count": len(scored),
			"decision_type":   decisionType,
			"reason_code":     reasonCode,
		}
		if len(scored) > 0 {
			reasonDetail["top_score"] = scored[0].Total
			reasonDetail["top_confidence_bucket"] = scored[0].ConfidenceBucket
			reasonDetail["has_hard_conflict"] = scored[0].HasHardConflict
			reasonDetail["has_any_conflict"] = scored[0].HasAnyConflict
			reasonDetail["score_breakdown"] = scored[0].Breakdown
		}
		reasonDetailJSON, _ := json.Marshal(reasonDetail)

		decision := models.AttachmentDecision{
			AttachmentDecisionID:     uuid.New(),
			TenantID:                 tenantID,
			SettlementObservationID:  winnerObsID,
			IntentID:                 intent.IntentID,
			AttachmentJobID:          job.AttachmentJobID,
			DecisionType:             decisionType,
			DecisionReasonCode:       reasonCode,
			DecisionReasonDetailJSON: reasonDetailJSON,
			MatchingRulesetVersion:   RulesetVersion,
			WinningScore:             winningScore,
			RunnerUpScore:            runnerUpScore,
			ScoreMargin:              scoreMargin,
			RelativeScoreMargin:      relMargin,
			ConfidenceScore:          confScore,
			MatchConfidence:          matchConf,
			AmbiguityScore:           ambiguityScore,
			SupportingCarriersJSON:   carriersJSON,
			CandidateSetHash:         candidateSetHash,
			CandidateSetSnapshotRef:  fmt.Sprintf("zord://audit/candidate-snapshots/%s", candidateSetHash),
			CandidateSetSize:         len(scored),
			CreatedAt:                time.Now().UTC(),
			UpdatedAt:                time.Now().UTC(),
		}
		allDecisions = append(allDecisions, decision)

		if winnerObsID != nil {
			var winnerObservation *models.CanonicalSettlementObservation
			for _, o := range observations {
				if o.SettlementObservationID == *winnerObsID {
					winnerObservation = &o
					break
				}
			}
			if winnerObservation != nil {
				if clientBatchRef == nil && intent.ClientBatchRef != nil {
					clientBatchRef = intent.ClientBatchRef
				}
				// FIX #2: accumulate only matched intent amounts here.
				matchedIntendedAmount = matchedIntendedAmount.Add(intent.Amount)

				amtVariance, feeVar, dedVar, severity, flags, reasons := ComputeVariance(VarianceInputs{
					Intent:      intent,
					Observation: *winnerObservation,
				})
				delayDays := computeDelayDays(intent, *winnerObservation)
				reasonsJSON, _ := json.Marshal(reasons)
				varianceType := classifyVarianceType(amtVariance, flags, *winnerObservation)

				vr := models.VarianceRecord{
					VarianceRecordID:        uuid.New(),
					TenantID:                tenantID,
					AttachmentDecisionID:    decision.AttachmentDecisionID,
					IntentID:                intent.IntentID,
					SettlementObservationID: *winnerObsID,
					AmountVariance:          amtVariance,
					FeeVariance:             feeVar,
					DeductionVariance:       dedVar,
					CurrencyMatchFlag:       flags["currency_match"],
					StatusVarianceFlag:      flags["status_variance"],
					ValueDateMismatchFlag:   flags["value_date_mismatch"],
					SettlementDelayDays:     delayDays,
					CrossPeriodFlag:         flags["cross_period"],
					ProviderRefMissingFlag:  flags["provider_ref_missing"],
					BankRefMissingFlag:      flags["bank_ref_missing"],
					EvidenceGapFlag:         flags["evidence_gap"],
					VarianceType:            varianceType,
					VarianceSeverity:        severity,
					VarianceReasonCodesJSON: reasonsJSON,
					IsWhitelisted:           false,
					CreatedAt:               time.Now().UTC(),
				}
				allVariances = append(allVariances, vr)
			}
		}

		switch decisionType {
		case models.DecisionMatchExact:
			counters.exact++
		case models.DecisionMatchHighConfidence:
			counters.high++
		case models.DecisionMatchAmbiguous:
			counters.ambiguous++
		case models.DecisionMatchUnresolved:
			counters.unresolved++
		case models.DecisionMatchConflicted:
			counters.conflicted++
		}
	}

	// ── Reverse scan: orphaned observations ──────────────────────────────────
	var allOrphans []models.OrphanSettlementRecord
	effectiveObservationMap := masterObservationMap
	if len(effectiveObservationMap) == 0 && len(allScannedObservationsMap) > 0 {
		effectiveObservationMap = allScannedObservationsMap
	}

	var originalObservationAmount decimal.Decimal
	obsAmountMap := make(map[uuid.UUID]decimal.Decimal)
	for id, obs := range effectiveObservationMap {
		observedAmount := observedSettlementAmount(obs)
		originalObservationAmount = originalObservationAmount.Add(observedAmount)
		obsAmountMap[id] = observedAmount
	}

	if scopeType == models.JobScopeSettlementBatch || scopeType == models.JobScopeIngestRun {
		if len(effectiveObservationMap) > 0 {
			allOrphans = performReverseScanOrphans(
				tenantID, job.AttachmentJobID, scopeRef,
				effectiveObservationMap, matchedObservationIDs,
				obsDecisionTypes, policy,
			)
		}
	}

	// ── Step 7: Persist all outputs transactionally ───────────────────────────
	ambiguousIntents := buildAmbiguousIntentRecords(tenantID, job.AttachmentJobID, clientBatchRef, intents, allDecisions)
	conflictedIntents := buildConflictedIntentRecords(tenantID, job.AttachmentJobID, clientBatchRef, intents, allDecisions)
	unresolvedIntents := buildUnresolvedIntentRecords(tenantID, job.AttachmentJobID, clientBatchRef, intents, allDecisions)

	// FIX #2: pass matchedIntendedAmount (matched-only) and originalObservationAmount separately.
	batchSummary := computeBatchSummary(
		tenantID, job.AttachmentJobID, scopeRef, clientBatchRef,
		intents, allDecisions, allVariances, allOrphans,
		obsAmountMap, matchedIntendedAmount, originalObservationAmount,
		ambiguousIntents, conflictedIntents,
	)

	// FIX #10: build intentMap once here and pass it into the outbox builder
	// so the outbox service does not need to re-query canonical_intents.
	intentMap := make(map[uuid.UUID]models.CanonicalIntent, len(intents))
	for _, intent := range intents {
		intentMap[intent.IntentID] = intent
	}

	// Build outbox rows in memory BEFORE the transaction so that persistence
	// and event emission are atomic (FIX #1).
	obsMap := make(map[uuid.UUID]*models.CanonicalSettlementObservation)
	var rowRefs []string
	for id, obs := range masterObservationMap {
		o := obs
		obsMap[id] = &o
		if o.SourceRowRef != "" {
			rowRefs = append(rowRefs, o.SourceRowRef)
		}
	}
	for id, obs := range allScannedObservationsMap {
		if _, exists := obsMap[id]; !exists {
			o := obs
			obsMap[id] = &o
			if o.SourceRowRef != "" {
				rowRefs = append(rowRefs, o.SourceRowRef)
			}
		}
	}

	parsedByRowRef, err := loadParsedRowsBySourceRowRefs(ctx, tenantID, rowRefs)
	if err != nil {
		log.Printf("attachment.engine.parsed_rows_load_warn job=%s err=%v", job.AttachmentJobID, err)
		parsedByRowRef = map[string]*models.SettlementParsedRow{}
	}

	// FIX #1: build outbox rows in memory; they will be inserted inside the
	// same transaction as decisions/variances/candidates.
	outboxSvc := &AttachmentOutboxService{}
	outboxRows, leafRows, outboxBuildErr := outboxSvc.BuildOutboxRows(
		ctx, job, allDecisions, allVariances, obsMap, parsedByRowRef, intentMap, batchSummary)
	if outboxBuildErr != nil {
		// Non-fatal: log and continue — persistence of decisions must not be
		// blocked by an outbox build failure.
		log.Printf("attachment.engine.outbox_build_warn job=%s err=%v", job.AttachmentJobID, outboxBuildErr)
	}

	if err := persistAttachmentOutputs(
		ctx, job, lockKey,
		allCandidates, allDecisions, allVariances, allOrphans,
		ambiguousIntents, conflictedIntents, unresolvedIntents,
		batchSummary, outboxRows, leafRows,
		counters.exact, counters.high, counters.ambiguous,
		counters.unresolved, counters.conflicted,
	); err != nil {
		return nil, fmt.Errorf("attachment.engine: persist outputs: %w", err)
	}

	log.Printf("attachment.engine.done job=%s exact=%d high=%d ambiguous=%d unresolved=%d conflicted=%d orphans=%d",
		job.AttachmentJobID, counters.exact, counters.high, counters.ambiguous,
		counters.unresolved, counters.conflicted, len(allOrphans))

	return job, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE SCAN
// ─────────────────────────────────────────────────────────────────────────────

func performReverseScanOrphans(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	batchRef string,
	masterObservationMap map[uuid.UUID]models.CanonicalSettlementObservation,
	matchedObservationIDs map[uuid.UUID]bool,
	obsDecisionTypes map[uuid.UUID][]string,
	policy AttachmentPolicyConfig,
) []models.OrphanSettlementRecord {
	var records []models.OrphanSettlementRecord

	for obsID, obs := range masterObservationMap {
		if matchedObservationIDs[obsID] {
			continue
		}

		reasonCode := "NO_INTENT_FOUND"
		hasAmbiguous, hasConflicted := false, false
		for _, dt := range obsDecisionTypes[obsID] {
			switch dt {
			case models.DecisionMatchAmbiguous:
				hasAmbiguous = true
			case models.DecisionMatchConflicted:
				hasConflicted = true
			}
		}
		switch {
		case hasConflicted:
			reasonCode = "ONLY_CONFLICTED_CANDIDATES_FOUND"
		case hasAmbiguous:
			reasonCode = "ONLY_AMBIGUOUS_CANDIDATES_FOUND"
		}

		batchID := &batchRef
		records = append(records, models.OrphanSettlementRecord{
			OrphanID:                uuid.New(),
			TenantID:                tenantID,
			AttachmentJobID:         jobID,
			SettlementObservationID: obsID,
			BatchID:                 batchID,
			UnresolvedReason:        reasonCode,
			Amount:                  obs.Amount,
			CurrencyCode:            obs.CurrencyCode,
			CreatedAt:               time.Now().UTC(),
		})
	}
	return records
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE DISCOVERY — FIX #7
//
// findAllCandidateObservationsBatch replaces the per-intent
// findCandidateObservations call.  It issues ONE query to fetch all candidate
// observations for all intents in the batch, then distributes them in Go.
//
// Cross-job exclusion is still enforced by the NOT EXISTS subquery against the
// partial index attachment_decisions_obs_tenant_strong_match_idx.
// In-job exclusion is enforced by filtering claimedObservationIDs in the
// caller after this function returns.
// ─────────────────────────────────────────────────────────────────────────────

func findAllCandidateObservationsBatch(
	ctx context.Context,
	tenantID uuid.UUID,
	intents []models.CanonicalIntent,
	ingestRunID string,
) (map[uuid.UUID][]models.CanonicalSettlementObservation, error) {

	if len(intents) == 0 {
		return map[uuid.UUID][]models.CanonicalSettlementObservation{}, nil
	}

	// Collect unique ref sets and the overall time window.
	clientRefSet := make(map[string]struct{})
	batchRefSet := make(map[string]struct{})
	var windowStart, windowEnd time.Time
	first := true

	for _, intent := range intents {
		if intent.ClientPayoutRef != nil && *intent.ClientPayoutRef != "" {
			clientRefSet[strings.ToLower(strings.TrimSpace(*intent.ClientPayoutRef))] = struct{}{}
		}
		if intent.ClientBatchRef != nil && *intent.ClientBatchRef != "" {
			batchRefSet[strings.ToLower(strings.TrimSpace(*intent.ClientBatchRef))] = struct{}{}
		}
		ws, we := intentTimeWindow(intent)
		if first {
			windowStart = ws
			windowEnd = we
			first = false
		} else {
			if ws.Before(windowStart) {
				windowStart = ws
			}
			if we.After(windowEnd) {
				windowEnd = we
			}
		}
	}

	clientRefs := make([]string, 0, len(clientRefSet))
	for r := range clientRefSet {
		clientRefs = append(clientRefs, r)
	}
	batchRefs := make([]string, 0, len(batchRefSet))
	for r := range batchRefSet {
		batchRefs = append(batchRefs, r)
	}

	// Single query for all candidate observations across all intents.
	// Uses the same functional indexes as the old per-intent query.
	// The ingest_run_id filter is skipped when empty (non-INGEST_RUN scopes).
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
			beneficiary_fingerprint, zord_signature_carrier,
			created_at, updated_at
		FROM canonical_settlement_observations cso
		WHERE cso.tenant_id = $1
		  AND ($2 = '' OR cso.ingest_run_id = $2)
		  AND NOT EXISTS (
		      SELECT 1 FROM attachment_decisions ad
		      WHERE ad.tenant_id       = cso.tenant_id
		        AND ad.settlement_observation_id = cso.settlement_observation_id
		        AND ad.decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')
		  )
		  AND (
		      (array_length($3::text[], 1) > 0 AND LOWER(cso.client_reference_candidate) = ANY($3::text[]))
		   OR (array_length($4::text[], 1) > 0 AND LOWER(cso.batch_reference)            = ANY($4::text[]))
		   OR (array_length($4::text[], 1) > 0 AND LOWER(cso.client_batch_id)            = ANY($4::text[]))
		   OR (cso.observation_timestamp BETWEEN $5 AND $6)
		  )
		ORDER BY cso.observation_timestamp, cso.settlement_observation_id
		LIMIT 100000`,
		tenantID,
		ingestRunID,
		pq.Array(clientRefs),
		pq.Array(batchRefs),
		windowStart,
		windowEnd,
	)
	if err != nil {
		return nil, fmt.Errorf("findAllCandidateObservationsBatch: query: %w", err)
	}
	defer rows.Close()

	allObs, err := scanObservations(rows)
	if err != nil {
		return nil, fmt.Errorf("findAllCandidateObservationsBatch: scan: %w", err)
	}

	// Distribute observations to each intent whose criteria they satisfy.
	// isCandidate is the pure-Go equivalent of the per-intent SQL WHERE clause.
	result := make(map[uuid.UUID][]models.CanonicalSettlementObservation, len(intents))
	for _, intent := range intents {
		ws, we := intentTimeWindow(intent)
		for _, obs := range allObs {
			if isCandidate(obs, intent, ws, we) {
				result[intent.IntentID] = append(result[intent.IntentID], obs)
			}
		}
	}
	return result, nil
}

// intentTimeWindow returns the ±72h window around an intent's intended execution
// time, or a ±1 year fallback when the field is nil.
func intentTimeWindow(intent models.CanonicalIntent) (windowStart, windowEnd time.Time) {
	if intent.IntendedExecutionAt != nil {
		return intent.IntendedExecutionAt.Add(-72 * time.Hour),
			intent.IntendedExecutionAt.Add(72 * time.Hour)
	}
	return time.Now().Add(-8760 * time.Hour), time.Now().Add(8760 * time.Hour)
}

// isCandidate returns true when obs matches any of the search criteria for intent.
// This mirrors the SQL OR branches in the old findCandidateObservations query.
func isCandidate(
	obs models.CanonicalSettlementObservation,
	intent models.CanonicalIntent,
	windowStart, windowEnd time.Time,
) bool {
	// Client payout reference match
	if intent.ClientPayoutRef != nil && *intent.ClientPayoutRef != "" &&
		obs.ClientReferenceCandidate != nil &&
		strings.EqualFold(*intent.ClientPayoutRef, *obs.ClientReferenceCandidate) {
		return true
	}
	// Batch reference / client batch ID match
	if intent.ClientBatchRef != nil && *intent.ClientBatchRef != "" {
		if obs.BatchReference != nil &&
			strings.EqualFold(*intent.ClientBatchRef, *obs.BatchReference) {
			return true
		}
		if strings.EqualFold(*intent.ClientBatchRef, obs.ClientBatchID) {
			return true
		}
	}
	// Amount + currency + time-window fallback
	if obs.Amount.Equal(intent.Amount) &&
		strings.EqualFold(obs.CurrencyCode, intent.CurrencyCode) &&
		!obs.ObservationTimestamp.Before(windowStart) &&
		!obs.ObservationTimestamp.After(windowEnd) {
		return true
	}
	return false
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT LOADERS
// ─────────────────────────────────────────────────────────────────────────────

func loadIntentsForIngestRunObservations(
	ctx context.Context,
	tenantID uuid.UUID,
	observations []models.CanonicalSettlementObservation,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	result := make(map[uuid.UUID]models.CanonicalIntent)
	batchRefs := make(map[string]struct{})
	clientRefs := make(map[string]struct{})

	for _, obs := range observations {
		if ref := strings.TrimSpace(obs.ClientBatchID); ref != "" {
			batchRefs[strings.ToLower(ref)] = struct{}{}
		}
		if obs.BatchReference != nil {
			if ref := strings.TrimSpace(*obs.BatchReference); ref != "" {
				batchRefs[strings.ToLower(ref)] = struct{}{}
			}
		}
		if obs.ClientReferenceCandidate != nil {
			if ref := strings.TrimSpace(*obs.ClientReferenceCandidate); ref != "" {
				clientRefs[strings.ToLower(ref)] = struct{}{}
			}
		}
	}

	batchRefList := make([]string, 0, len(batchRefs))
	for ref := range batchRefs {
		batchRefList = append(batchRefList, ref)
	}
	sort.Strings(batchRefList)

	batchIntents, err := loadMasterIntentsByBatchRefs(ctx, tenantID, batchRefList)
	if err != nil {
		return nil, err
	}
	for id, intent := range batchIntents {
		result[id] = intent
	}

	refs := make([]string, 0, len(clientRefs))
	for ref := range clientRefs {
		refs = append(refs, ref)
	}
	sort.Strings(refs)

	refIntents, err := loadIntentsByClientPayoutRefs(ctx, tenantID, refs)
	if err != nil {
		return nil, err
	}
	for id, intent := range refIntents {
		result[id] = intent
	}

	return result, nil
}

func loadMasterIntentsByBatchRef(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	return loadMasterIntentsByBatchRefs(ctx, tenantID, []string{batchRef})
}

func loadMasterIntentsByBatchRefs(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRefs []string,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	result := make(map[uuid.UUID]models.CanonicalIntent)
	if len(batchRefs) == 0 {
		return result, nil
	}

	normalized := make([]string, 0, len(batchRefs))
	seen := make(map[string]struct{}, len(batchRefs))
	for _, ref := range batchRefs {
		lower := strings.ToLower(strings.TrimSpace(ref))
		if lower == "" {
			continue
		}
		if _, dup := seen[lower]; dup {
			continue
		}
		seen[lower] = struct{}{}
		normalized = append(normalized, lower)
	}
	if len(normalized) == 0 {
		return result, nil
	}
	sort.Strings(normalized)

	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			intent_id, tenant_id, trace_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			source_row_num, created_at
		FROM canonical_intents
		WHERE tenant_id = $1 AND LOWER(client_batch_ref) = ANY($2)
		ORDER BY intent_id`,
		tenantID, pq.Array(normalized),
	)
	if err != nil {
		return nil, fmt.Errorf("loadMasterIntentsByBatchRefs: query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID, &intent.TenantID, &intent.TraceID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.SourceRowNum, &intent.CreatedAt,
		); err != nil {
			log.Printf("loadMasterIntentsByBatchRefs: scan: %v", err)
			continue
		}
		result[intent.IntentID] = intent
	}
	return result, rows.Err()
}

func loadIntentsByClientPayoutRefs(
	ctx context.Context,
	tenantID uuid.UUID,
	clientRefs []string,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	result := make(map[uuid.UUID]models.CanonicalIntent)
	if len(clientRefs) == 0 {
		return result, nil
	}

	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			intent_id, tenant_id, trace_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			source_row_num, created_at
		FROM canonical_intents
		WHERE tenant_id = $1 AND LOWER(client_payout_ref) = ANY($2)
		ORDER BY intent_id`,
		tenantID, pq.Array(clientRefs),
	)
	if err != nil {
		return nil, fmt.Errorf("loadIntentsByClientPayoutRefs: query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID, &intent.TenantID, &intent.TraceID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.SourceRowNum, &intent.CreatedAt,
		); err != nil {
			log.Printf("loadIntentsByClientPayoutRefs: scan: %v", err)
			continue
		}
		result[intent.IntentID] = intent
	}
	return result, rows.Err()
}

func loadMasterObservationsByBatchRef(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (map[uuid.UUID]models.CanonicalSettlementObservation, error) {
	obsList, err := loadObservationsByBatch(ctx, tenantID, batchRef)
	if err != nil {
		return nil, fmt.Errorf("loadMasterObservationsByBatchRef: %w", err)
	}
	result := make(map[uuid.UUID]models.CanonicalSettlementObservation)
	for _, o := range obsList {
		result[o.SettlementObservationID] = o
	}
	return result, nil
}

func loadIntentByID(ctx context.Context, tenantID uuid.UUID, intentID uuid.UUID) (*models.CanonicalIntent, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			intent_id, tenant_id, trace_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			source_row_num, created_at
		FROM canonical_intents
		WHERE tenant_id = $1 AND intent_id = $2`,
		tenantID, intentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID, &intent.TenantID, &intent.TraceID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.SourceRowNum, &intent.CreatedAt,
		); err != nil {
			return nil, err
		}
		return &intent, nil
	}
	return nil, fmt.Errorf("intent not found: %s", intentID)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

func buildCandidateRows(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	intentID uuid.UUID,
	scored []CandidateScore,
	observations []models.CanonicalSettlementObservation,
) []models.AttachmentCandidate {
	candidates := make([]models.AttachmentCandidate, 0, len(scored))
	for rank, cs := range scored {
		breakdownJSON, _ := json.Marshal(cs.Breakdown)
		candidates = append(candidates, models.AttachmentCandidate{
			CandidateID:             uuid.New(),
			AttachmentJobID:         jobID,
			TenantID:                tenantID,
			SettlementObservationID: cs.SettlementObservationID,
			IntentID:                intentID,
			CandidateRank:           rank + 1,
			ExactRefMatchFlag:       cs.ExactRefMatch,
			ClientRefMatchFlag:      cs.ClientRefMatch,
			ProviderRefMatchFlag:    cs.ProviderRefMatch,
			BankRefMatchFlag:        cs.BankRefMatch,
			BatchMatchFlag:          cs.BatchMatch,
			AmountMatchFlag:         cs.AmountMatch,
			CurrencyMatchFlag:       cs.CurrencyMatch,
			TimeWindowMatchFlag:     cs.TimeWindowMatch,
			SourceSystemMatchFlag:   cs.SourceSystemMatch,
			ZordSignatureMatchFlag:  cs.ZordSignatureMatch,
			CompositeMatchFlag:      cs.CompositeMatch,
			ScoreTotal:              cs.Total,
			ScoreBreakdownJSON:      breakdownJSON,
			ConfidenceBucket:        cs.ConfidenceBucket,
			CreatedAt:               time.Now().UTC(),
		})
	}
	return candidates
}

func buildUnresolvedDecision(
	tenantID uuid.UUID,
	intentID uuid.UUID,
	jobID uuid.UUID,
	reasonCode string,
) models.AttachmentDecision {
	detail, _ := json.Marshal(map[string]string{"reason": reasonCode})
	return models.AttachmentDecision{
		AttachmentDecisionID:     uuid.New(),
		TenantID:                 tenantID,
		SettlementObservationID:  nil,
		IntentID:                 intentID,
		AttachmentJobID:          jobID,
		DecisionType:             models.DecisionMatchUnresolved,
		DecisionReasonCode:       reasonCode,
		DecisionReasonDetailJSON: detail,
		MatchingRulesetVersion:   RulesetVersion,
		AmbiguityScore:           1.0,
		CandidateSetHash:         "empty",
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}
}

func buildMatchEvidenceCarriers(
	intent models.CanonicalIntent,
	obs *models.CanonicalSettlementObservation,
	topScore *CandidateScore,
) map[string]interface{} {
	intentCarriers := map[string]interface{}{
		"intent_id":     intent.IntentID.String(),
		"amount":        intent.Amount,
		"currency_code": intent.CurrencyCode,
	}
	if intent.ClientPayoutRef != nil {
		intentCarriers["client_payout_ref"] = *intent.ClientPayoutRef
	}
	if intent.ClientBatchRef != nil {
		intentCarriers["client_batch_ref"] = *intent.ClientBatchRef
	}
	if intent.BusinessIdempotencyKey != nil {
		intentCarriers["business_idempotency_key"] = *intent.BusinessIdempotencyKey
	}
	if intent.ZordSignatureCarrier != nil {
		intentCarriers["zord_signature_carrier"] = *intent.ZordSignatureCarrier
	}
	if intent.BeneficiaryFingerprint != nil {
		intentCarriers["beneficiary_fingerprint"] = *intent.BeneficiaryFingerprint
	}
	if intent.IntendedExecutionAt != nil {
		intentCarriers["intended_execution_at"] = intent.IntendedExecutionAt.UTC().Format(time.RFC3339)
	}
	if intent.ProviderHint != nil {
		intentCarriers["provider_hint"] = *intent.ProviderHint
	}
	if intent.Corridor != nil {
		intentCarriers["corridor"] = *intent.Corridor
	}

	result := map[string]interface{}{"intent_carriers": intentCarriers}

	if topScore != nil {
		result["match_flags"] = map[string]interface{}{
			"exact_ref_match":      topScore.ExactRefMatch,
			"client_ref_match":     topScore.ClientRefMatch,
			"provider_ref_match":   topScore.ProviderRefMatch,
			"bank_ref_match":       topScore.BankRefMatch,
			"batch_match":          topScore.BatchMatch,
			"amount_match":         topScore.AmountMatch,
			"currency_match":       topScore.CurrencyMatch,
			"time_window_match":    topScore.TimeWindowMatch,
			"source_system_match":  topScore.SourceSystemMatch,
			"zord_signature_match": topScore.ZordSignatureMatch,
			"composite_match":      topScore.CompositeMatch,
			"has_hard_conflict":    topScore.HasHardConflict,
			"has_any_conflict":     topScore.HasAnyConflict,
		}
	}

	if obs != nil {
		obsCarriers := map[string]interface{}{
			"settlement_observation_id": obs.SettlementObservationID.String(),
			"amount":                    obs.Amount,
			"currency_code":             obs.CurrencyCode,
			"observation_timestamp":     obs.ObservationTimestamp,
			"source_strength_class":     obs.SourceStrengthClass,
		}
		if obs.ClientReferenceCandidate != nil {
			obsCarriers["client_reference_candidate"] = *obs.ClientReferenceCandidate
		}
		if obs.ProviderReference != nil {
			obsCarriers["provider_reference"] = *obs.ProviderReference
		}
		if obs.BankReference != nil {
			obsCarriers["bank_reference"] = *obs.BankReference
		}
		if obs.BatchReference != nil {
			obsCarriers["batch_reference"] = *obs.BatchReference
		}
		if obs.ClientBatchID != "" {
			obsCarriers["client_batch_id"] = obs.ClientBatchID
		}
		if obs.BeneficiaryFingerprint != nil {
			obsCarriers["beneficiary_fingerprint"] = *obs.BeneficiaryFingerprint
		}
		if obs.ZordSignatureCarrier != nil {
			obsCarriers["zord_signature_carrier"] = *obs.ZordSignatureCarrier
		}
		if obs.ValueDate != nil {
			obsCarriers["value_date"] = obs.ValueDate.UTC().Format(time.RFC3339)
		}
		result["matched_observation_carriers"] = obsCarriers
	}

	return result
}

func computeCandidateSetHash(intentID uuid.UUID, rulesetVersion string, scored []CandidateScore) string {
	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Total != scored[j].Total {
			return scored[i].Total > scored[j].Total
		}
		return scored[i].SettlementObservationID.String() < scored[j].SettlementObservationID.String()
	})

	type candidateJSON struct {
		SettlementObservationID string      `json:"settlement_observation_id"`
		ScoreTotal              float64     `json:"score_total"`
		ScoreBreakdown          interface{} `json:"score_breakdown"`
	}
	type fullSnapshot struct {
		IntentID               string          `json:"intent_id"`
		MatchingRulesetVersion string          `json:"matching_ruleset_version"`
		Candidates             []candidateJSON `json:"candidates"`
	}

	snapshot := fullSnapshot{
		IntentID:               intentID.String(),
		MatchingRulesetVersion: rulesetVersion,
		Candidates:             make([]candidateJSON, len(scored)),
	}
	for i, cs := range scored {
		snapshot.Candidates[i] = candidateJSON{
			SettlementObservationID: cs.SettlementObservationID.String(),
			ScoreTotal:              cs.Total,
			ScoreBreakdown:          cs.Breakdown,
		}
	}
	data, _ := json.Marshal(snapshot)
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func computeDelayDays(intent models.CanonicalIntent, obs models.CanonicalSettlementObservation) int {
	if intent.IntendedExecutionAt == nil || obs.ValueDate == nil {
		return 0
	}
	intentDay := intent.IntendedExecutionAt.Truncate(24 * time.Hour)
	settleDay := obs.ValueDate.Truncate(24 * time.Hour)
	return int(settleDay.Sub(intentDay).Hours() / 24)
}

func buildAmbiguousIntentRecords(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	clientBatchRef *string,
	intents []models.CanonicalIntent,
	decisions []models.AttachmentDecision,
) []models.AmbiguousIntentRecord {
	intentByID := make(map[uuid.UUID]models.CanonicalIntent, len(intents))
	for _, intent := range intents {
		intentByID[intent.IntentID] = intent
	}
	var records []models.AmbiguousIntentRecord
	for _, d := range decisions {
		if d.DecisionType != models.DecisionMatchAmbiguous {
			continue
		}
		intent, ok := intentByID[d.IntentID]
		if !ok {
			continue
		}
		var expectedWindowEnd *time.Time
		if intent.IntendedExecutionAt != nil {
			end := intent.IntendedExecutionAt.Add(72 * time.Hour)
			expectedWindowEnd = &end
		}
		records = append(records, models.AmbiguousIntentRecord{
			AmbiguousID:       uuid.New(),
			TenantID:          tenantID,
			AttachmentJobID:   jobID,
			IntentID:          intent.IntentID,
			BatchID:           clientBatchRef,
			ExpectedWindowEnd: expectedWindowEnd,
			ReasonCode:        models.UnresolvedReasonOnlyAmbiguousCandidatesFound,
			Amount:            intent.Amount,
			CurrencyCode:      intent.CurrencyCode,
			CreatedAt:         time.Now().UTC(),
		})
	}
	return records
}

func buildConflictedIntentRecords(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	clientBatchRef *string,
	intents []models.CanonicalIntent,
	decisions []models.AttachmentDecision,
) []models.ConflictedIntentRecord {
	intentByID := make(map[uuid.UUID]models.CanonicalIntent, len(intents))
	for _, intent := range intents {
		intentByID[intent.IntentID] = intent
	}
	var records []models.ConflictedIntentRecord
	for _, d := range decisions {
		if d.DecisionType != models.DecisionMatchConflicted {
			continue
		}
		intent, ok := intentByID[d.IntentID]
		if !ok {
			continue
		}
		var expectedWindowEnd *time.Time
		if intent.IntendedExecutionAt != nil {
			end := intent.IntendedExecutionAt.Add(72 * time.Hour)
			expectedWindowEnd = &end
		}
		records = append(records, models.ConflictedIntentRecord{
			ConflictedID:      uuid.New(),
			TenantID:          tenantID,
			AttachmentJobID:   jobID,
			IntentID:          intent.IntentID,
			BatchID:           clientBatchRef,
			ExpectedWindowEnd: expectedWindowEnd,
			ReasonCode:        models.UnresolvedReasonOnlyConflictedCandidatesFound,
			Amount:            intent.Amount,
			CurrencyCode:      intent.CurrencyCode,
			CreatedAt:         time.Now().UTC(),
		})
	}
	return records
}

func buildUnresolvedIntentRecords(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	clientBatchRef *string,
	intents []models.CanonicalIntent,
	decisions []models.AttachmentDecision,
) []models.UnresolvedIntentRecord {
	intentByID := make(map[uuid.UUID]models.CanonicalIntent, len(intents))
	for _, intent := range intents {
		intentByID[intent.IntentID] = intent
	}
	var records []models.UnresolvedIntentRecord
	for _, d := range decisions {
		if d.DecisionType != models.DecisionMatchUnresolved {
			continue
		}
		intent, ok := intentByID[d.IntentID]
		if !ok {
			continue
		}
		var expectedWindowEnd *time.Time
		if intent.IntendedExecutionAt != nil {
			end := intent.IntendedExecutionAt.Add(72 * time.Hour)
			expectedWindowEnd = &end
		}
		records = append(records, models.UnresolvedIntentRecord{
			UnresolvedID:      uuid.New(),
			TenantID:          tenantID,
			AttachmentJobID:   jobID,
			IntentID:          intent.IntentID,
			BatchID:           clientBatchRef,
			ExpectedWindowEnd: expectedWindowEnd,
			ReasonCode:        unresolvedIntentReasonCode(d.DecisionReasonCode),
			Amount:            intent.Amount,
			CurrencyCode:      intent.CurrencyCode,
			CreatedAt:         time.Now().UTC(),
		})
	}
	return records
}

func unresolvedIntentReasonCode(decisionReasonCode string) string {
	if decisionReasonCode != "" {
		return decisionReasonCode
	}
	return models.UnresolvedReasonNoSettlementObservationFound
}

func ratioCoverage(numerator, denominator float64) float64 {
	if denominator <= 0 {
		return 0
	}
	r := numerator / denominator
	if r > 1 {
		return 1
	}
	if r < 0 {
		return 0
	}
	return r
}

func decimalCoverage(numerator, denominator decimal.Decimal) float64 {
	if denominator.IsZero() {
		return 0
	}
	f, _ := numerator.Div(denominator).Float64()
	if f > 1 {
		return 1
	}
	if f < 0 {
		return 0
	}
	return f
}

// computeBatchSummary computes the derived batch-level attachment picture.
//
// FIX #2: matchedIntendedAmountParam is the sum of ONLY matched intent amounts
// (accumulated in the main loop when winnerObsID != nil). This is the correct
// numerator for IntentValueCoverage. originalIntendedAmount (sum of ALL intents)
// is computed here from the intents slice and is the correct denominator.
func computeBatchSummary(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	scopeRef string,
	clientBatchRef *string,
	intents []models.CanonicalIntent,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	allOrphans []models.OrphanSettlementRecord,
	obsAmountMap map[uuid.UUID]decimal.Decimal,
	matchedIntendedAmountParam decimal.Decimal, // FIX #2: renamed parameter
	originalObservationAmount decimal.Decimal,
	ambiguousIntents []models.AmbiguousIntentRecord,
	conflictedIntents []models.ConflictedIntentRecord,
) models.BatchAttachmentSummary {

	// FIX #2: originalIntendedAmount = sum of ALL intents (denominator).
	intentByID := make(map[uuid.UUID]models.CanonicalIntent, len(intents))
	originalIntendedAmount := decimal.Zero
	for _, intent := range intents {
		originalIntendedAmount = originalIntendedAmount.Add(intent.Amount)
		intentByID[intent.IntentID] = intent
	}

	summary := models.BatchAttachmentSummary{
		BatchAttachmentSummaryID: uuid.New(),
		TenantID:                 tenantID,
		BatchID:                  clientBatchRef,
		SourceReference:          scopeRef,
		AttachmentJobID:          jobID,
		TotalIntentCount:         len(intents),
		OriginalIntendedAmount:   originalIntendedAmount,
		OriginalSettledAmount:    originalObservationAmount,
		// FIX #2: TotalIntendedAmount now stores only the matched portion, used
		// for matched-pair analytics.  OriginalIntendedAmount is the full sum.
		TotalIntendedAmount:    matchedIntendedAmountParam,
		TotalObservationCount:  len(obsAmountMap),
		OrphanObservationCount: len(allOrphans),
		CreatedAt:              time.Now().UTC(),
		UpdatedAt:              time.Now().UTC(),
	}

	attachedObsIDs := make(map[uuid.UUID]bool, len(variances))
	for _, v := range variances {
		attachedObsIDs[v.SettlementObservationID] = true
	}

	for obsID, amount := range obsAmountMap {
		if attachedObsIDs[obsID] {
			summary.TotalObservedAmount = summary.TotalObservedAmount.Add(amount)
		}
	}

	orphanObservedAmount := decimal.Zero
	for _, o := range allOrphans {
		orphanObservedAmount = orphanObservedAmount.Add(o.Amount)
	}
	summary.OrphanObservedAmount = orphanObservedAmount

	if len(decisions) == 0 {
		summary.BatchAttachmentStatus = models.BatchStatusFailed
		return summary
	}

	var matchedScoreCount float64
	for _, d := range decisions {
		switch d.DecisionType {
		case models.DecisionMatchExact:
			summary.ExactMatchCount++
		case models.DecisionMatchHighConfidence:
			summary.HighConfidenceCount++
		case models.DecisionMatchUnresolved:
			summary.UnresolvedCount++
		}

		if d.DecisionType == models.DecisionMatchUnresolved {
			if intent, ok := intentByID[d.IntentID]; ok {
				summary.UnresolvedIntendedAmount = summary.UnresolvedIntendedAmount.Add(intent.Amount)
			}
		}

		if d.DecisionType != models.DecisionMatchUnresolved {
			summary.AggregateScore += d.ConfidenceScore
			summary.AggregateMatchConfidence += d.MatchConfidence
			summary.AmbiguityScore += d.AmbiguityScore
			matchedScoreCount++
		}
	}

	summary.MatchedIntentCount = summary.ExactMatchCount + summary.HighConfidenceCount
	summary.MatchedObservationCount = len(variances)

	// FIX #2: MatchedIntendedAmount = the passed-in matched-only sum.
	summary.MatchedIntendedAmount = matchedIntendedAmountParam
	summary.MatchedObservedAmount = summary.TotalObservedAmount

	summary.NetBatchDelta = summary.OriginalSettledAmount.Sub(summary.OriginalIntendedAmount).Abs()

	for _, v := range variances {
		summary.MatchedPairVariance = summary.MatchedPairVariance.Add(v.AmountVariance.Abs())
		if v.FeeVariance != nil {
			summary.TotalFeeAmount = summary.TotalFeeAmount.Add(*v.FeeVariance)
		}
		if v.DeductionVariance != nil {
			summary.TotalDeductionAmount = summary.TotalDeductionAmount.Add(*v.DeductionVariance)
		}
	}
	summary.TotalVariance = summary.MatchedPairVariance
	summary.NetUnexplainedVariance = summary.MatchedPairVariance.
		Sub(summary.TotalFeeAmount).Sub(summary.TotalDeductionAmount).Abs()

	// FIX #2: IntentValueCoverage = matched / original (was matched/matched = 1.0).
	summary.IntentCountCoverage = ratioCoverage(
		float64(summary.MatchedIntentCount), float64(summary.TotalIntentCount))
	summary.IntentValueCoverage = decimalCoverage(
		summary.MatchedIntendedAmount, summary.OriginalIntendedAmount)
	summary.ObservedCountAllocationCoverage = ratioCoverage(
		float64(summary.MatchedObservationCount), float64(summary.TotalObservationCount))
	summary.ObservedValueAllocationCoverage = decimalCoverage(
		summary.MatchedObservedAmount, summary.OriginalSettledAmount)

	if matchedScoreCount > 0 {
		summary.AggregateScore /= matchedScoreCount
		summary.AggregateMatchConfidence /= matchedScoreCount
		summary.AmbiguityScore /= matchedScoreCount
	}

	summary.AmbiguousCount = len(ambiguousIntents)
	for _, a := range ambiguousIntents {
		summary.AmbiguousAmount = summary.AmbiguousAmount.Add(a.Amount)
	}
	summary.ConflictedCount = len(conflictedIntents)
	for _, c := range conflictedIntents {
		summary.ConflictedAmount = summary.ConflictedAmount.Add(c.Amount)
	}

	tolerance := decimal.Zero
	switch {
	case summary.AmbiguousCount > 0 || summary.ConflictedCount > 0:
		summary.BatchAttachmentStatus = models.BatchStatusRequiresReview
	case summary.UnresolvedCount > 0 || summary.OrphanObservationCount > 0:
		summary.BatchAttachmentStatus = models.BatchStatusPartiallySettled
	case summary.NetUnexplainedVariance.GreaterThan(tolerance):
		summary.BatchAttachmentStatus = models.BatchStatusRequiresReview
	default:
		summary.BatchAttachmentStatus = models.BatchStatusFullySettled
	}

	return summary
}

func observedSettlementAmount(obs models.CanonicalSettlementObservation) decimal.Decimal {
	if obs.SettledAmount != nil {
		return *obs.SettledAmount
	}
	return obs.Amount
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE LAYER
// ─────────────────────────────────────────────────────────────────────────────

func advisoryLockKey(tenantID uuid.UUID, scopeRef string) int64 {
	h := sha256.Sum256([]byte(tenantID.String() + "|" + scopeRef))
	var key uint64
	for i := 0; i < 32; i += 8 {
		var word uint64
		for j := 0; j < 8; j++ {
			word = (word << 8) | uint64(h[i+j])
		}
		key ^= word
	}
	return int64(key)
}

func execTxChunkedInsert[T any](
	ctx context.Context,
	tx *sql.Tx,
	table string,
	columns string,
	onConflictClause string,
	items []T,
	valueCount int,
	buildArgs func(T) []interface{},
	errLabel string,
) error {
	if len(items) == 0 {
		return nil
	}
	for start := 0; start < len(items); start += batchInsertChunkSize {
		end := start + batchInsertChunkSize
		if end > len(items) {
			end = len(items)
		}
		chunk := items[start:end]

		args := make([]interface{}, 0, len(chunk)*valueCount)
		var valuePlaceholders strings.Builder
		for i, item := range chunk {
			rowArgs := buildArgs(item)
			if i > 0 {
				valuePlaceholders.WriteString(",")
			}
			argBase := i*valueCount + 1
			valuePlaceholders.WriteString("(")
			for j := 0; j < valueCount; j++ {
				if j > 0 {
					valuePlaceholders.WriteString(",")
				}
				fmt.Fprintf(&valuePlaceholders, "$%d", argBase+j)
			}
			valuePlaceholders.WriteString(")")
			args = append(args, rowArgs...)
		}

		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES %s", table, columns, valuePlaceholders.String())
		if onConflictClause != "" {
			query += " " + onConflictClause
		}
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert %s chunk: %w", errLabel, err)
		}
	}
	return nil
}

// persistAttachmentOutputs writes all job outputs in a single transaction.
//
// FIX #1:  outboxRows and leafRows are inserted inside the same transaction so
//
//	event emission is atomic with decision/variance persistence.
//
// FIX #3:  Stale reverse-scan records (unresolved/ambiguous/conflicted/orphan)
//
//	are deleted before re-inserting so replays produce a clean state.
//
// FIX #6:  Advisory lock acquired via pg_try_advisory_xact_lock inside the
//
//	transaction — works on any pool connection, auto-released at commit.
func persistAttachmentOutputs(
	ctx context.Context,
	job *models.AttachmentJob,
	lockKey int64,
	candidates []models.AttachmentCandidate,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	allOrphans []models.OrphanSettlementRecord,
	ambiguousIntents []models.AmbiguousIntentRecord,
	conflictedIntents []models.ConflictedIntentRecord,
	unresolvedIntents []models.UnresolvedIntentRecord,
	batchSummary models.BatchAttachmentSummary,
	outboxRows []models.OutboxRow,
	leafRows []models.OutboxRow,
	exact, high, ambiguous, unresolved, conflicted int,
) error {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("persistAttachmentOutputs: begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// FIX #6: acquire advisory lock inside the transaction so it is
	// connection-agnostic and released automatically at commit/rollback.
	var lockAcquired bool
	if err = tx.QueryRowContext(ctx,
		`SELECT pg_try_advisory_xact_lock($1)`, lockKey,
	).Scan(&lockAcquired); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: advisory lock query: %w", err)
	}
	if !lockAcquired {
		return fmt.Errorf("persistAttachmentOutputs: concurrent job already running for job=%s — try again shortly",
			job.AttachmentJobID)
	}

	// FIX #3: clean up stale reverse-scan records from any previous run of
	// this exact job before re-inserting the fresh set.
	cleanupStmts := []string{
		`DELETE FROM unresolved_intent_records  WHERE attachment_job_id = $1`,
		`DELETE FROM ambiguous_intent_records   WHERE attachment_job_id = $1`,
		`DELETE FROM conflicted_intent_records  WHERE attachment_job_id = $1`,
		`DELETE FROM orphan_settlement_records  WHERE attachment_job_id = $1`,
	}
	for _, stmt := range cleanupStmts {
		if _, err = tx.ExecContext(ctx, stmt, job.AttachmentJobID); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: cleanup stale records: %w", err)
		}
	}

	// Persist candidates.
	if err = execTxChunkedInsert(ctx, tx, "attachment_candidates",
		`candidate_id, attachment_job_id, tenant_id,
		 settlement_observation_id, intent_id, candidate_rank,
		 exact_ref_match_flag, client_ref_match_flag, provider_ref_match_flag,
		 bank_ref_match_flag, batch_match_flag,
		 amount_match_flag, currency_match_flag, time_window_match_flag,
		 source_system_match_flag, zord_signature_match_flag, composite_match_flag,
		 score_total, score_breakdown_json, confidence_bucket, created_at`,
		"ON CONFLICT DO NOTHING",
		candidates, 21,
		func(c models.AttachmentCandidate) []interface{} {
			return []interface{}{
				c.CandidateID, c.AttachmentJobID, c.TenantID,
				c.SettlementObservationID, c.IntentID, c.CandidateRank,
				c.ExactRefMatchFlag, c.ClientRefMatchFlag, c.ProviderRefMatchFlag,
				c.BankRefMatchFlag, c.BatchMatchFlag,
				c.AmountMatchFlag, c.CurrencyMatchFlag, c.TimeWindowMatchFlag,
				c.SourceSystemMatchFlag, c.ZordSignatureMatchFlag, c.CompositeMatchFlag,
				c.ScoreTotal, c.ScoreBreakdownJSON, c.ConfidenceBucket, c.CreatedAt,
			}
		},
		"candidate",
	); err != nil {
		return err
	}

	// Persist decisions (upsert by intent+job to allow replays).
	if err = execTxChunkedInsert(ctx, tx, "attachment_decisions",
		`attachment_decision_id, tenant_id,
		 settlement_observation_id, intent_id, attachment_job_id,
		 decision_type, decision_reason_code, decision_reason_detail_json,
		 matching_ruleset_version,
		 winning_score, runner_up_score, score_margin, relative_score_margin,
		 confidence_score, match_confidence, ambiguity_score,
		 supporting_carriers_json, candidate_set_hash, candidate_set_size,
		 created_at, updated_at`,
		`ON CONFLICT (intent_id, attachment_job_id) DO UPDATE SET
		 settlement_observation_id   = EXCLUDED.settlement_observation_id,
		 decision_type               = EXCLUDED.decision_type,
		 decision_reason_code        = EXCLUDED.decision_reason_code,
		 decision_reason_detail_json = EXCLUDED.decision_reason_detail_json,
		 winning_score               = EXCLUDED.winning_score,
		 runner_up_score             = EXCLUDED.runner_up_score,
		 score_margin                = EXCLUDED.score_margin,
		 relative_score_margin       = EXCLUDED.relative_score_margin,
		 confidence_score            = EXCLUDED.confidence_score,
		 match_confidence            = EXCLUDED.match_confidence,
		 ambiguity_score             = EXCLUDED.ambiguity_score,
		 supporting_carriers_json    = EXCLUDED.supporting_carriers_json,
		 candidate_set_hash          = EXCLUDED.candidate_set_hash,
		 candidate_set_size          = EXCLUDED.candidate_set_size,
		 intent_id                   = EXCLUDED.intent_id,
		 updated_at                  = EXCLUDED.updated_at`,
		decisions, 21,
		func(d models.AttachmentDecision) []interface{} {
			return []interface{}{
				d.AttachmentDecisionID, d.TenantID,
				d.SettlementObservationID, d.IntentID, d.AttachmentJobID,
				d.DecisionType, d.DecisionReasonCode, d.DecisionReasonDetailJSON,
				d.MatchingRulesetVersion,
				d.WinningScore, d.RunnerUpScore, d.ScoreMargin, d.RelativeScoreMargin,
				d.ConfidenceScore, d.MatchConfidence, d.AmbiguityScore,
				d.SupportingCarriersJSON, d.CandidateSetHash, d.CandidateSetSize,
				d.CreatedAt, d.UpdatedAt,
			}
		},
		"decision",
	); err != nil {
		return err
	}

	// Persist variance records.
	if err = execTxChunkedInsert(ctx, tx, "variance_records",
		`variance_record_id, tenant_id,
		 attachment_decision_id, intent_id, settlement_observation_id,
		 amount_variance, deduction_variance, fee_variance,
		 currency_match_flag, status_variance_flag,
		 value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
		 provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
		 variance_type, variance_severity, variance_reason_codes_json,
		 is_whitelisted, whitelist_policy_id, whitelist_policy_version,
		 whitelist_reason_code, whitelist_explanation, created_at`,
		"ON CONFLICT DO NOTHING",
		variances, 25,
		func(v models.VarianceRecord) []interface{} {
			return []interface{}{
				v.VarianceRecordID, v.TenantID,
				v.AttachmentDecisionID, v.IntentID, v.SettlementObservationID,
				v.AmountVariance, v.DeductionVariance, v.FeeVariance,
				v.CurrencyMatchFlag, v.StatusVarianceFlag,
				v.ValueDateMismatchFlag, v.SettlementDelayDays, v.CrossPeriodFlag,
				v.ProviderRefMissingFlag, v.BankRefMissingFlag, v.EvidenceGapFlag,
				v.VarianceType, v.VarianceSeverity, v.VarianceReasonCodesJSON,
				v.IsWhitelisted, v.WhitelistPolicyID, v.WhitelistPolicyVersion,
				v.WhitelistReasonCode, v.WhitelistExplanation, v.CreatedAt,
			}
		},
		"variance",
	); err != nil {
		return err
	}

	// Persist orphaned observations.
	if err = execTxChunkedInsert(ctx, tx, "orphan_settlement_records",
		`orphan_id, tenant_id, attachment_job_id,
		 settlement_observation_id, batch_id,
		 unresolved_reason, amount, currency_code, created_at`,
		"ON CONFLICT DO NOTHING",
		allOrphans, 9,
		func(o models.OrphanSettlementRecord) []interface{} {
			return []interface{}{
				o.OrphanID, o.TenantID, o.AttachmentJobID,
				o.SettlementObservationID, o.BatchID,
				o.UnresolvedReason, o.Amount, o.CurrencyCode, o.CreatedAt,
			}
		},
		"orphan",
	); err != nil {
		return err
	}

	// Persist ambiguous intents.
	if err = execTxChunkedInsert(ctx, tx, "ambiguous_intent_records",
		`ambiguous_id, tenant_id, attachment_job_id,
		 intent_id, batch_id, expected_window_end,
		 reason_code, amount, currency_code, created_at`,
		"ON CONFLICT DO NOTHING",
		ambiguousIntents, 10,
		func(a models.AmbiguousIntentRecord) []interface{} {
			return []interface{}{
				a.AmbiguousID, a.TenantID, a.AttachmentJobID,
				a.IntentID, a.BatchID, a.ExpectedWindowEnd,
				a.ReasonCode, a.Amount, a.CurrencyCode, a.CreatedAt,
			}
		},
		"ambiguous intent",
	); err != nil {
		return err
	}

	// Persist conflicted intents.
	if err = execTxChunkedInsert(ctx, tx, "conflicted_intent_records",
		`conflicted_id, tenant_id, attachment_job_id,
		 intent_id, batch_id, expected_window_end,
		 reason_code, amount, currency_code, created_at`,
		"ON CONFLICT DO NOTHING",
		conflictedIntents, 10,
		func(c models.ConflictedIntentRecord) []interface{} {
			return []interface{}{
				c.ConflictedID, c.TenantID, c.AttachmentJobID,
				c.IntentID, c.BatchID, c.ExpectedWindowEnd,
				c.ReasonCode, c.Amount, c.CurrencyCode, c.CreatedAt,
			}
		},
		"conflicted intent",
	); err != nil {
		return err
	}

	// Persist unresolved intents.
	if err = execTxChunkedInsert(ctx, tx, "unresolved_intent_records",
		`unresolved_id, tenant_id, attachment_job_id,
		 intent_id, batch_id, expected_window_end,
		 reason_code, amount, currency_code, created_at`,
		"ON CONFLICT DO NOTHING",
		unresolvedIntents, 10,
		func(u models.UnresolvedIntentRecord) []interface{} {
			return []interface{}{
				u.UnresolvedID, u.TenantID, u.AttachmentJobID,
				u.IntentID, u.BatchID, u.ExpectedWindowEnd,
				u.ReasonCode, u.Amount, u.CurrencyCode, u.CreatedAt,
			}
		},
		"unresolved intent",
	); err != nil {
		return err
	}

	// Persist batch summary.
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO batch_attachment_summaries (
			batch_attachment_summary_id, tenant_id, batch_id, source_reference,
			attachment_job_id,
			total_intent_count, total_observation_count, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count, orphan_observation_count,
			matched_intent_count, matched_observation_count,
			original_intended_amount, original_settled_amount,
			total_intended_amount, total_observed_amount, total_variance,
			matched_intended_amount, matched_observed_amount, orphan_observed_amount,
			matched_pair_variance, net_batch_delta,
			unresolved_intended_amount, ambiguous_amount, conflicted_amount,
			ambiguous_observed_amount, conflicted_observed_amount, unresolved_observed_amount,
			total_fee_amount, total_deduction_amount, net_unexplained_variance,
			intent_count_coverage, intent_value_coverage,
			observed_count_allocation_coverage, observed_value_allocation_coverage,
			batch_attachment_status,
			avg_matched_attachment_quality, avg_matched_attachment_ambiguity,
			avg_matched_attachment_confidence, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
			$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
			$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
			$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44
		) ON CONFLICT DO NOTHING`,
		batchSummary.BatchAttachmentSummaryID, batchSummary.TenantID,
		batchSummary.BatchID, batchSummary.SourceReference,
		batchSummary.AttachmentJobID,
		batchSummary.TotalIntentCount, batchSummary.TotalObservationCount,
		batchSummary.ExactMatchCount, batchSummary.HighConfidenceCount,
		batchSummary.AmbiguousCount, batchSummary.UnresolvedCount,
		batchSummary.ConflictedCount, batchSummary.OrphanObservationCount,
		batchSummary.MatchedIntentCount, batchSummary.MatchedObservationCount,
		batchSummary.OriginalIntendedAmount, batchSummary.OriginalSettledAmount,
		batchSummary.TotalIntendedAmount, batchSummary.TotalObservedAmount,
		batchSummary.TotalVariance,
		batchSummary.MatchedIntendedAmount, batchSummary.MatchedObservedAmount,
		batchSummary.OrphanObservedAmount,
		batchSummary.MatchedPairVariance, batchSummary.NetBatchDelta,
		batchSummary.UnresolvedIntendedAmount, batchSummary.AmbiguousAmount,
		batchSummary.ConflictedAmount, batchSummary.AmbiguousObservedAmount,
		batchSummary.ConflictedObservedAmount, batchSummary.UnresolvedObservedAmount,
		batchSummary.TotalFeeAmount, batchSummary.TotalDeductionAmount,
		batchSummary.NetUnexplainedVariance,
		batchSummary.IntentCountCoverage, batchSummary.IntentValueCoverage,
		batchSummary.ObservedCountAllocationCoverage,
		batchSummary.ObservedValueAllocationCoverage,
		batchSummary.BatchAttachmentStatus,
		batchSummary.AggregateScore, batchSummary.AmbiguityScore,
		batchSummary.AggregateMatchConfidence,
		batchSummary.CreatedAt, batchSummary.UpdatedAt,
	); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: insert batch summary: %w", err)
	}

	// FIX #1: insert outbox rows INSIDE the transaction so event emission is
	// atomic with all other outputs. A crash after commit no longer loses events.
	allOutbox := append(outboxRows, leafRows...)
	if err = execTxChunkedInsert(ctx, tx, "outcome_outbox",
		`event_id, tenant_id, trace_id, envelope_id,
		 contract_id, batchid,
		 aggregate_type, aggregate_id,
		 event_type, payload,
		 status, retry_count, created_at,
		 settlement_record_received, canonical_settlement_created,
		 bank_reference, client_reference,
		 attachment_decision, match_confidence,
		 value_date_check, amount_match`,
		"ON CONFLICT DO NOTHING",
		allOutbox, 21,
		func(r models.OutboxRow) []interface{} {
			return []interface{}{
				r.EventID, r.TenantID, r.TraceID, r.EnvelopeID,
				r.ContractID, r.BatchID,
				r.AggregateType, r.AggregateID,
				r.EventType, r.Payload,
				"PENDING", 0, r.CreatedAt,
				r.SettlementRecordReceived, r.CanonicalSettlementCreated,
				r.BankReference, r.ClientReference,
				r.AttachmentDecision, r.MatchConfidence,
				r.ValueDateCheck, r.AmountMatch,
			}
		},
		"outbox",
	); err != nil {
		return err
	}

	// Mark job complete.
	completedAt := time.Now().UTC()
	if _, err = tx.ExecContext(ctx, `
		UPDATE attachment_jobs SET
			status                = 'COMPLETED',
			candidate_count_total = $1,
			exact_match_count     = $2,
			high_confidence_count = $3,
			ambiguous_count       = $4,
			unresolved_count      = $5,
			conflicted_count      = $6,
			completed_at          = $7
		WHERE attachment_job_id = $8`,
		len(candidates), exact, high, ambiguous, unresolved, conflicted,
		completedAt, job.AttachmentJobID,
	); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: update job: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: commit: %w", err)
	}

	job.Status = "COMPLETED"
	job.ExactMatchCount = exact
	job.HighConfidenceCount = high
	job.AmbiguousCount = ambiguous
	job.UnresolvedCount = unresolved
	job.ConflictedCount = conflicted
	job.CompletedAt = &completedAt
	emitOutcomeBatchSummaryVectorIndex(batchSummary)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────

// loadObservationsByBatch loads all observations for a batch reference.
// FIX #5: removed the invalid LOWER(settlement_batch_id) column reference
// that caused every SETTLEMENT_BATCH job to fail at runtime.
// Only batch_reference and client_batch_id are used — both exist on the table.
func loadObservationsByBatch(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) ([]models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
			beneficiary_fingerprint, zord_signature_carrier,
			created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1
		  AND (
		      LOWER(batch_reference)  = LOWER($2)
		   OR LOWER(client_batch_id) = LOWER($2)
		  )
		ORDER BY observation_timestamp`,
		tenantID, batchRef,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanObservations(rows)
}

func loadObservationsByJobID(
	ctx context.Context,
	tenantID uuid.UUID,
	jobID string,
) ([]models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
			beneficiary_fingerprint, zord_signature_carrier,
			created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1 AND ingest_run_id = $2
		ORDER BY observation_timestamp`,
		tenantID, jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanObservations(rows)
}

func scanObservations(rows *sql.Rows) ([]models.CanonicalSettlementObservation, error) {
	var result []models.CanonicalSettlementObservation
	for rows.Next() {
		var o models.CanonicalSettlementObservation
		err := rows.Scan(
			&o.SettlementObservationID, &o.TenantID, &o.TraceID,
			&o.SettlementEnvelopeID, &o.IngestRunID,
			&o.SourceFileRef, &o.SourceRowRef, &o.SourceSystem,
			&o.ObservationKind, &o.SourceStrengthClass,
			&o.ClientReferenceCandidate, &o.ProviderReference, &o.BankReference,
			&o.ExternalReference, &o.BatchReference,
			&o.Amount, &o.SettledAmount, &o.FeeAmount, &o.DeductionAmount,
			&o.CurrencyCode, &o.SettlementStatus,
			&o.RetryFlag, &o.ReversalFlag, &o.ReturnFlag,
			&o.ObservationTimestamp, &o.ValueDate,
			&o.ProviderRefStatus,
			&o.MappingProfileID, &o.MappingProfileVersion,
			&o.ParseConfidence, &o.MappingConfidence,
			&o.CarrierRichnessScore, &o.AttachmentReadinessScore,
			&o.CanonicalHash, &o.ClientBatchID, &o.CorridorID,
			&o.BeneficiaryFingerprint, &o.ZordSignatureCarrier,
			&o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			log.Printf("attachment.engine.scan_err: %v", err)
			continue
		}
		result = append(result, o)
	}
	return result, rows.Err()
}

func loadRuleProfile(ctx context.Context, tenantID uuid.UUID) (*models.AttachmentRuleProfile, error) {
	row := db.DB.QueryRowContext(ctx, `
		SELECT
			profile_id, tenant_id, version,
			exact_ref_priority_json, carrier_priority_json,
			time_window_policy_json, amount_tolerance_policy_json,
			batch_boundary_policy_json, manual_review_thresholds_json,
			ambiguity_margin_threshold, requires_bank_ref_for_exact_flag,
			status, created_at, updated_at
		FROM attachment_rule_profiles
		WHERE tenant_id = $1 AND status = 'ACTIVE'
		ORDER BY version DESC
		LIMIT 1`,
		tenantID,
	)
	var p models.AttachmentRuleProfile
	err := row.Scan(
		&p.ProfileID, &p.TenantID, &p.Version,
		&p.ExactRefPriorityJSON, &p.CarrierPriorityJSON,
		&p.TimeWindowPolicyJSON, &p.AmountTolerancePolicyJSON,
		&p.BatchBoundaryPolicyJSON, &p.ManualReviewThresholdsJSON,
		&p.AmbiguityMarginThreshold, &p.RequiresBankRefForExact,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func defaultRuleProfile(tenantID uuid.UUID) *models.AttachmentRuleProfile {
	return &models.AttachmentRuleProfile{
		ProfileID:                "default",
		TenantID:                 tenantID,
		Version:                  RulesetVersion,
		AmbiguityMarginThreshold: 0.15,
		RequiresBankRefForExact:  false,
		Status:                   "ACTIVE",
	}
}

func loadParsedRowsBySourceRowRefs(
	ctx context.Context,
	tenantID uuid.UUID,
	rowRefs []string,
) (map[string]*models.SettlementParsedRow, error) {
	if len(rowRefs) == 0 {
		return map[string]*models.SettlementParsedRow{}, nil
	}

	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			parsed_row_id, tenant_id, settlement_envelope_id,
			source_file_ref, source_row_ref,
			raw_line_hash,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, created_at
		FROM settlement_parsed_rows
		WHERE tenant_id = $1 AND source_row_ref = ANY($2)`,
		tenantID, pq.Array(rowRefs),
	)
	if err != nil {
		return nil, fmt.Errorf("loadParsedRowsBySourceRowRefs: query: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*models.SettlementParsedRow)
	for rows.Next() {
		pr := &models.SettlementParsedRow{}
		if err := rows.Scan(
			&pr.ParsedRowID, &pr.TenantID, &pr.SettlementEnvelopeID,
			&pr.SourceFileRef, &pr.SourceRowRef,
			&pr.RawLineHash,
			&pr.MappingProfileID, &pr.MappingProfileVersion,
			&pr.ParseConfidence, &pr.CreatedAt,
		); err != nil {
			log.Printf("loadParsedRowsBySourceRowRefs: scan: %v", err)
			continue
		}
		result[pr.SourceRowRef] = pr
	}
	return result, rows.Err()
}
