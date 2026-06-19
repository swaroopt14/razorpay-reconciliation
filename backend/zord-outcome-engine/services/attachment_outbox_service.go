package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT OUTBOX SERVICE
//
// Durable event emission for all attachment domain outputs.
// Events feed Service 6 (evidence) and Service 7 (intelligence).
//
// Event types emitted:
//   attachment.decision.created      — every final decision
//   variance.record.created          — every variance record
//   attachment.batch.updated         — batch-level summary
//   attachment.ambiguous.flagged     — every AMBIGUOUS decision (for review/ops)
//   attachment.unresolved.flagged    — every UNRESOLVED decision
//   attachment.review.required       — CONFLICTED decisions (highest urgency)
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/shopspring/decimal"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// AttachmentOutboxService manages durable event emission for Service 5C.
type AttachmentOutboxService struct{}

// EmitForJob emits all downstream events for a completed attachment job.
func (s *AttachmentOutboxService) EmitForJob(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	parsedByRowRef map[string]*models.SettlementParsedRow,
) error {
	log.Printf("attachment.outbox.start job=%s decisions=%d variances=%d",
		job.AttachmentJobID, len(decisions), len(variances))

	var lastErr error

	// Build a quick lookup of variance by decision ID for pairing.
	varianceByDecision := make(map[uuid.UUID]models.VarianceRecord)
	for _, v := range variances {
		varianceByDecision[v.AttachmentDecisionID] = v
	}

	decisionCount := 0
	ambiguousCount := 0
	unresolvedCount := 0
	conflictedCount := 0

	// 1. Fetch intent details for enrichment
	type intentInfo struct {
		IntentID            uuid.UUID
		ContractID          uuid.UUID
		CorridorID          string
		Currency            string
		Amount              decimal.Decimal
		IntendedExecutionAt *time.Time
	}
	intentLookup := make(map[uuid.UUID]intentInfo)
	var intentIDs []uuid.UUID
	for _, d := range decisions {
		if d.IntentID != uuid.Nil {
			intentIDs = append(intentIDs, d.IntentID)
		}
	}
	if len(intentIDs) > 0 {
		rows, err := db.DB.QueryContext(ctx, `
			SELECT
				intent_id,
				contract_id,
				COALESCE(corridor, ''),
				currency_code,
				amount,
				intended_execution_at
			FROM canonical_intents
			WHERE intent_id = ANY($1)`, pq.Array(intentIDs))
		if err != nil {
			return fmt.Errorf("failed to lookup intents for outbox: %w", err)
		}

		for rows.Next() {
			var idStr, corrID, curr string
			var cID uuid.UUID
			var amt decimal.Decimal
			var intendedAt *time.Time
			if err := rows.Scan(&idStr, &cID, &corrID, &curr, &amt, &intendedAt); err != nil {
				continue
			}
			id, _ := uuid.Parse(idStr)
			intentLookup[id] = intentInfo{
				IntentID:            id,
				ContractID:          cID,
				CorridorID:          corrID,
				Currency:            curr,
				Amount:              amt,
				IntendedExecutionAt: intendedAt,
			}
		}
		rows.Close()
	}

	// 2. Fetch batch summary data for aggregate amounts
	var totalIntendedAmount, totalConfirmedAmount, totalVariance, originalSettledAmount decimal.Decimal
	row := db.DB.QueryRowContext(ctx, `
		SELECT total_intended_amount,original_settled_amount, total_observed_amount, total_variance
		FROM batch_attachment_summaries 
		WHERE attachment_job_id = $1 
		LIMIT 1`,
		job.AttachmentJobID,
	)
	_ = row.Scan(&totalIntendedAmount, &originalSettledAmount, &totalConfirmedAmount, &totalVariance)

	for _, d := range decisions {
		// ── 1. attachment.decision.created ────────────────────────────────
		cID := uuid.Nil
		corrID := ""
		curr := ""
		intendedAmount := decimal.Zero
		settledAmount := decimal.Zero

		if d.IntentID != uuid.Nil {
			if info, ok := intentLookup[d.IntentID]; ok {
				cID = info.ContractID
				corrID = info.CorridorID
				curr = info.Currency
				intendedAmount = info.Amount
			}
		}

		bID := ""
		tID := uuid.Nil

		var bankRef, clientRefCandidate string
		var obsCreatedAt time.Time
		var parsedCreatedAt time.Time
		if d.SettlementObservationID != nil {
			if obs, ok := obsMap[*d.SettlementObservationID]; ok {
				bID = obs.ClientBatchID
				if bID == "" && obs.BatchReference != nil {
					bID = *obs.BatchReference
				}
				settledAmount = obs.Amount
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

				if pr, ok2 := parsedByRowRef[obs.SourceRowRef]; ok2 {
					parsedCreatedAt = pr.CreatedAt
				}
			}
		}

		// intentID is always populated now
		intentID := d.IntentID

		// Defensive enrichment for contract_id if still missing
		if cID == uuid.Nil && corrID != "" {
			var fallbackCID uuid.UUID
			_ = db.DB.QueryRowContext(ctx, `SELECT contract_id FROM dispatch_index WHERE corridor_id = $1 LIMIT 1`, corrID).Scan(&fallbackCID)
			if fallbackCID != uuid.Nil {
				cID = fallbackCID
			}
		}

		intentIDStr := ""
		if intentID != uuid.Nil {
			intentIDStr = intentID.String()
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

		// Fetch observation for metadata enrichment
		var envelopeID string
		if d.SettlementObservationID != nil {
			obs, ok := obsMap[*d.SettlementObservationID]
			if !ok {
				log.Printf("attachment.outbox.missing_obs decision=%s obs=%s", d.AttachmentDecisionID, d.SettlementObservationID)
				continue
			}
			envelopeID = obs.SettlementEnvelopeID.String()
		}

		var obsIDStr string
		if d.SettlementObservationID != nil {
			obsIDStr = d.SettlementObservationID.String()
		}

		payload := map[string]interface{}{
			"event_id":                     uuid.New().String(),
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
			"source_system":                "", // TODO: handle source system for unmatched
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
		// Attach variance summary inline when available (Service 6 convenience).
		if v, ok := varianceByDecision[d.AttachmentDecisionID]; ok {
			payload["variance_summary"] = map[string]interface{}{
				"amount_variance":     v.AmountVariance,
				"variance_severity":   v.VarianceSeverity,
				"value_date_mismatch": v.ValueDateMismatchFlag,
				"cross_period":        v.CrossPeriodFlag,
				"evidence_gap":        v.EvidenceGapFlag,
			}
		}

		if err := s.insertEvent(ctx, d.TenantID, job.AttachmentJobID,
			envelopeID, contractIDStr, bID,
			"attachment_decision", d.AttachmentDecisionID,
			"attachment.decision.created", payload); err != nil {
			lastErr = err
		}
		decisionCount++

		// ── 2. Urgency-scoped flag events ─────────────────────────────────
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
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				envelopeID, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.ambiguous.flagged", flagPayload); err != nil {
				lastErr = err
			}
			ambiguousCount++

		case models.DecisionMatchUnresolved:
			flagPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": obsIDStr,
				"reason_code":               d.DecisionReasonCode,
				"ambiguity_score":           d.AmbiguityScore,
			}
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				envelopeID, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.unresolved.flagged", flagPayload); err != nil {
				lastErr = err
			}
			unresolvedCount++

		case models.DecisionMatchConflicted:
			// Highest urgency — conflicting strong carriers require human or ops review.
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
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				envelopeID, "", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.review.required", reviewPayload); err != nil {
				lastErr = err
			}
			conflictedCount++
		}
	}

	// ── 3. variance.record.created — one per variance record ─────────────
	for _, v := range variances {
		var (
			corridorID        string
			batchID           string
			currency          string
			actualValueDate   *time.Time
			expectedValueDate *time.Time
			intendedAmount    decimal.Decimal
			settledAmount     decimal.Decimal
			envelopeID        string
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
			envelopeID = obs.SettlementEnvelopeID.String()
		}

		if info, ok := intentLookup[v.IntentID]; ok {
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
		if obs, ok := obsMap[v.SettlementObservationID]; ok && obs.TraceID != nil {
			vTraceID = *obs.TraceID
		}
		// Look up obs for source_system — same obsMap used above for corridorID/batchID.
		var vSourceSystem string
		if vobs, ok := obsMap[v.SettlementObservationID]; ok {
			vSourceSystem = vobs.SourceSystem
		}

		vPayload := map[string]interface{}{
			"event_id":              uuid.New().String(),
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
			"source_system":         vSourceSystem, // ProviderID in zord-intelligence
			"cross_period_flag":     v.CrossPeriodFlag,
			"deduction_reason":      "TAX",
			"is_whitelisted":        false,
			"evidence_gap_flags":    evidenceGapFlags,
		}
		if err := s.insertEvent(ctx, v.TenantID, job.AttachmentJobID,
			envelopeID, "", "",
			"variance_record", v.VarianceRecordID,
			"variance.record.created", vPayload); err != nil {
			lastErr = err
		}
	}

	// ── 4. attachment.batch.updated — one per job ─────────────────────────
	var (
		batchID            string
		corridorID         string
		totalCount         int
		successCount       int
		failedCount        int
		pendingCount       int
		reversedCount      int
		aggregateAmbiguity float64
		finalityStatus     string
	)

	// 1. Fetch batch summary data
	row = db.DB.QueryRowContext(ctx, `
		SELECT 
			batch_id, source_reference, total_intended_amount, 
			total_observed_amount, total_variance, batch_attachment_status,
			avg_matched_attachment_ambiguity, avg_matched_attachment_confidence,
			avg_matched_attachment_quality,
			matched_intent_count, total_intent_count,
			matched_pair_variance, net_batch_delta, orphan_observed_amount,
			unresolved_intended_amount, orphan_observation_count, unresolved_count,
			intent_count_coverage, intent_value_coverage,
			observed_count_allocation_coverage, observed_value_allocation_coverage,
			original_intended_amount, original_settled_amount,
			matched_intended_amount, matched_observed_amount
		FROM batch_attachment_summaries 
		WHERE attachment_job_id = $1 
		LIMIT 1`,
		job.AttachmentJobID,
	)
	var summaryBatchID *string
	var summarySourceRef string
	var summaryAmbiguity float64
	var summaryMatchConfidence float64
	var summaryQualityScore float64
	var matchedIntentCount, totalIntentCount int
	var matchedPairVariance, netBatchDelta, orphanObservedAmount, unresolvedIntendedAmount decimal.Decimal
	var orphanObservationCount, unresolvedIntentCount int
	var intentCountCoverage, intentValueCoverage, observedCountCoverage, observedValueCoverage float64
	var originalIntendedAmount, matchedIntendedAmount, matchedObservedAmount decimal.Decimal
	if err := row.Scan(
		&summaryBatchID, &summarySourceRef, &totalIntendedAmount,
		&totalConfirmedAmount, &totalVariance, &finalityStatus,
		&summaryAmbiguity, &summaryMatchConfidence, &summaryQualityScore,
		&matchedIntentCount, &totalIntentCount,
		&matchedPairVariance, &netBatchDelta, &orphanObservedAmount,
		&unresolvedIntendedAmount, &orphanObservationCount, &unresolvedIntentCount,
		&intentCountCoverage, &intentValueCoverage,
		&observedCountCoverage, &observedValueCoverage,
		&originalIntendedAmount, &originalSettledAmount,
		&matchedIntendedAmount, &matchedObservedAmount,
	); err == nil {
		if summaryBatchID != nil {
			batchID = *summaryBatchID
		}
		aggregateAmbiguity = summaryAmbiguity
	}

	// 2. Fetch corridor_id from the first observation in this job
	if len(decisions) > 0 {
		firstObsID := decisions[0].SettlementObservationID
		if firstObsID != nil {
			if obs, ok := obsMap[*firstObsID]; ok {
				corridorID = obs.CorridorID
			}
		}
	}

	// 3. Fetch batch estimate counts and file_sha256 from canonical_settlement_batches and settlement_ingest_runs
	var fileSHA string
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
		row = db.DB.QueryRowContext(ctx, `
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
		if err := row.Scan(&totalCount, &successCount, &failedCount, &pendingCount, &reversedCount, &fileSHA); err != nil {
			log.Printf("attachment.outbox.batch_metadata_lookup_by_ingest_run_failed ingest_run_id=%s scope_ref=%s err=%v", ingestRunID, job.ScopeRef, err)
		}
		log.Printf("attachment.outbox.batch_metadata ingest_run_id=%s scope_ref=%s total=%d success=%d failed=%d pending=%d reversed=%d file_sha256=%q",
			ingestRunID, job.ScopeRef, totalCount, successCount, failedCount, pendingCount, reversedCount, fileSHA)
			
	}

	batchPayload := map[string]interface{}{
		"event_id":                     uuid.New().String(),
		"tenant_id":                    job.TenantID.String(),
		"trace_id":                     uuid.Nil.String(),
		"occurred_at":                  time.Now().UTC().Format(time.RFC3339),
		"batch_id":                     batchID,
		"source_reference":             summarySourceRef,
		"corridor_id":                  corridorID,
		"file_sha256":                  fileSHA,
		"total_count":                  totalCount,
		"success_count":                successCount,
		"failed_count":                 failedCount,
		"pending_count":                pendingCount,
		"reversed_count":               reversedCount,
		"partial_recon_count":          0,
		"total_intent_count":           totalIntentCount,
		"matched_intent_count":         matchedIntentCount,
		"unresolved_intent_count":      unresolvedIntentCount,
		"orphan_observation_count":     orphanObservationCount,
		"total_intended_amount_minor":  totalIntendedAmount.String(),
		"total_confirmed_amount_minor": totalConfirmedAmount.String(),
		"original_intended_amount":     originalIntendedAmount.String(),
		"original_settled_amount":      originalSettledAmount.String(),
		"matched_intended_amount":      matchedIntendedAmount.String(),
		"matched_observed_amount":      matchedObservedAmount.String(),
		"unresolved_intended_amount":   unresolvedIntendedAmount.String(),
		"orphan_observed_amount":       orphanObservedAmount.String(),
		"matched_pair_variance":        matchedPairVariance.String(),
		"net_batch_delta":              netBatchDelta.String(),
		"total_variance_minor":         totalVariance.String(),
		"intent_count_coverage":        intentCountCoverage,
		"intent_value_coverage":        intentValueCoverage,
		"observed_count_allocation_coverage": observedCountCoverage,
		"observed_value_allocation_coverage": observedValueCoverage,
		"avg_matched_attachment_ambiguity": aggregateAmbiguity,
		"ambiguity_score":                    aggregateAmbiguity,
		"avg_matched_attachment_confidence": summaryMatchConfidence,
		"avg_matched_attachment_quality":   summaryQualityScore,
		"aggregate_score":                  summaryQualityScore,
		"aggregate_match_confidence":         summaryMatchConfidence,
		"batch_finality_status":        finalityStatus,
		"job_status":                   job.Status,
	}
	if err := s.insertEvent(ctx, job.TenantID, job.AttachmentJobID,
		"", "", batchID,
		"attachment_job", job.AttachmentJobID,
		"attachment.batch.updated", batchPayload); err != nil {
		lastErr = err
	}

	log.Printf("attachment.outbox.done job=%s decision_events=%d ambiguous=%d unresolved=%d conflicted=%d variance_events=%d",
		job.AttachmentJobID, decisionCount, ambiguousCount, unresolvedCount, conflictedCount, len(variances))

	return lastErr
}

func (s *AttachmentOutboxService) insertEvent(
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
) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("attachment.outbox.marshal_failed type=%s err=%v", eventType, err)
		return err
	}

	// Fix — don't use uuid.Nil for trace_id.
	// If it's missing in context, generate one or leave NULL.
	traceID := uuid.Nil
	if tid, ok := ctx.Value("trace_id").(string); ok {
		if u, err := uuid.Parse(tid); err == nil {
			traceID = u
		}
	}

	var envID *uuid.UUID
	if envelopeID != "" {
		if u, err := uuid.Parse(envelopeID); err == nil {
			envID = &u
		}
	}

	var srr, csc *time.Time
	var br, cr, ad *string
	var mc *float64
	var vdc, am *bool

	var pMap map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &pMap); err == nil {
		if v, ok := pMap["settlement_record_received"].(string); ok && v != "" {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				srr = &t
			}
		}
		if v, ok := pMap["canonical_settlement_created"].(string); ok && v != "" {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				csc = &t
			}
		}
		if v, ok := pMap["bank_reference"].(string); ok {
			s := v
			br = &s
		}
		if v, ok := pMap["client_reference"].(string); ok {
			s := v
			cr = &s
		}
		if v, ok := pMap["attachment_decision"].(string); ok {
			s := v
			ad = &s
		}
		if v, ok := pMap["match_confidence"].(float64); ok {
			f := v
			mc = &f
		}
		if v, ok := pMap["value_date_check"].(bool); ok {
			b := v
			vdc = &b
		}
		if v, ok := pMap["amount_match"].(bool); ok {
			b := v
			am = &b
		}
	}

	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, envelope_id,
			contract_id, batchid,
			aggregate_type, aggregate_id,
			event_type, payload,
			status, retry_count, created_at,
			settlement_record_received, canonical_settlement_created,
			bank_reference, client_reference,
			attachment_decision, match_confidence,
			value_date_check, amount_match
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
		uuid.New(), tenantID, traceID, envID,
		contractID, batchID,
		aggregateType, aggregateID,
		eventType, payloadJSON,
		"PENDING", 0, time.Now().UTC(),
		srr, csc, br, cr, ad, mc, vdc, am,
	)
	if err != nil {
		log.Printf("attachment.outbox.insert_failed type=%s err=%v", eventType, err)
		return fmt.Errorf("attachment outbox insert failed: %w", err)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// MERKLE LEAF BUNDLE EMISSION
//
// EmitLeafBundlesForJob emits one "outcome.leaf_bundle.created" event per
// attached (winner-resolved) decision into outcome_outbox.  zord-relay picks
// these up and publishes them to payments.outcome.events.v1.  zord-evidence
// consumes that topic and calls GeneratePack() immediately — no buffering
// required because all 4 leaf candidates arrive in a single event.
//
// Leaf types per event:
//   1. RAW_SETTLEMENT_LINE              — from settlement_parsed_rows
//   2. CANONICAL_SETTLEMENT_OBSERVATION — from canonical_settlement_observations
//   3. ATTACHMENT_DECISION              — candidate_set_hash
//   4. VARIANCE_DECISION                — deterministic hash of delta fields
//
// Only decisions with a resolved intent_id (EXACT / HIGH_CONFIDENCE) produce
// a leaf bundle.  AMBIGUOUS / UNRESOLVED / CONFLICTED have no winner, so no
// variance record and no intent_id to key the pack on.
// ─────────────────────────────────────────────────────────────────────────────

// leafCandidate is the wire format for one Merkle leaf inside a bundle event.
type leafCandidate struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash"`
	SchemaVersion string `json:"schema_version"`
}

// leafBundlePayload is the full payload of an outcome.leaf_bundle.created event.
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

// EmitLeafBundlesForJob emits outcome_outbox events for all winner-resolved
// decisions produced by a completed attachment job.
//
// obsMap          — map[settlement_observation_id]*CanonicalSettlementObservation
// parsedByRowRef  — map[source_row_ref]*SettlementParsedRow
func (s *AttachmentOutboxService) EmitLeafBundlesForJob(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	parsedByRowRef map[string]*models.SettlementParsedRow,
) error {
	// Build fast lookup: decision_id → variance_record
	vrByDecision := make(map[uuid.UUID]*models.VarianceRecord, len(variances))
	for i := range variances {
		vrByDecision[variances[i].AttachmentDecisionID] = &variances[i]
	}

	var lastErr error
	emitted := 0

	// Build a lookup for ingest_run_id -> file_sha256 to support Leaf 5: RAW_SETTLEMENT_FILE.
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
		rows, err := db.DB.QueryContext(ctx, `SELECT ingest_run_id, file_sha256 FROM settlement_ingest_runs WHERE ingest_run_id = ANY($1)`, pq.Array(ids))
		if err == nil {
			for rows.Next() {
				var rid, sha string
				if err := rows.Scan(&rid, &sha); err == nil {
					shaMap[rid] = sha
				}
			}
			rows.Close()
		} else {
			log.Printf("leaf_bundle.sha_fetch_failed err=%v", err)
		}
	}

	for _, d := range decisions {
		// Only emit for decisions that resolved to a specific observation.
		if d.SettlementObservationID == nil {
			continue
		}

		obs, ok := obsMap[*d.SettlementObservationID]
		if !ok {
			log.Printf("leaf_bundle.obs_missing decision=%s obs=%s", d.AttachmentDecisionID, d.SettlementObservationID)
			continue
		}

		// ── Leaf 2: CANONICAL_SETTLEMENT_OBSERVATION ──────────────────────
		leaves := []leafCandidate{
			{
				Type:          "CANONICAL_SETTLEMENT_OBSERVATION",
				Ref:           obs.SettlementObservationID.String(),
				Hash:          obs.CanonicalHash,
				SchemaVersion: "v1",
			},
			// ── Leaf 3: ATTACHMENT_DECISION ───────────────────────────────
			{
				Type:          "ATTACHMENT_DECISION",
				Ref:           d.AttachmentDecisionID.String(),
				Hash:          computeAttachmentDecisionLeafHash(d),
				SchemaVersion: "v1",
			},
		}

		// ── Leaf 1: RAW_SETTLEMENT_LINE ───────────────────────────────────
		// Linked via source_row_ref shared between parsed_rows and observations.
		if pr, ok := parsedByRowRef[obs.SourceRowRef]; ok && pr.RawLineHash != nil && *pr.RawLineHash != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_LINE",
				Ref:           pr.ParsedRowID.String(),
				Hash:          *pr.RawLineHash,
				SchemaVersion: "v1",
			})
		}

		// ── Leaf 4: VARIANCE_DECISION ─────────────────────────────────────
		if vr, ok := vrByDecision[d.AttachmentDecisionID]; ok {
			leaves = append(leaves, leafCandidate{
				Type:          "VARIANCE_DECISION",
				Ref:           vr.VarianceRecordID.String(),
				Hash:          computeVarianceLeafHash(vr),
				SchemaVersion: "v1",
			})
		}

		// ── Leaf 5: RAW_SETTLEMENT_FILE ──────────────────────────────────
		if sha, ok := shaMap[obs.IngestRunID]; ok && sha != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_FILE",
				Ref:           obs.IngestRunID,
				Hash:          sha,
				SchemaVersion: "v1",
			})
		}

		var parsedCreatedAt time.Time
		if pr, ok := parsedByRowRef[obs.SourceRowRef]; ok {
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
		if vr, ok := vrByDecision[d.AttachmentDecisionID]; ok {
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

		if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
			obs.SettlementEnvelopeID.String(), "", batchID,
			"attachment_leaf_bundle", d.AttachmentDecisionID,
			"outcome.leaf_bundle.created", bundle); err != nil {
			lastErr = err
			continue
		}
		emitted++
	}

	log.Printf("leaf_bundle.emitted job=%s count=%d", job.AttachmentJobID, emitted)
	return lastErr
}

// computeAttachmentDecisionLeafHash returns a deterministic SHA-256 hex hash of the
// attachment decision fields that matter for evidence integrity:
//
//	SHA256( intent_id | settlement_observation_id | candidate_set | match_score | ruleset_version )
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
		intent,
		observation,
		d.CandidateSetHash,
		d.WinningScore,
		d.MatchingRulesetVersion,
	)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// computeVarianceLeafHash returns a deterministic SHA-256 hex hash of the
// variance record fields that matter for evidence integrity:
//
//	SHA256( amount_variance | date_variance | status_variance | severity | reason_codes )
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
