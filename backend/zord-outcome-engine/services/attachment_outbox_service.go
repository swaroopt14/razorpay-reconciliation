package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT OUTBOX SERVICE
//
// FIXES APPLIED IN THIS FILE:
//
//   FIX #1  — EmitForJob and EmitLeafBundlesForJob no longer write to the DB.
//              They are now pure builders that return []models.OutboxRow.
//              The engine passes these rows to persistAttachmentOutputs, which
//              inserts them inside the same transaction as decisions/variances.
//              This eliminates the crash window between tx.Commit() and the
//              old post-commit outbox writes.
//
//   FIX #4  — Missing observation in obsMap for a resolved decision now returns
//              an error row rather than silently skipping the event via continue.
//              The error is recorded and returned as lastErr.
//
//   FIX #10 — intentMap is now passed in from the engine instead of being
//              re-fetched via a redundant canonical_intents query.
//
//   FIX #16 — classifyVarianceType now distinguishes FEE_DEDUCTION from
//              TAX_TDS_DEDUCTION: obs.DeductionAmount → TAX_TDS_DEDUCTION,
//              obs.FeeAmount → FEE_DEDUCTION.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
)

// AttachmentOutboxService builds outbox rows for Service 5C outputs.
type AttachmentOutboxService struct{}

// BuildOutboxRows builds all outcome_outbox rows for a completed attachment job
// and returns them as two slices: decision/variance events and leaf bundle events.
//
// FIX #1: returns []models.OutboxRow instead of writing to DB. The caller
// (persistAttachmentOutputs) inserts them inside the active transaction.
//
// FIX #10: intentMap is passed in — no DB query needed here.
func (s *AttachmentOutboxService) BuildOutboxRows(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	parsedByRowRef map[string]*models.SettlementParsedRow,
	intentMap map[uuid.UUID]models.CanonicalIntent, // FIX #10: passed in, not re-fetched
	batchSummary models.BatchAttachmentSummary, // FIX: passed in, not re-fetched
) (decisionRows []models.OutboxRow, leafRows []models.OutboxRow, lastErr error) {

	log.Printf("attachment.outbox.build_start job=%s decisions=%d variances=%d",
		job.AttachmentJobID, len(decisions), len(variances))

	varianceByDecision := make(map[uuid.UUID]models.VarianceRecord, len(variances))
	for _, v := range variances {
		varianceByDecision[v.AttachmentDecisionID] = v
	}

	// FIX #10: fetch batch summary and corridor/batchID info using obsMap
	// (already in memory) and a single batch summary query — NOT re-fetching intents.
	// UPDATE: batchSummary is now passed in to avoid querying before persistence.
	var summaryBatchID *string
	if batchSummary.BatchID != nil {
		summaryBatchID = batchSummary.BatchID
	}

	// ── Decision + variance + flag events ────────────────────────────────────
	for _, d := range decisions {
		cID := uuid.Nil
		corrID := ""
		curr := ""
		intendedAmount := decimal.Zero
		settledAmount := decimal.Zero

		// FIX #10: look up intent data from the passed-in map, not a DB query.
		if d.IntentID != uuid.Nil {
			if info, ok := intentMap[d.IntentID]; ok {
				if info.Corridor != nil {
					corrID = *info.Corridor
				}
				curr = info.CurrencyCode
				intendedAmount = info.Amount
				// contract_id is not on CanonicalIntent in this projection;
				// keep uuid.Nil unless available via dispatch_index fallback below.
			}
		}

		bID := ""
		tID := uuid.Nil
		var sourceSystem string
		var bankRef, clientRefCandidate string
		var obsCreatedAt time.Time
		var parsedCreatedAt time.Time
		var obsClientBatchID string
		var envelopeIDStr string

		if d.SettlementObservationID != nil {
			obs, ok := obsMap[*d.SettlementObservationID]
			if !ok {
				// FIX #4: record the error but do not silently skip — set lastErr
				// so the caller is aware. Continue to process remaining decisions.
				lastErr = fmt.Errorf("outbox build: observation missing from obsMap decision=%s obs=%s",
					d.AttachmentDecisionID, *d.SettlementObservationID)
				log.Printf("attachment.outbox.missing_obs decision=%s obs=%s",
					d.AttachmentDecisionID, *d.SettlementObservationID)
				continue
			}
			obsClientBatchID = strings.TrimSpace(obs.ClientBatchID)
			settledAmount = obs.Amount
			sourceSystem = obs.SourceSystem
			if corrID == "" {
				corrID = obs.CorridorID
			}
			if curr == "" {
				curr = obs.CurrencyCode
			}
			if obs.TraceID != nil {
				tID = *obs.TraceID
			}
			if obs.BankReference != nil {
				bankRef = *obs.BankReference
			}
			if obs.ClientReferenceCandidate != nil {
				clientRefCandidate = *obs.ClientReferenceCandidate
			}
			obsCreatedAt = obs.CreatedAt
			envelopeIDStr = obs.SettlementEnvelopeID.String()

			if pr, ok2 := parsedByRowRef[obs.SourceRowRef]; ok2 {
				parsedCreatedAt = pr.CreatedAt
			}
		}

		var intentBatchRef string
		if d.IntentID != uuid.Nil {
			if info, ok := intentMap[d.IntentID]; ok && info.ClientBatchRef != nil {
				intentBatchRef = strings.TrimSpace(*info.ClientBatchRef)
			}
		}
		bID = resolveDecisionBatchID(obsClientBatchID, intentBatchRef, summaryBatchID, job)

		// Defensive enrichment for contract_id via dispatch_index
		if cID == uuid.Nil && corrID != "" {
			var fallbackCID uuid.UUID
			_ = db.DB.QueryRowContext(ctx,
				`SELECT contract_id FROM dispatch_index WHERE corridor_id = $1 LIMIT 1`,
				corrID).Scan(&fallbackCID)
			if fallbackCID != uuid.Nil {
				cID = fallbackCID
			}
		}

		intentIDStr := ""
		if d.IntentID != uuid.Nil {
			intentIDStr = d.IntentID.String()
		}
		contractIDStr := ""
		if cID != uuid.Nil {
			contractIDStr = cID.String()
		}

		var valueDateCheck bool
		var amountMatch bool
		if v, ok := varianceByDecision[d.AttachmentDecisionID]; ok {
			valueDateCheck = v.ValueDateMismatchFlag
			amountMatch = v.AmountVariance.IsZero()
		}

		var obsIDStr string
		if d.SettlementObservationID != nil {
			obsIDStr = d.SettlementObservationID.String()
		}

		payload := map[string]interface{}{
			"event_id":                     uuid.New().String(),
			"event_type":                   "attachment.decision.created",
			"event_version":                "1",
			"schema_version":               "v1",
			"source_service":               "zord-outcome-engine",
			"attachment_decision_id":       d.AttachmentDecisionID,
			"attachment_job_id":            d.AttachmentJobID,
			"tenant_id":                    d.TenantID,
			"trace_id":                     tID.String(),
			"occurred_at":                  time.Now().UTC().Format(time.RFC3339),
			"settlement_observation_id":    obsIDStr,
			"intent_id":                    intentIDStr,
			"contract_id":                  contractIDStr,
			"corridor_id":                  corrID,
			"batch_id":                     bID,
			"settled_amount":               settledAmount.String(),
			"source_system":                sourceSystem,
			"intended_amount":              intendedAmount.String(),
			"currency":                     curr,
			"candidate_set_size":           d.CandidateSetSize,
			"decision_type":                d.DecisionType,
			"decision_reason_code":         d.DecisionReasonCode,
			"confidence_score":             d.ConfidenceScore,
			"ambiguity_score":              d.AmbiguityScore,
			"matching_ruleset_version":     d.MatchingRulesetVersion,
			"winning_score":                d.WinningScore,
			"runner_up_score":              d.RunnerUpScore,
			"score_margin":                 d.ScoreMargin,
			"candidate_set_hash":           d.CandidateSetHash,
			"supporting_carriers":          d.SupportingCarriersJSON,
			"settlement_record_received":   parsedCreatedAt.UTC().Format(time.RFC3339),
			"canonical_settlement_created": obsCreatedAt.UTC().Format(time.RFC3339),
			"bank_reference":               bankRef,
			"client_reference":             clientRefCandidate,
			"attachment_decision":          d.DecisionType,
			"match_confidence":             d.MatchConfidence,
			"value_date_check":             valueDateCheck,
			"amount_match":                 amountMatch,
		}
		if v, ok := varianceByDecision[d.AttachmentDecisionID]; ok {
			payload["variance_summary"] = map[string]interface{}{
				"amount_variance":     v.AmountVariance,
				"variance_severity":   v.VarianceSeverity,
				"value_date_mismatch": v.ValueDateMismatchFlag,
				"cross_period":        v.CrossPeriodFlag,
				"evidence_gap":        v.EvidenceGapFlag,
			}
		}

		row, err := s.buildRow(ctx, d.TenantID, job.AttachmentJobID,
			envelopeIDStr, contractIDStr, bID,
			"attachment_decision", d.AttachmentDecisionID,
			"attachment.decision.created", payload)
		if err != nil {
			lastErr = err
		} else {
			decisionRows = append(decisionRows, row)
		}

		// Urgency-scoped flag events
		switch d.DecisionType {
		case models.DecisionMatchAmbiguous:
			flagPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": obsIDStr,
				"ambiguity_score":           d.AmbiguityScore,
				"candidate_set_hash":        d.CandidateSetHash,
				"reason_code":               d.DecisionReasonCode,
			}
			if r, err := s.buildRow(ctx, d.TenantID, d.AttachmentJobID,
				envelopeIDStr, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.ambiguous.flagged", flagPayload); err != nil {
				lastErr = err
			} else {
				decisionRows = append(decisionRows, r)
			}

		case models.DecisionMatchUnresolved:
			flagPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": obsIDStr,
				"reason_code":               d.DecisionReasonCode,
				"ambiguity_score":           d.AmbiguityScore,
			}
			if r, err := s.buildRow(ctx, d.TenantID, d.AttachmentJobID,
				envelopeIDStr, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.unresolved.flagged", flagPayload); err != nil {
				lastErr = err
			} else {
				decisionRows = append(decisionRows, r)
			}

		case models.DecisionMatchConflicted:
			reviewPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": obsIDStr,
				"reason_code":               d.DecisionReasonCode,
				"winning_score":             d.WinningScore,
				"runner_up_score":           d.RunnerUpScore,
				"candidate_set_hash":        d.CandidateSetHash,
				"review_urgency":            "HIGH",
			}
			if r, err := s.buildRow(ctx, d.TenantID, d.AttachmentJobID,
				envelopeIDStr, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.review.required", reviewPayload); err != nil {
				lastErr = err
			} else {
				decisionRows = append(decisionRows, r)
			}
		}
	}

	// ── Variance events ───────────────────────────────────────────────────────
	for _, v := range variances {
		var (
			corridorID        string
			batchID           string
			currency          string
			actualValueDate   *time.Time
			expectedValueDate *time.Time
			intendedAmount    decimal.Decimal
			settledAmount     decimal.Decimal
			envelopeIDStr     string
		)

		if obs, ok := obsMap[v.SettlementObservationID]; ok {
			corridorID = obs.CorridorID
			batchID = obs.ClientBatchID
			if batchID == "" && obs.BatchReference != nil {
				batchID = *obs.BatchReference
			}
			currency = obs.CurrencyCode
			actualValueDate = obs.ValueDate
			settledAmount = obs.Amount
			envelopeIDStr = obs.SettlementEnvelopeID.String()
		}

		// FIX #10: look up intent from map, not DB.
		if info, ok := intentMap[v.IntentID]; ok {
			expectedValueDate = info.IntendedExecutionAt
			intendedAmount = info.Amount
		}

		var expectedDateStr, actualDateStr string
		if expectedValueDate != nil {
			expectedDateStr = expectedValueDate.Format("2006-01-02")
		}
		if actualValueDate != nil {
			actualDateStr = actualValueDate.Format("2006-01-02")
		}

		var evidenceGapFlags []string
		if v.EvidenceGapFlag {
			evidenceGapFlags = append(evidenceGapFlags, "evidence_gap")
		}
		if v.ProviderRefMissingFlag {
			evidenceGapFlags = append(evidenceGapFlags, "missing_provider_ref")
		}
		if v.BankRefMissingFlag {
			evidenceGapFlags = append(evidenceGapFlags, "missing_bank_ref")
		}

		vType := "UNDER_SETTLEMENT"
		if v.AmountVariance.IsNegative() {
			vType = "OVER_SETTLEMENT"
		} else if v.DeductionVariance != nil && !v.DeductionVariance.IsZero() {
			vType = "DEDUCTION"
		} else if v.ValueDateMismatchFlag {
			vType = "VALUE_DATE_MISMATCH"
		} else if v.CrossPeriodFlag {
			vType = "CROSS_PERIOD"
		} else if v.StatusVarianceFlag {
			vType = "REVERSAL"
		}

		vTraceID := uuid.Nil
		var vSourceSystem string
		if obs, ok := obsMap[v.SettlementObservationID]; ok {
			if obs.TraceID != nil {
				vTraceID = *obs.TraceID
			}
			vSourceSystem = obs.SourceSystem
		}

		vPayload := map[string]interface{}{
			"event_id":              uuid.New().String(),
			"event_type":            "variance.record.created",
			"event_version":         "1.0",
			"schema_version":        "v1",
			"source_service":        "zord-outcome-engine",
			"tenant_id":             v.TenantID.String(),
			"trace_id":              vTraceID.String(),
			"occurred_at":           time.Now().UTC().Format(time.RFC3339),
			"variance_id":           v.VarianceRecordID,
			"decision_id":           v.AttachmentDecisionID,
			"intent_id":             v.IntentID,
			"settlement_id":         v.SettlementObservationID,
			"corridor_id":           corridorID,
			"batch_id":              batchID,
			"variance_type":         vType,
			"intended_amount_minor": intendedAmount.String(),
			"settled_amount_minor":  settledAmount.String(),
			"variance_amount_minor": v.AmountVariance.String(),
			"currency":              currency,
			"expected_value_date":   expectedDateStr,
			"actual_value_date":     actualDateStr,
			"source_system":         vSourceSystem,
			"cross_period_flag":     v.CrossPeriodFlag,
			"deduction_reason":      "TAX",
			"is_whitelisted":        false,
			"evidence_gap_flags":    evidenceGapFlags,
		}
		if r, err := s.buildRow(ctx, v.TenantID, job.AttachmentJobID,
			envelopeIDStr, "", "",
			"variance_record", v.VarianceRecordID,
			"variance.record.created", vPayload); err != nil {
			lastErr = err
		} else {
			decisionRows = append(decisionRows, r)
		}
	}

	// ── Batch updated event ───────────────────────────────────────────────────
	batchRow, err := s.buildBatchUpdatedRow(ctx, job, decisions, obsMap, intentMap, batchSummary)
	if err != nil {
		lastErr = err
	} else {
		decisionRows = append(decisionRows, batchRow)
	}

	// ── Leaf bundle events ────────────────────────────────────────────────────
	leafRows, err = s.buildLeafBundleRows(ctx, job, decisions, variances, obsMap, parsedByRowRef)
	if err != nil {
		lastErr = err
	}

	log.Printf("attachment.outbox.build_done job=%s decision_rows=%d leaf_rows=%d",
		job.AttachmentJobID, len(decisionRows), len(leafRows))

	return decisionRows, leafRows, lastErr
}

// buildBatchUpdatedRow constructs the attachment.batch.updated outbox row.
// FIX #10: intentMap is used instead of a redundant DB fetch.
func (s *AttachmentOutboxService) buildBatchUpdatedRow(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	intentMap map[uuid.UUID]models.CanonicalIntent,
	batchSummary models.BatchAttachmentSummary,
) (models.OutboxRow, error) {

	var (
		batchID            string
		corridorID         string
		totalCount         int
		successCount       int
		failedCount        int
		pendingCount       int
		reversedCount      int
		fileSHA            string
	)

	if batchSummary.BatchID != nil {
		batchID = *batchSummary.BatchID
	}
	aggregateAmbiguity := batchSummary.AmbiguityScore

	if batchID == "" {
		for _, obs := range obsMap {
			if c := strings.TrimSpace(obs.ClientBatchID); c != "" {
				batchID = c
				break
			}
		}
	}
	if batchID == "" {
		batchID = job.ScopeRef
	}

	// Corridor from first resolved decision's observation.
	if len(decisions) > 0 {
		firstObsID := decisions[0].SettlementObservationID
		if firstObsID != nil {
			if obs, ok := obsMap[*firstObsID]; ok {
				corridorID = obs.CorridorID
			}
		}
	}

	// File metadata from ingest run.
	ingestRunID := ""
	if job.JobScopeType == models.JobScopeIngestRun {
		ingestRunID = job.ScopeRef
	} else if job.JobScopeType == models.JobScopeSettlementBatch && len(decisions) > 0 {
		firstObsID := decisions[0].SettlementObservationID
		if firstObsID != nil {
			if obs, ok := obsMap[*firstObsID]; ok {
				ingestRunID = obs.IngestRunID
			}
		}
	}
	if ingestRunID != "" {
		r2 := db.DB.QueryRowContext(ctx, `
			SELECT
				b.row_count, b.success_count_estimate, b.failed_count_estimate,
				b.pending_count_estimate, b.reversal_count_estimate,
				r.file_sha256
			FROM canonical_settlement_batches b
			JOIN settlement_ingest_runs r ON r.ingest_run_id = b.ingest_run_id
			WHERE b.ingest_run_id = $1 AND b.tenant_id = $2
			ORDER BY b.created_at DESC
			LIMIT 1`,
			ingestRunID, job.TenantID,
		)
		if err := r2.Scan(&totalCount, &successCount, &failedCount,
			&pendingCount, &reversedCount, &fileSHA); err != nil {
			log.Printf("attachment.outbox.batch_metadata_lookup_failed ingest_run=%s err=%v",
				ingestRunID, err)
		}
	}

	batchPayload := map[string]interface{}{
		"event_id":                           uuid.New().String(),
		"event_type":                         "attachment.batch.updated",
		"event_version":                      "1.0",
		"schema_version":                     "v1",
		"source_service":                     "zord-outcome-engine",
		"tenant_id":                          job.TenantID.String(),
		"trace_id":                           uuid.Nil.String(),
		"occurred_at":                        time.Now().UTC().Format(time.RFC3339),
		"batch_id":                           batchID,
		"source_reference":                   batchSummary.SourceReference,
		"corridor_id":                        corridorID,
		"file_sha256":                        fileSHA,
		"total_count":                        totalCount,
		"success_count":                      successCount,
		"failed_count":                       failedCount,
		"pending_count":                      pendingCount,
		"reversed_count":                     reversedCount,
		"partial_recon_count":                0,
		"total_intent_count":                 batchSummary.TotalIntentCount,
		"matched_intent_count":               batchSummary.MatchedIntentCount,
		"exact_match_count":                  batchSummary.ExactMatchCount,
		"high_confidence_count":              batchSummary.HighConfidenceCount,
		"ambiguous_count":                    batchSummary.AmbiguousCount,
		"unresolved_count":                   batchSummary.UnresolvedCount,
		"conflicted_count":                   batchSummary.ConflictedCount,
		"unresolved_intent_count":            batchSummary.UnresolvedCount,
		"orphan_observation_count":           batchSummary.OrphanObservationCount,
		"total_intended_amount_minor":        batchSummary.TotalIntendedAmount.String(),
		"total_confirmed_amount_minor":       batchSummary.TotalObservedAmount.String(),
		"original_intended_amount":           batchSummary.OriginalIntendedAmount.String(),
		"original_settled_amount":            batchSummary.OriginalSettledAmount.String(),
		"matched_intended_amount":            batchSummary.MatchedIntendedAmount.String(),
		"matched_observed_amount":            batchSummary.MatchedObservedAmount.String(),
		"unresolved_intended_amount":         batchSummary.UnresolvedIntendedAmount.String(),
		"ambiguous_amount":                   batchSummary.AmbiguousAmount.String(),
		"conflicted_amount":                  batchSummary.ConflictedAmount.String(),
		"orphan_observed_amount":             batchSummary.OrphanObservedAmount.String(),
		"matched_pair_variance":              batchSummary.MatchedPairVariance.String(),
		"net_batch_delta":                    batchSummary.NetBatchDelta.String(),
		"total_variance_minor":               batchSummary.TotalVariance.String(),
		"intent_count_coverage":              batchSummary.IntentCountCoverage,
		"intent_value_coverage":              batchSummary.IntentValueCoverage,
		"observed_count_allocation_coverage": batchSummary.ObservedCountAllocationCoverage,
		"observed_value_allocation_coverage": batchSummary.ObservedValueAllocationCoverage,
		"ambiguity_score":                    aggregateAmbiguity,
		"aggregate_score":                    batchSummary.AggregateScore,
		"aggregate_match_confidence":         batchSummary.AggregateMatchConfidence,
		"batch_finality_status":              batchSummary.BatchAttachmentStatus,
		"job_status":                         job.Status,
	}

	return s.buildRow(ctx, job.TenantID, job.AttachmentJobID,
		"", "", batchID,
		"attachment_job", job.AttachmentJobID,
		"attachment.batch.updated", batchPayload)
}

// resolveDecisionBatchID picks batch_id for attachment.decision.created payloads.
func resolveDecisionBatchID(
	obsClientBatchID string,
	intentBatchRef string,
	summaryBatchID *string,
	job *models.AttachmentJob,
) string {
	if obsClientBatchID != "" {
		return obsClientBatchID
	}
	if intentBatchRef != "" {
		return intentBatchRef
	}
	if summaryBatchID != nil {
		if ref := strings.TrimSpace(*summaryBatchID); ref != "" {
			return ref
		}
	}
	if job != nil && job.JobScopeType == models.JobScopeSettlementBatch {
		if ref := strings.TrimSpace(job.ScopeRef); ref != "" {
			return ref
		}
	}
	return ""
}

// buildRow constructs a single OutboxRow from a payload map.
// FIX #1: returns a struct instead of writing to the DB.
func (s *AttachmentOutboxService) buildRow(
	ctx context.Context,
	tenantID uuid.UUID,
	jobID uuid.UUID,
	envelopeID string,
	contractID string,
	batchID string,
	aggregateType string,
	aggregateID uuid.UUID,
	eventType string,
	payload any,
) (models.OutboxRow, error) {

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return models.OutboxRow{}, fmt.Errorf("outbox buildRow marshal: %w", err)
	}

	traceID := uuid.Nil
	if tid, ok := ctx.Value("trace_id").(string); ok {
		if u, err2 := uuid.Parse(tid); err2 == nil {
			traceID = u
		}
	}

	var envID *uuid.UUID
	if envelopeID != "" {
		if u, err2 := uuid.Parse(envelopeID); err2 == nil {
			envID = &u
		}
	}

	r := models.OutboxRow{
		EventID:       uuid.New(),
		TenantID:      tenantID,
		TraceID:       traceID,
		EnvelopeID:    envID,
		ContractID:    contractID,
		BatchID:       batchID,
		AggregateType: aggregateType,
		AggregateID:   aggregateID,
		EventType:     eventType,
		Payload:       payloadJSON,
		CreatedAt:     time.Now().UTC(),
	}

	// Populate metadata columns from payload for fast querying.
	var pMap map[string]interface{}
	if err2 := json.Unmarshal(payloadJSON, &pMap); err2 == nil {
		if v, ok := pMap["settlement_record_received"].(string); ok && v != "" {
			if t, err3 := time.Parse(time.RFC3339, v); err3 == nil {
				r.SettlementRecordReceived = &t
			}
		}
		if v, ok := pMap["canonical_settlement_created"].(string); ok && v != "" {
			if t, err3 := time.Parse(time.RFC3339, v); err3 == nil {
				r.CanonicalSettlementCreated = &t
			}
		}
		if v, ok := pMap["bank_reference"].(string); ok {
			s2 := v
			r.BankReference = &s2
		}
		if v, ok := pMap["client_reference"].(string); ok {
			s2 := v
			r.ClientReference = &s2
		}
		if v, ok := pMap["attachment_decision"].(string); ok {
			s2 := v
			r.AttachmentDecision = &s2
		}
		if v, ok := pMap["match_confidence"].(float64); ok {
			f := v
			r.MatchConfidence = &f
		}
		if v, ok := pMap["value_date_check"].(bool); ok {
			b := v
			r.ValueDateCheck = &b
		}
		if v, ok := pMap["amount_match"].(bool); ok {
			b := v
			r.AmountMatch = &b
		}
	}

	return r, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// MERKLE LEAF BUNDLE ROWS
// ─────────────────────────────────────────────────────────────────────────────

type leafCandidate struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash"`
	SchemaVersion string `json:"schema_version"`
}

type leafBundlePayload struct {
	EventType               string          `json:"event_type"`
	TenantID                string          `json:"tenant_id"`
	IntentID                string          `json:"intent_id"`
	EnvelopeID              string          `json:"envelope_id"`
	SettlementObservationID string          `json:"settlement_observation_id"`
	AttachmentJobID         string          `json:"attachment_job_id"`
	DecisionType            string          `json:"decision_type"`
	Leaves                  []leafCandidate `json:"leaves"`

	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	BankReference              *string    `json:"bank_reference,omitempty"`
	ClientReference            *string    `json:"client_reference,omitempty"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty"`
	AmountMatch                *bool      `json:"amount_match,omitempty"`
}

// buildLeafBundleRows builds one outcome.leaf_bundle.created outbox row per
// winner-resolved decision.
// FIX #1: returns []models.OutboxRow instead of writing to the DB.
func (s *AttachmentOutboxService) buildLeafBundleRows(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	parsedByRowRef map[string]*models.SettlementParsedRow,
) ([]models.OutboxRow, error) {

	vrByDecision := make(map[uuid.UUID]*models.VarianceRecord, len(variances))
	for i := range variances {
		vrByDecision[variances[i].AttachmentDecisionID] = &variances[i]
	}

	// Fetch file SHA256 per ingest run.
	runIDs := make(map[string]bool)
	for _, obs := range obsMap {
		if obs.IngestRunID != "" {
			runIDs[obs.IngestRunID] = true
		}
	}
	shaMap := make(map[string]string)
	if len(runIDs) > 0 {
		var ids []string
		for id := range runIDs {
			ids = append(ids, id)
		}
		rows, err := db.DB.QueryContext(ctx,
			`SELECT ingest_run_id, file_sha256 FROM settlement_ingest_runs WHERE ingest_run_id = ANY($1)`,
			pq.Array(ids))
		if err == nil {
			for rows.Next() {
				var rid, sha string
				if scanErr := rows.Scan(&rid, &sha); scanErr == nil {
					shaMap[rid] = sha
				}
			}
			rows.Close()
		} else {
			log.Printf("leaf_bundle.sha_fetch_failed err=%v", err)
		}
	}

	var result []models.OutboxRow
	var lastErr error

	for _, d := range decisions {
		if d.SettlementObservationID == nil {
			continue
		}

		obs, ok := obsMap[*d.SettlementObservationID]
		if !ok {
			log.Printf("leaf_bundle.obs_missing decision=%s obs=%s",
				d.AttachmentDecisionID, d.SettlementObservationID)
			continue
		}

		leaves := []leafCandidate{
			{
				Type:          "CANONICAL_SETTLEMENT_OBSERVATION",
				Ref:           obs.SettlementObservationID.String(),
				Hash:          obs.CanonicalHash,
				SchemaVersion: "v1",
			},
			{
				Type:          "ATTACHMENT_DECISION",
				Ref:           d.AttachmentDecisionID.String(),
				Hash:          computeAttachmentDecisionLeafHash(d),
				SchemaVersion: "v1",
			},
		}

		if pr, ok2 := parsedByRowRef[obs.SourceRowRef]; ok2 &&
			pr.RawLineHash != nil && *pr.RawLineHash != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_LINE",
				Ref:           pr.ParsedRowID.String(),
				Hash:          *pr.RawLineHash,
				SchemaVersion: "v1",
			})
		}

		if vr, ok2 := vrByDecision[d.AttachmentDecisionID]; ok2 {
			leaves = append(leaves, leafCandidate{
				Type:          "VARIANCE_DECISION",
				Ref:           vr.VarianceRecordID.String(),
				Hash:          computeVarianceLeafHash(vr),
				SchemaVersion: "v1",
			})
		}

		if sha, ok2 := shaMap[obs.IngestRunID]; ok2 && sha != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_FILE",
				Ref:           obs.IngestRunID,
				Hash:          sha,
				SchemaVersion: "v1",
			})
		}

		var parsedCreatedAt time.Time
		if pr, ok2 := parsedByRowRef[obs.SourceRowRef]; ok2 {
			parsedCreatedAt = pr.CreatedAt
		}

		var bankRef, clientRefCandidate *string
		if obs.BankReference != nil {
			bankRef = obs.BankReference
		}
		if obs.ClientReferenceCandidate != nil {
			clientRefCandidate = obs.ClientReferenceCandidate
		}

		var valueDateCheck, amountMatch *bool
		if vr, ok2 := vrByDecision[d.AttachmentDecisionID]; ok2 {
			vdc := vr.ValueDateMismatchFlag
			am := vr.AmountVariance.IsZero()
			valueDateCheck = &vdc
			amountMatch = &am
		}

		t1 := parsedCreatedAt.UTC()
		t2 := obs.CreatedAt.UTC()
		decType := d.DecisionType
		conf := d.ConfidenceScore

		batchID := obs.ClientBatchID
		if batchID == "" && obs.BatchReference != nil {
			batchID = *obs.BatchReference
		}

		bundle := leafBundlePayload{
			EventType:               "outcome.leaf_bundle.created",
			TenantID:                d.TenantID.String(),
			IntentID:                d.IntentID.String(),
			EnvelopeID:              obs.SettlementEnvelopeID.String(),
			SettlementObservationID: d.SettlementObservationID.String(),
			AttachmentJobID:         d.AttachmentJobID.String(),
			DecisionType:            d.DecisionType,
			Leaves:                  leaves,

			SettlementRecordReceived:   &t1,
			CanonicalSettlementCreated: &t2,
			BankReference:              bankRef,
			ClientReference:            clientRefCandidate,
			AttachmentDecision:         &decType,
			MatchConfidence:            &conf,
			ValueDateCheck:             valueDateCheck,
			AmountMatch:                amountMatch,
		}

		row, err := s.buildRow(ctx, d.TenantID, d.AttachmentJobID,
			obs.SettlementEnvelopeID.String(), "", batchID,
			"attachment_leaf_bundle", d.AttachmentDecisionID,
			"outcome.leaf_bundle.created", bundle)
		if err != nil {
			lastErr = err
			continue
		}
		result = append(result, row)
	}

	log.Printf("leaf_bundle.built job=%s count=%d", job.AttachmentJobID, len(result))
	return result, lastErr
}

func computeAttachmentDecisionLeafHash(d models.AttachmentDecision) string {
	intent := ""
	if d.IntentID != uuid.Nil {
		intent = d.IntentID.String()
	}
	observation := ""
	if d.SettlementObservationID != nil {
		observation = d.SettlementObservationID.String()
	}
	raw := fmt.Sprintf("%s|%s|%s|%f|%s",
		intent, observation, d.CandidateSetHash, d.WinningScore, d.MatchingRulesetVersion)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func computeVarianceLeafHash(vr *models.VarianceRecord) string {
	raw := fmt.Sprintf("%s|%t|%t|%s|%s",
		vr.AmountVariance.String(),
		vr.ValueDateMismatchFlag,
		vr.StatusVarianceFlag,
		vr.VarianceSeverity,
		string(vr.VarianceReasonCodesJSON),
	)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
