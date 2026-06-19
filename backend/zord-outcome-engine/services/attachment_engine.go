package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT ENGINE
//
// Orchestrates the full intent-to-settlement attachment pipeline:
//   Step 1  Receive attachment work (batch or single observation)
//   Step 2  Load matching ruleset
//   Step 3  Build candidate observation set per intent
//   Step 4  Score every candidate (deterministic, versioned)
//   Step 5  Select decision type
//   Step 6  Compute variance for attached pairs
//   Step 7  Persist all outputs transactionally (job / candidates / decision / variance / batch summary / outbox)
//   Step 8  Emit downstream events
//
// Hard invariants (from spec):
//   • NEVER declare finality on an ambiguously correlated outcome
//   • Attachment truth ≠ finality truth
//   • Every decision must be replayable (full candidate set preserved)
//   • No plaintext PII — only tokens, hashes, fingerprints
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
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
)

// AttachmentEngine is the main service struct for Service 5C.
type AttachmentEngine struct{}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

// RunForBatch triggers an attachment job for all canonical intents
// that belong to a given settlement batch reference.
func (e *AttachmentEngine) RunForBatch(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=INTENT_BATCH tenant=%s batch_ref=%s", tenantID, batchRef)

	// Load intents for this batch.
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

	return e.runAttachment(ctx, tenantID, models.JobScopeSettlementBatch, batchRef, intents)
}

// RunForJob triggers attachment for one settlement ingest run.
func (e *AttachmentEngine) RunForJob(
	ctx context.Context,
	tenantID uuid.UUID,
	jobID string,
) (*models.AttachmentJob, error) {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, fmt.Errorf("attachment.RunForJob: ingest_run_id is required")
	}

	log.Printf("attachment.engine.start scope=INGEST_RUN tenant=%s ingest_run_id=%s", tenantID, jobID)

	observations, err := loadObservationsByJobID(ctx, tenantID, jobID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForJob: load observations: %w", err)
	}
	if len(observations) == 0 {
		return nil, fmt.Errorf("attachment.RunForJob: no observations found for ingest_run_id=%s", jobID)
	}

	intentMap, err := loadIntentsForIngestRunObservations(ctx, tenantID, observations)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForJob: load intents: %w", err)
	}
	if len(intentMap) == 0 {
		return nil, fmt.Errorf("attachment.RunForJob: no intents found for ingest_run_id=%s using client_batch_id, batch_reference, or client_reference_candidate", jobID)
	}

	intents := make([]models.CanonicalIntent, 0, len(intentMap))
	for _, intent := range intentMap {
		intents = append(intents, intent)
	}
	sort.Slice(intents, func(i, j int) bool {
		return intents[i].IntentID.String() < intents[j].IntentID.String()
	})

	return e.runAttachment(ctx, tenantID, models.JobScopeIngestRun, jobID, intents)
}

// RunForSingleIntent triggers an attachment job for one specific intent.
func (e *AttachmentEngine) RunForSingleIntent(
	ctx context.Context,
	tenantID uuid.UUID,
	intentID uuid.UUID,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=SINGLE_INTENT tenant=%s intent=%s", tenantID, intentID)

	intent, err := loadIntentByID(ctx, tenantID, intentID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForSingleIntent: %w", err)
	}

	// Use the intent's batch_reference as the scope ref so that
	// GET /v1/attachment/batch/:batch_ref resolves correctly.
	scopeRef := intentID.String()
	if intent.ClientBatchRef != nil && *intent.ClientBatchRef != "" {
		scopeRef = *intent.ClientBatchRef
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSingleIntent, scopeRef, []models.CanonicalIntent{*intent})
}

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
			batchRefs[ref] = struct{}{}
		}
		if obs.BatchReference != nil {
			if ref := strings.TrimSpace(*obs.BatchReference); ref != "" {
				batchRefs[ref] = struct{}{}
			}
		}
		if obs.ClientReferenceCandidate != nil {
			if ref := strings.TrimSpace(*obs.ClientReferenceCandidate); ref != "" {
				clientRefs[strings.ToLower(ref)] = struct{}{}
			}
		}
	}

	for batchRef := range batchRefs {
		intents, err := loadMasterIntentsByBatchRef(ctx, tenantID, batchRef)
		if err != nil {
			return nil, err
		}
		for id, intent := range intents {
			result[id] = intent
		}
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

// ─────────────────────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

func (e *AttachmentEngine) runAttachment(
	ctx context.Context,
	tenantID uuid.UUID,
	scopeType string,
	scopeRef string,
	intents []models.CanonicalIntent,
) (*models.AttachmentJob, error) {

	lockKey := advisoryLockKey(tenantID, scopeType+"|"+scopeRef)
	var acquired bool
	if err := db.DB.QueryRowContext(ctx,
		`SELECT pg_try_advisory_lock($1)`, lockKey,
	).Scan(&acquired); err != nil {
		return nil, fmt.Errorf("attachment.engine: advisory lock query: %w", err)
	}
	if !acquired {
		return nil, fmt.Errorf("attachment.engine: concurrent job already running for tenant=%s scope_ref=%s — try again shortly", tenantID, scopeRef)
	}
	defer func() {
		if _, unlockErr := db.DB.ExecContext(ctx, `SELECT pg_advisory_unlock($1)`, lockKey); unlockErr != nil {
			log.Printf("attachment.engine.advisory_unlock_warn tenant=%s scope_ref=%s err=%v", tenantID, scopeRef, unlockErr)
		}
	}()

	profile, err := loadRuleProfile(ctx, tenantID)
	if err != nil {
		log.Printf("attachment.engine.no_profile tenant=%s err=%v — using defaults", tenantID, err)
		profile = defaultRuleProfile(tenantID)
	}
	policy := parseRuleProfile(profile)

	job := &models.AttachmentJob{
		AttachmentJobID:        uuid.New(),
		TenantID:               tenantID,
		JobScopeType:           scopeType,
		ScopeRef:               scopeRef,
		MatchingRulesetVersion: RulesetVersion,
		Status:                 "RUNNING",
		CreatedAt:              time.Now().UTC(),
	}
	now := time.Now().UTC()
	job.StartedAt = &now

	if err := insertAttachmentJob(ctx, job); err != nil {
		return nil, fmt.Errorf("attachment.engine: insert job: %w", err)
	}

	// ── Reverse scan setup: load master observation list ──────────────────
	var masterObservationMap map[uuid.UUID]models.CanonicalSettlementObservation
	switch scopeType {
	case models.JobScopeSettlementBatch:
		masterObservationMap, err = loadMasterObservationsByBatchRef(ctx, tenantID, scopeRef)
		if err != nil {
			log.Printf("attachment.engine.master_obs_load_warn job=%s err=%v (will fall back to candidate scan)", job.AttachmentJobID, err)
			masterObservationMap = map[uuid.UUID]models.CanonicalSettlementObservation{}
		}
	case models.JobScopeIngestRun:
		observations, loadErr := loadObservationsByJobID(ctx, tenantID, scopeRef)
		if loadErr != nil {
			log.Printf("attachment.engine.master_obs_load_warn job=%s ingest_run_id=%s err=%v (will fall back to candidate scan)", job.AttachmentJobID, scopeRef, loadErr)
			masterObservationMap = map[uuid.UUID]models.CanonicalSettlementObservation{}
		} else {
			masterObservationMap = make(map[uuid.UUID]models.CanonicalSettlementObservation, len(observations))
			for _, obs := range observations {
				masterObservationMap[obs.SettlementObservationID] = obs
			}
		}
	}

	matchedObservationIDs := make(map[uuid.UUID]bool)
	obsDecisionTypes := make(map[uuid.UUID][]string)

	previouslyDecidedObservationIDs, err := loadPreviouslyDecidedObservationIDs(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("attachment.engine: load previously decided observations: %w", err)
	}

	var (
		allDecisions              []models.AttachmentDecision
		allVariances              []models.VarianceRecord
		allCandidates             []models.AttachmentCandidate
		totalIntendedAmount       decimal.Decimal
		clientBatchRef            *string
		claimedObservationIDs     = previouslyDecidedObservationIDs
		allScannedObservationsMap = make(map[uuid.UUID]models.CanonicalSettlementObservation)
	)

	counters := struct {
		exact, high, ambiguous, unresolved, conflicted int
	}{}

	candidateIngestRunID := ""
	if scopeType == models.JobScopeIngestRun {
		candidateIngestRunID = scopeRef
	}

	for _, intent := range intents {

		observations, err := findCandidateObservations(ctx, tenantID, intent, claimedObservationIDs, candidateIngestRunID)
		if err != nil {
			log.Printf("attachment.engine.candidate_lookup_failed intent=%s err=%v", intent.IntentID, err)
			decision := buildUnresolvedDecision(tenantID, intent.IntentID, job.AttachmentJobID, "CANDIDATE_LOOKUP_FAILED")
			allDecisions = append(allDecisions, decision)
			counters.unresolved++
			continue
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
			topMargin := 0.0
			if len(scored) > 1 {
				topMargin = scored[0].Total - scored[1].Total
			}
			scored[0].ConfidenceBucket = ClassifyConfidenceContext(scored[0], scored, policy.ManualReviewThresholds)
			_ = topMargin
			for i := 1; i < len(scored); i++ {
				singleRanked := []CandidateScore{scored[i]}
				scored[i].ConfidenceBucket = ClassifyConfidenceContext(scored[i], singleRanked, policy.ManualReviewThresholds)
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
				totalIntendedAmount = totalIntendedAmount.Add(intent.Amount)
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

	var allOrphans []models.OrphanSettlementRecord
	effectiveObservationMap := masterObservationMap
	if len(effectiveObservationMap) == 0 && len(allScannedObservationsMap) > 0 {
		effectiveObservationMap = allScannedObservationsMap
	}

	var originalObservationAmount decimal.Decimal
	obsAmountMap := make(map[uuid.UUID]decimal.Decimal)
	for id, obs := range effectiveObservationMap {
		originalObservationAmount = originalObservationAmount.Add(obs.Amount)
		obsAmountMap[id] = obs.Amount
	}

	if scopeType == models.JobScopeSettlementBatch || scopeType == models.JobScopeIngestRun {
		if len(effectiveObservationMap) > 0 {
			allOrphans = performReverseScanOrphans(
				tenantID,
				job.AttachmentJobID,
				scopeRef,
				effectiveObservationMap,
				matchedObservationIDs,
				obsDecisionTypes,
				policy,
			)
		}
	}

	// ── Step 7: Persist all outputs transactionally ───────────────────────
	// Batch summary is computed here and passed into the transaction so it is
	// written atomically with candidates, decisions, variances, and the job
	// status update. No separate call after commit.
	unresolvedIntents := buildUnresolvedIntentRecords(tenantID, job.AttachmentJobID, clientBatchRef, intents, allDecisions)
	batchSummary := computeBatchSummary(tenantID, job.AttachmentJobID, scopeRef, clientBatchRef, intents, allDecisions, allVariances, allOrphans, obsAmountMap, totalIntendedAmount, originalObservationAmount)
	if err := persistAttachmentOutputs(
		ctx, job,
		allCandidates, allDecisions, allVariances, allOrphans, unresolvedIntents,
		batchSummary,
		counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted,
	); err != nil {
		return nil, fmt.Errorf("attachment.engine: persist outputs: %w", err)
	}

	// Build observation map keyed by settlement_observation_id.
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

	// ── Step 8: Emit downstream events (internal ops topics) ────────────

	// ── Step 8b: Emit Merkle leaf bundles for zord-evidence ───────────────
	// Load corresponding parsed rows so we can include raw_line_hash in Leaf 1.
	parsedByRowRef, err := loadParsedRowsBySourceRowRefs(ctx, tenantID, rowRefs)
	if err != nil {
		log.Printf("attachment.engine.parsed_rows_load_warn job=%s err=%v (leaf 1 may be absent)", job.AttachmentJobID, err)
		parsedByRowRef = map[string]*models.SettlementParsedRow{}
	}

	// ── Step 8a: Emit downstream events (internal ops topics) ────────────
	outboxSvc := &AttachmentOutboxService{}
	if err := outboxSvc.EmitForJob(ctx, job, allDecisions, allVariances, obsMap, parsedByRowRef); err != nil {
		log.Printf("attachment.engine.outbox_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	if err := outboxSvc.EmitLeafBundlesForJob(ctx, job, allDecisions, allVariances, obsMap, parsedByRowRef); err != nil {
		log.Printf("attachment.engine.leaf_bundle_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	log.Printf("attachment.engine.done job=%s exact=%d high=%d ambiguous=%d unresolved=%d conflicted=%d reverse_scan_orphans=%d unresolved_intents=%d",
		job.AttachmentJobID, counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted, len(allOrphans), len(unresolvedIntents))

	return job, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE SCAN
// ─────────────────────────────────────────────────────────────────────────────

// performReverseScanOrphans iterates every observation in the master list and produces an
// OrphanSettlementRecord for any observation that was not strongly matched
// (MATCH_EXACT or MATCH_HIGH_CONFIDENCE) during this job.
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
		decisionTypes := obsDecisionTypes[obsID]
		hasAmbiguous := false
		hasConflicted := false
		for _, dt := range decisionTypes {
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
// CANDIDATE DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

// loadPreviouslyDecidedIntentIDs fetches all intent IDs for the tenant that have already
// been strongly matched in the past. We preload this into a map at the start of a job
// to avoid executing N+1 EXISTS queries in the database.
// loadPreviouslyDecidedObservationIDs fetches all observation IDs for the tenant that have already
// been strongly matched in the past.
func loadPreviouslyDecidedObservationIDs(ctx context.Context, tenantID uuid.UUID) (map[uuid.UUID]bool, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT settlement_observation_id FROM attachment_decisions 
		WHERE tenant_id = $1 AND decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')
		  AND settlement_observation_id IS NOT NULL
	`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query attachment_decisions: %w", err)
	}
	defer rows.Close()

	excluded := make(map[uuid.UUID]bool)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		excluded[id] = true
	}
	return excluded, rows.Err()
}

// findCandidateObservations builds the candidate observation set for one canonical intent.
// Multi-index search: tenant + references, source system, and amount/currency/time.
func findCandidateObservations(
	ctx context.Context,
	tenantID uuid.UUID,
	intent models.CanonicalIntent,
	excludedObservationIDs map[uuid.UUID]bool,
	ingestRunID string,
) ([]models.CanonicalSettlementObservation, error) {

	query := `
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
		WHERE tenant_id = $1
		  AND ($8 = '' OR cso.ingest_run_id = $8)
		  AND NOT EXISTS (
		      SELECT 1 FROM attachment_decisions ad 
		      WHERE ad.settlement_observation_id = cso.settlement_observation_id 
		        AND ad.decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')
		  )
		  AND (
		    ($2 != '' AND LOWER(client_reference_candidate) = LOWER($2))
		    OR ($3 != '' AND LOWER(batch_reference) = LOWER($3))
		    OR ($3 != '' AND LOWER(client_batch_id) = LOWER($3))
		    OR (
		      amount = $4
		      AND currency_code = $5
		      AND observation_timestamp BETWEEN $6 AND $7
		    )
		  )
		ORDER BY
		  CASE
		    WHEN $2 != '' AND LOWER(client_reference_candidate) = LOWER($2) THEN 0
		    WHEN $3 != '' AND (LOWER(batch_reference) = LOWER($3) OR LOWER(client_batch_id) = LOWER($3))
		         AND amount = $4 AND currency_code = $5 AND observation_timestamp BETWEEN $6 AND $7 THEN 1
		    WHEN amount = $4 AND currency_code = $5 AND observation_timestamp BETWEEN $6 AND $7 THEN 2
		    WHEN $3 != '' AND (LOWER(batch_reference) = LOWER($3) OR LOWER(client_batch_id) = LOWER($3)) THEN 3
		    ELSE 4
		  END,
		  observation_timestamp,
		  settlement_observation_id
		LIMIT 200`

	var windowStart, windowEnd time.Time
	if intent.IntendedExecutionAt != nil {
		windowStart = intent.IntendedExecutionAt.Add(-72 * time.Hour)
		windowEnd = intent.IntendedExecutionAt.Add(72 * time.Hour)
	} else {
		windowStart = time.Now().Add(-8760 * time.Hour) // fallback 1 year
		windowEnd = time.Now().Add(8760 * time.Hour)
	}

	clientRef := ""
	if intent.ClientPayoutRef != nil {
		clientRef = *intent.ClientPayoutRef
	}
	batchRef := ""
	if intent.ClientBatchRef != nil {
		batchRef = *intent.ClientBatchRef
	}

	rows, err := db.DB.QueryContext(ctx, query,
		tenantID,
		clientRef,
		batchRef,
		intent.Amount,
		intent.CurrencyCode,
		windowStart,
		windowEnd,
		ingestRunID,
	)
	if err != nil {
		return nil, fmt.Errorf("findCandidateObservations: query: %w", err)
	}
	defer rows.Close()

	var observations []models.CanonicalSettlementObservation
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
			log.Printf("attachment.engine.obs_scan_err: %v", err)
			continue
		}
		if excludedObservationIDs[o.SettlementObservationID] {
			continue // Skip already claimed observations
		}
		observations = append(observations, o)
	}
	return observations, rows.Err()
}

// loadMasterIntentsByBatchRef fetches all canonical intents for a given
// client_batch_ref.  Used by the reverse scan to build the complete expected
// population of intents for a batch.
func loadMasterIntentsByBatchRef(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			created_at
		FROM canonical_intents
		WHERE tenant_id = $1 AND LOWER(client_batch_ref) = LOWER($2)
		ORDER BY intent_id`,
		// ↑ case-insensitive match: observations may carry a different case
		// for the batch ref than the intents table.
		tenantID, batchRef,
	)
	if err != nil {
		return nil, fmt.Errorf("loadMasterIntentsByBatchRef: query: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID]models.CanonicalIntent)
	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID, &intent.TenantID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.CreatedAt,
		); err != nil {
			log.Printf("loadMasterIntentsByBatchRef: scan: %v", err)
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
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			created_at
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
			&intent.IntentID, &intent.TenantID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.CreatedAt,
		); err != nil {
			log.Printf("loadIntentsByClientPayoutRefs: scan: %v", err)
			continue
		}
		result[intent.IntentID] = intent
	}
	return result, rows.Err()
}

// loadMasterObservationsByBatchRef fetches all canonical observations for a given
// batch ref. Used by the reverse scan to identify orphaned observations.
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
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			created_at
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
			&intent.IntentID, &intent.TenantID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.CreatedAt,
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
		obsID := cs.SettlementObservationID
		candidates = append(candidates, models.AttachmentCandidate{
			CandidateID:             uuid.New(),
			AttachmentJobID:         jobID,
			TenantID:                tenantID,
			SettlementObservationID: obsID,
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

func buildUnresolvedDecision(tenantID uuid.UUID, intentID uuid.UUID, jobID uuid.UUID, reasonCode string) models.AttachmentDecision {
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

	result := map[string]interface{}{
		"intent_carriers": intentCarriers,
	}

	if topScore != nil {
		result["match_flags"] = map[string]interface{}{
			"exact_ref_match":        topScore.ExactRefMatch,
			"client_ref_match":       topScore.ClientRefMatch,
			"provider_ref_match":     topScore.ProviderRefMatch,
			"bank_ref_match":         topScore.BankRefMatch,
			"batch_match":            topScore.BatchMatch,
			"amount_match":           topScore.AmountMatch,
			"currency_match":         topScore.CurrencyMatch,
			"time_window_match":      topScore.TimeWindowMatch,
			"source_system_match":    topScore.SourceSystemMatch,
			"zord_signature_match":   topScore.ZordSignatureMatch,
			"composite_match":        topScore.CompositeMatch,
			"has_hard_conflict":      topScore.HasHardConflict,
			"has_any_conflict":       topScore.HasAnyConflict,
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

func findIntentByID(intents []models.CanonicalIntent, id uuid.UUID) *models.CanonicalIntent {
	for i := range intents {
		if intents[i].IntentID == id {
			return &intents[i]
		}
	}
	return nil
}

func computeDelayDays(intent models.CanonicalIntent, obs models.CanonicalSettlementObservation) int {
	if intent.IntendedExecutionAt == nil || obs.ValueDate == nil {
		return 0
	}
	intentDay := intent.IntendedExecutionAt.Truncate(24 * time.Hour)
	settleDay := obs.ValueDate.Truncate(24 * time.Hour)
	return int(settleDay.Sub(intentDay).Hours() / 24)
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
		switch d.DecisionType {
		case models.DecisionMatchUnresolved, models.DecisionMatchAmbiguous, models.DecisionMatchConflicted:
		default:
			continue
		}

		intent, ok := intentByID[d.IntentID]
		if !ok {
			continue
		}

		reasonCode := unresolvedIntentReasonCode(d.DecisionType, d.DecisionReasonCode)
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
			ReasonCode:        reasonCode,
			Amount:            intent.Amount,
			CurrencyCode:      intent.CurrencyCode,
			CreatedAt:         time.Now().UTC(),
		})
	}
	return records
}

func unresolvedIntentReasonCode(decisionType string, decisionReasonCode string) string {
	switch decisionType {
	case models.DecisionMatchConflicted:
		return models.UnresolvedReasonOnlyConflictedCandidatesFound
	case models.DecisionMatchAmbiguous:
		return models.UnresolvedReasonOnlyAmbiguousCandidatesFound
	case models.DecisionMatchUnresolved:
		if decisionReasonCode != "" {
			return decisionReasonCode
		}
		return models.UnresolvedReasonNoSettlementObservationFound
	default:
		return decisionReasonCode
	}
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
	totalIntendedAmount decimal.Decimal,
	originalObservationAmount decimal.Decimal,
) models.BatchAttachmentSummary {
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
		TotalIntendedAmount:      totalIntendedAmount,
		TotalObservationCount:    len(obsAmountMap),
		OrphanObservationCount:   len(allOrphans),
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
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
		case models.DecisionMatchAmbiguous:
			summary.AmbiguousCount++
		case models.DecisionMatchUnresolved:
			summary.UnresolvedCount++
		case models.DecisionMatchConflicted:
			summary.ConflictedCount++
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
	summary.MatchedIntendedAmount = summary.TotalIntendedAmount
	summary.MatchedObservedAmount = summary.TotalObservedAmount

	summary.MatchedPairVariance = summary.MatchedIntendedAmount.Sub(summary.MatchedObservedAmount).Abs()
	summary.TotalVariance = summary.MatchedPairVariance
	summary.NetBatchDelta = summary.OriginalSettledAmount.Sub(summary.OriginalIntendedAmount)

	for _, v := range variances {
		if v.FeeVariance != nil {
			summary.TotalFeeAmount = summary.TotalFeeAmount.Add(*v.FeeVariance)
		}
		if v.DeductionVariance != nil {
			summary.TotalDeductionAmount = summary.TotalDeductionAmount.Add(*v.DeductionVariance)
		}
	}
	summary.NetUnexplainedVariance = summary.MatchedPairVariance.Sub(summary.TotalFeeAmount).Sub(summary.TotalDeductionAmount).Abs()

	summary.IntentCountCoverage = ratioCoverage(float64(summary.MatchedIntentCount), float64(summary.TotalIntentCount))
	summary.IntentValueCoverage = decimalCoverage(summary.MatchedIntendedAmount, summary.OriginalIntendedAmount)
	summary.ObservedCountAllocationCoverage = ratioCoverage(float64(summary.MatchedObservationCount), float64(summary.TotalObservationCount))
	summary.ObservedValueAllocationCoverage = decimalCoverage(summary.MatchedObservedAmount, summary.OriginalSettledAmount)

	if matchedScoreCount > 0 {
		summary.AggregateScore = summary.AggregateScore / matchedScoreCount
		summary.AggregateMatchConfidence = summary.AggregateMatchConfidence / matchedScoreCount
		summary.AmbiguityScore = summary.AmbiguityScore / matchedScoreCount
	}

	ambiguousCount := summary.AmbiguousCount
	conflictedCount := summary.ConflictedCount
	unresolvedIntentCount := summary.UnresolvedCount
	orphanObservationCount := summary.OrphanObservationCount
	tolerance := decimal.NewFromInt(0)

	switch {
	case ambiguousCount > 0 || conflictedCount > 0:
		summary.BatchAttachmentStatus = models.BatchStatusRequiresReview
	case unresolvedIntentCount > 0 || orphanObservationCount > 0:
		summary.BatchAttachmentStatus = models.BatchStatusPartiallySettled
	case summary.NetUnexplainedVariance.GreaterThan(tolerance):
		summary.BatchAttachmentStatus = models.BatchStatusRequiresReview
	default:
		summary.BatchAttachmentStatus = models.BatchStatusFullySettled
	}

	return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE LAYER
// ─────────────────────────────────────────────────────────────────────────────

// advisoryLockKey derives a stable int64 advisory lock key from the combination
// of tenant UUID and scope_ref string. We XOR the high and low halves of a
// SHA-256 hash so collisions are astronomically unlikely across tenants.
func advisoryLockKey(tenantID uuid.UUID, scopeRef string) int64 {
	h := sha256.Sum256([]byte(tenantID.String() + "|" + scopeRef))
	// Fold the 32-byte hash into a signed int64 via XOR of four 8-byte words.
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

func insertAttachmentJob(ctx context.Context, job *models.AttachmentJob) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO attachment_jobs (
			attachment_job_id, tenant_id, job_scope_type, scope_ref,
			matching_ruleset_version, status,
			candidate_count_total, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			started_at, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		job.AttachmentJobID, job.TenantID, job.JobScopeType, job.ScopeRef,
		job.MatchingRulesetVersion, job.Status,
		0, 0, 0, 0, 0, 0,
		job.StartedAt, job.CreatedAt,
	)
	return err
}

func persistAttachmentOutputs(
	ctx context.Context,
	job *models.AttachmentJob,
	candidates []models.AttachmentCandidate,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	allOrphans []models.OrphanSettlementRecord,
	unresolvedIntents []models.UnresolvedIntentRecord,
	batchSummary models.BatchAttachmentSummary,
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

	// Persist candidates.
	for _, c := range candidates {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO attachment_candidates (
				candidate_id, attachment_job_id, tenant_id,
				settlement_observation_id, intent_id, candidate_rank,
				exact_ref_match_flag, client_ref_match_flag, provider_ref_match_flag,
				bank_ref_match_flag, batch_match_flag,
				amount_match_flag, currency_match_flag, time_window_match_flag,
				source_system_match_flag, zord_signature_match_flag, composite_match_flag,
				score_total, score_breakdown_json, confidence_bucket, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
			) ON CONFLICT DO NOTHING`,
			c.CandidateID, c.AttachmentJobID, c.TenantID,
			c.SettlementObservationID, c.IntentID, c.CandidateRank,
			c.ExactRefMatchFlag, c.ClientRefMatchFlag, c.ProviderRefMatchFlag,
			c.BankRefMatchFlag, c.BatchMatchFlag,
			c.AmountMatchFlag, c.CurrencyMatchFlag, c.TimeWindowMatchFlag,
			c.SourceSystemMatchFlag, c.ZordSignatureMatchFlag, c.CompositeMatchFlag,
			c.ScoreTotal, c.ScoreBreakdownJSON, c.ConfidenceBucket, c.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert candidate: %w", err)
		}
	}

	// Persist decisions (upsert by intent+job to allow replays).
	for _, d := range decisions {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO attachment_decisions (
				attachment_decision_id, tenant_id,
				settlement_observation_id, intent_id, attachment_job_id,
				decision_type, decision_reason_code, decision_reason_detail_json,
				matching_ruleset_version,
				winning_score, runner_up_score, score_margin,relative_score_margin,
				confidence_score, match_confidence, ambiguity_score,
				supporting_carriers_json, candidate_set_hash, candidate_set_size,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
			) ON CONFLICT (intent_id, attachment_job_id) DO UPDATE SET
				settlement_observation_id = EXCLUDED.settlement_observation_id,
				decision_type              = EXCLUDED.decision_type,
				decision_reason_code       = EXCLUDED.decision_reason_code,
				decision_reason_detail_json = EXCLUDED.decision_reason_detail_json,
				winning_score              = EXCLUDED.winning_score,
				runner_up_score            = EXCLUDED.runner_up_score,
				score_margin               = EXCLUDED.score_margin,
				relative_score_margin      = EXCLUDED.relative_score_margin,
				confidence_score           = EXCLUDED.confidence_score,
				match_confidence           = EXCLUDED.match_confidence,
				ambiguity_score = EXCLUDED.ambiguity_score,
				supporting_carriers_json   = EXCLUDED.supporting_carriers_json,
				candidate_set_hash         = EXCLUDED.candidate_set_hash,
				candidate_set_size         = EXCLUDED.candidate_set_size,
				intent_id                  = EXCLUDED.intent_id,
				updated_at                 = EXCLUDED.updated_at`,
			d.AttachmentDecisionID, d.TenantID,
			d.SettlementObservationID, d.IntentID, d.AttachmentJobID,
			d.DecisionType, d.DecisionReasonCode, d.DecisionReasonDetailJSON,
			d.MatchingRulesetVersion,
			d.WinningScore, d.RunnerUpScore, d.ScoreMargin, d.RelativeScoreMargin,
			d.ConfidenceScore, d.MatchConfidence, d.AmbiguityScore,
			d.SupportingCarriersJSON, d.CandidateSetHash, d.CandidateSetSize,
			d.CreatedAt, d.UpdatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert decision: %w", err)
		}
	}

	// Persist variance records (includes new variance_type and whitelist columns).
	for _, v := range variances {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO variance_records (
				variance_record_id, tenant_id,
				attachment_decision_id, intent_id, settlement_observation_id,
				amount_variance, deduction_variance, fee_variance,
				currency_match_flag, status_variance_flag,
				value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
				provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
				variance_type,
				variance_severity, variance_reason_codes_json,
				is_whitelisted, whitelist_policy_id, whitelist_policy_version,
				whitelist_reason_code, whitelist_explanation,
				created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
			) ON CONFLICT DO NOTHING`,
			v.VarianceRecordID, v.TenantID,
			v.AttachmentDecisionID, v.IntentID, v.SettlementObservationID,
			v.AmountVariance, v.DeductionVariance, v.FeeVariance,
			v.CurrencyMatchFlag, v.StatusVarianceFlag,
			v.ValueDateMismatchFlag, v.SettlementDelayDays, v.CrossPeriodFlag,
			v.ProviderRefMissingFlag, v.BankRefMissingFlag, v.EvidenceGapFlag,
			v.VarianceType,
			v.VarianceSeverity, v.VarianceReasonCodesJSON,
			v.IsWhitelisted, v.WhitelistPolicyID, v.WhitelistPolicyVersion,
			v.WhitelistReasonCode, v.WhitelistExplanation,
			v.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert variance: %w", err)
		}
	}

	// Persist orphaned observations (reverse scan output).
	for _, o := range allOrphans {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO orphan_settlement_records (
				orphan_id, tenant_id, attachment_job_id,
				settlement_observation_id, batch_id,
				unresolved_reason, amount, currency_code, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9
			) ON CONFLICT DO NOTHING`,
			o.OrphanID, o.TenantID, o.AttachmentJobID,
			o.SettlementObservationID, o.BatchID,
			o.UnresolvedReason, o.Amount, o.CurrencyCode, o.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert orphan: %w", err)
		}
	}

	// Persist unresolved / ambiguous / conflicted intents (reverse scan output).
	for _, u := range unresolvedIntents {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO unresolved_intent_records (
				unresolved_id, tenant_id, attachment_job_id,
				intent_id, batch_id, expected_window_end,
				reason_code, amount, currency_code, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10
			) ON CONFLICT DO NOTHING`,
			u.UnresolvedID, u.TenantID, u.AttachmentJobID,
			u.IntentID, u.BatchID, u.ExpectedWindowEnd,
			u.ReasonCode, u.Amount, u.CurrencyCode, u.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert unresolved intent: %w", err)
		}
	}

	// Persist batch summary atomically with all other outputs.
	// This was previously a separate db.DB.ExecContext call after tx.Commit(),
	// meaning a crash between commit and summary insert left the job COMPLETED
	// with no batch summary — permanently lost. Moving it inside the transaction
	// guarantees both succeed or both roll back together.
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
			unresolved_intended_amount, ambiguous_observed_amount, conflicted_observed_amount, unresolved_observed_amount,
			total_fee_amount, total_deduction_amount, net_unexplained_variance,
			intent_count_coverage, intent_value_coverage,
			observed_count_allocation_coverage, observed_value_allocation_coverage,
			batch_attachment_status, avg_matched_attachment_quality, avg_matched_attachment_ambiguity, avg_matched_attachment_confidence, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
			$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
			$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
			$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
		) ON CONFLICT DO NOTHING`,
		batchSummary.BatchAttachmentSummaryID, batchSummary.TenantID, batchSummary.BatchID, batchSummary.SourceReference,
		batchSummary.AttachmentJobID,
		batchSummary.TotalIntentCount, batchSummary.TotalObservationCount, batchSummary.ExactMatchCount, batchSummary.HighConfidenceCount,
		batchSummary.AmbiguousCount, batchSummary.UnresolvedCount, batchSummary.ConflictedCount, batchSummary.OrphanObservationCount,
		batchSummary.MatchedIntentCount, batchSummary.MatchedObservationCount,
		batchSummary.OriginalIntendedAmount, batchSummary.OriginalSettledAmount,
		batchSummary.TotalIntendedAmount, batchSummary.TotalObservedAmount, batchSummary.TotalVariance,
		batchSummary.MatchedIntendedAmount, batchSummary.MatchedObservedAmount, batchSummary.OrphanObservedAmount,
		batchSummary.MatchedPairVariance, batchSummary.NetBatchDelta,
		batchSummary.UnresolvedIntendedAmount, batchSummary.AmbiguousObservedAmount, batchSummary.ConflictedObservedAmount, batchSummary.UnresolvedObservedAmount,
		batchSummary.TotalFeeAmount, batchSummary.TotalDeductionAmount, batchSummary.NetUnexplainedVariance,
		batchSummary.IntentCountCoverage, batchSummary.IntentValueCoverage,
		batchSummary.ObservedCountAllocationCoverage, batchSummary.ObservedValueAllocationCoverage,
		batchSummary.BatchAttachmentStatus, batchSummary.AggregateScore, batchSummary.AmbiguityScore, batchSummary.AggregateMatchConfidence,
		batchSummary.CreatedAt, batchSummary.UpdatedAt,
	); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: insert batch summary: %w", err)
	}

	// Update job counters and mark complete.
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

	// Update in-memory job for caller.
	job.Status = "COMPLETED"
	job.ExactMatchCount = exact
	job.HighConfidenceCount = high
	job.AmbiguousCount = ambiguous
	job.UnresolvedCount = unresolved
	job.ConflictedCount = conflicted
	job.CompletedAt = &completedAt
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────

func loadObservationsByBatch(ctx context.Context, tenantID uuid.UUID, batchRef string) ([]models.CanonicalSettlementObservation, error) {
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
		WHERE tenant_id = $1 AND (LOWER(batch_reference) = LOWER($2) OR LOWER(client_batch_id) = LOWER($2) OR LOWER(settlement_batch_id) = LOWER($2))
		ORDER BY observation_timestamp`,
		tenantID, batchRef,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanObservations(rows)
}

func loadObservationsByJobID(ctx context.Context, tenantID uuid.UUID, jobID string) ([]models.CanonicalSettlementObservation, error) {
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

func loadObservationByID(ctx context.Context, tenantID uuid.UUID, obsID uuid.UUID) (*models.CanonicalSettlementObservation, error) {
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
		WHERE tenant_id = $1 AND settlement_observation_id = $2`,
		tenantID, obsID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	obs, err := scanObservations(rows)
	if err != nil {
		return nil, err
	}
	if len(obs) == 0 {
		return nil, fmt.Errorf("observation not found: %s", obsID)
	}
	return &obs[0], nil
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
		AmbiguityMarginThreshold: 0.15, // stored as 0-1; engine converts to raw points
		RequiresBankRefForExact:  false,
		Status:                   "ACTIVE",
	}
}

// strPtr and safeDeref are defined in settlement_ingest_service.go (same package).

// loadParsedRowsBySourceRowRefs fetches settlement_parsed_rows for all given
// source_row_ref values in a single query and returns a map keyed by source_row_ref.
// This avoids N+1 queries when building leaf bundles after an attachment run.
func loadParsedRowsBySourceRowRefs(
	ctx context.Context,
	tenantID uuid.UUID,
	rowRefs []string,
) (map[string]*models.SettlementParsedRow, error) {
	if len(rowRefs) == 0 {
		return map[string]*models.SettlementParsedRow{}, nil
	}

	// Build a parameterised ANY($2) query.
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			parsed_row_id, tenant_id, settlement_envelope_id,
			source_file_ref, source_row_ref,
			raw_line_hash,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, created_at
		FROM settlement_parsed_rows
		WHERE tenant_id = $1
		  AND source_row_ref = ANY($2)`,
		tenantID,
		pq.Array(rowRefs),
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
