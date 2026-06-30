package handlers

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT HANDLER
//
// HTTP boundary for the attachment & variance engine.
//
// Routes (registered in routes/outcome_route.go):
//   POST /v1/attachment/run           — trigger an attachment job
//   GET  /v1/attachment/decision/intent/:intent_id  — fetch decision for one intent
//   GET  /v1/attachment/batch/:ref    — fetch batch attachment summary
//   POST /v1/intent                   — register a canonical intent (test/dev)
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"log"
	"net/http"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
	"zord-outcome-engine/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RunAttachmentHandler triggers a Service 5C attachment job.
//
// The job is started asynchronously. The handler returns 202 Accepted with the
// job_id immediately. Callers poll:
//
//	GET /v1/attachment/batch/:batch_ref?tenant_id=uuid
//
// to retrieve results once the job_status transitions to COMPLETED.
//
// This avoids HTTP timeouts on large batches. The previous synchronous design
// blocked the handler goroutine for the entire engine run and would be killed
// by the server's 20s WriteTimeout for any non-trivial batch.
//
// Body (JSON):
//
//	{
//	  "tenant_id":                 "uuid",
//	  "job_scope_type":            "SETTLEMENT_BATCH" | "SINGLE_INTENT" | "INGEST_RUN",
//	  "settlement_batch_ref":      "batch-ref-string",   // for SETTLEMENT_BATCH
//	  "intent_id":                 "uuid",               // for SINGLE_INTENT
//	  "ingest_run_id":             "uuid-string"         // for INGEST_RUN
//	}
func (h *Handler) RunAttachmentHandler(c *gin.Context) {
	var req models.AttachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	tenantID, err := uuid.Parse(req.TenantID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	engine := &services.AttachmentEngine{}

	// Validate scope-specific fields and determine which engine method to call
	// before spawning the goroutine — validation errors must return 400, not 202.
	type runFunc func() (*models.AttachmentJob, error)
	var fn runFunc
	var scopeRef string

	switch req.JobScopeType {
	case models.JobScopeSettlementBatch:
		if req.SettlementBatchRef == nil || *req.SettlementBatchRef == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "settlement_batch_ref is required for SETTLEMENT_BATCH scope"})
			return
		}
		ref := *req.SettlementBatchRef
		scopeRef = ref
		fn = func() (*models.AttachmentJob, error) {
			return engine.RunForBatch(context.Background(), tenantID, ref)
		}

	case models.JobScopeSingleIntent:
		if req.IntentID == nil || *req.IntentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "intent_id is required for SINGLE_INTENT scope"})
			return
		}
		intentID, parseErr := uuid.Parse(*req.IntentID)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid intent_id"})
			return
		}
		scopeRef = intentID.String()
		fn = func() (*models.AttachmentJob, error) {
			return engine.RunForSingleIntent(context.Background(), tenantID, intentID)
		}

	case models.JobScopeIngestRun:
		if req.IngestRunID == nil || *req.IngestRunID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ingest_run_id is required for INGEST_RUN scope"})
			return
		}
		runID := *req.IngestRunID
		scopeRef = runID
		fn = func() (*models.AttachmentJob, error) {
			return engine.RunForJob(context.Background(), tenantID, runID)
		}

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_scope_type must be SETTLEMENT_BATCH, SINGLE_INTENT, or INGEST_RUN"})
		return
	}

	// Pre-register the job row as RUNNING so the caller can see it immediately
	// via GET /v1/attachment/batch/:ref, even before the goroutine starts.
	jobID := uuid.New()
	now := time.Now().UTC()
	if _, dbErr := db.DB.ExecContext(c.Request.Context(), `
		INSERT INTO attachment_jobs (
			attachment_job_id, tenant_id, job_scope_type, scope_ref,
			matching_ruleset_version, status,
			candidate_count_total, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			started_at, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		jobID, tenantID, req.JobScopeType, scopeRef,
		services.RulesetVersion, "RUNNING",
		0, 0, 0, 0, 0, 0,
		now, now,
	); dbErr != nil {
		log.Printf("attachment.handler.pre_register_failed tenant=%s err=%v", tenantID, dbErr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register job: " + dbErr.Error()})
		return
	}

	// Launch the engine asynchronously. Any error is written back to the
	// attachment_jobs row so the polling endpoint can surface it.
	go func() {
		job, runErr := fn()
		if runErr != nil {
			log.Printf("attachment.handler.async_run_failed tenant=%s job=%s err=%v", tenantID, jobID, runErr)
			if _, updErr := db.DB.ExecContext(context.Background(), `
				UPDATE attachment_jobs SET status = 'FAILED', completed_at = $1
				WHERE attachment_job_id = $2`,
				time.Now().UTC(), jobID,
			); updErr != nil {
				log.Printf("attachment.handler.status_update_failed job=%s err=%v", jobID, updErr)
			}
			return
		}
		// The engine writes its own COMPLETED status via persistAttachmentOutputs.
		// Log success for observability.
		log.Printf("attachment.handler.async_run_done tenant=%s job=%s exact=%d ambiguous=%d unresolved=%d conflicted=%d",
			tenantID, job.AttachmentJobID,
			job.ExactMatchCount, job.AmbiguousCount, job.UnresolvedCount, job.ConflictedCount)
	}()

	c.JSON(http.StatusAccepted, models.AttachmentResponse{
		AttachmentJobID: jobID.String(),
		Status:          "RUNNING",
		Message:         "Attachment job started. Poll GET /v1/attachment/batch/" + scopeRef + "?tenant_id=" + tenantID.String() + " for results.",
	})
}

// GetAttachmentDecisionByIntentHandler fetches the attachment decision for one canonical intent.
//
// Path: /v1/attachment/decision/intent/:intent_id?tenant_id=uuid
func (h *Handler) GetAttachmentDecisionByIntentHandler(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}
	intentID, err := uuid.Parse(c.Param("intent_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid intent_id"})
		return
	}

	row := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			attachment_decision_id, tenant_id,
			settlement_observation_id, intent_id, attachment_job_id,
			decision_type, decision_reason_code, decision_reason_detail_json,
			matching_ruleset_version,
			winning_score, runner_up_score, score_margin, relative_score_margin,
			confidence_score, match_confidence, ambiguity_score,
			supporting_carriers_json, candidate_set_hash,
			created_at, updated_at
		FROM attachment_decisions
		WHERE tenant_id = $1 AND intent_id = $2
		ORDER BY created_at DESC
		LIMIT 1`,
		tenantID, intentID,
	)

	var d models.AttachmentDecision
	err = row.Scan(
		&d.AttachmentDecisionID, &d.TenantID,
		&d.SettlementObservationID, &d.IntentID, &d.AttachmentJobID,
		&d.DecisionType, &d.DecisionReasonCode, &d.DecisionReasonDetailJSON,
		&d.MatchingRulesetVersion,
		&d.WinningScore, &d.RunnerUpScore, &d.ScoreMargin,
		&d.RelativeScoreMargin, &d.ConfidenceScore, &d.MatchConfidence, &d.AmbiguityScore,
		&d.SupportingCarriersJSON, &d.CandidateSetHash,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no attachment decision found for this intent"})
		return
	}

	resp := models.AttachmentDecisionResponse{Decision: &d}

	// Attach variance record if present.
	vRow := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			variance_record_id, tenant_id, attachment_decision_id,
			intent_id, settlement_observation_id,
			amount_variance, deduction_variance, fee_variance,
			currency_match_flag, status_variance_flag,
			value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
			provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
			variance_severity, variance_reason_codes_json, created_at
		FROM variance_records
		WHERE attachment_decision_id = $1
		LIMIT 1`,
		d.AttachmentDecisionID,
	)
	var v models.VarianceRecord
	if err := vRow.Scan(
		&v.VarianceRecordID, &v.TenantID, &v.AttachmentDecisionID,
		&v.IntentID, &v.SettlementObservationID,
		&v.AmountVariance, &v.DeductionVariance, &v.FeeVariance,
		&v.CurrencyMatchFlag, &v.StatusVarianceFlag,
		&v.ValueDateMismatchFlag, &v.SettlementDelayDays, &v.CrossPeriodFlag,
		&v.ProviderRefMissingFlag, &v.BankRefMissingFlag, &v.EvidenceGapFlag,
		&v.VarianceSeverity, &v.VarianceReasonCodesJSON, &v.CreatedAt,
	); err == nil {
		resp.Variance = &v
	}

	c.JSON(http.StatusOK, resp)
}

// GetBatchAttachmentSummaryHandler returns the attachment summary for a settlement batch.
//
// Path: /v1/attachment/batch/:batch_ref?tenant_id=uuid
func (h *Handler) GetBatchAttachmentSummaryHandler(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}
	batchRef := c.Param("batch_ref")
	if batchRef == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_ref is required"})
		return
	}

	row := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			batch_attachment_summary_id, tenant_id, batch_id, source_reference,
			attachment_job_id,
			total_intent_count, total_observation_count,
			matched_intent_count, matched_observation_count,
			exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count, orphan_observation_count,
			original_intended_amount, original_settled_amount,
			total_intended_amount, total_observed_amount, total_variance,
			matched_intended_amount, matched_observed_amount, orphan_observed_amount,
			matched_pair_variance, net_batch_delta,
			unresolved_intended_amount, ambiguous_amount, conflicted_amount,
			total_fee_amount, total_deduction_amount, net_unexplained_variance,
			intent_count_coverage, intent_value_coverage,
			observed_count_allocation_coverage, observed_value_allocation_coverage,
			batch_attachment_status, avg_matched_attachment_quality, avg_matched_attachment_confidence, avg_matched_attachment_ambiguity, created_at, updated_at
		FROM batch_attachment_summaries
		WHERE tenant_id = $1 AND (batch_id = $2 OR source_reference = $2)
		ORDER BY created_at DESC
		LIMIT 1`,
		tenantID, batchRef,
	)

	var s models.BatchAttachmentSummary
	if err = row.Scan(
		&s.BatchAttachmentSummaryID, &s.TenantID, &s.BatchID, &s.SourceReference,
		&s.AttachmentJobID,
		&s.TotalIntentCount, &s.TotalObservationCount,
		&s.MatchedIntentCount, &s.MatchedObservationCount,
		&s.ExactMatchCount, &s.HighConfidenceCount,
		&s.AmbiguousCount, &s.UnresolvedCount, &s.ConflictedCount, &s.OrphanObservationCount,
		&s.OriginalIntendedAmount, &s.OriginalSettledAmount,
		&s.TotalIntendedAmount, &s.TotalObservedAmount, &s.TotalVariance,
		&s.MatchedIntendedAmount, &s.MatchedObservedAmount, &s.OrphanObservedAmount,
		&s.MatchedPairVariance, &s.NetBatchDelta,
		&s.UnresolvedIntendedAmount, &s.AmbiguousAmount, &s.ConflictedAmount,
		&s.TotalFeeAmount, &s.TotalDeductionAmount, &s.NetUnexplainedVariance,
		&s.IntentCountCoverage, &s.IntentValueCoverage,
		&s.ObservedCountAllocationCoverage, &s.ObservedValueAllocationCoverage,
		&s.BatchAttachmentStatus, &s.AggregateScore, &s.AggregateMatchConfidence, &s.AmbiguityScore, &s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no batch summary found"})
		return
	}

	c.JSON(http.StatusOK, s)
}

// RegisterIntentHandler allows registering a canonical intent for matching.
// This endpoint exists so the attachment engine has intents to match against.
// In production this data would be replicated from Service 2.
//
// Body (JSON): models.CanonicalIntent
func (h *Handler) RegisterIntentHandler(c *gin.Context) {
	var intent models.CanonicalIntent
	if err := c.ShouldBindJSON(&intent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if intent.IntentID == uuid.Nil {
		intent.IntentID = uuid.New()
	}
	if intent.TenantID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id is required"})
		return
	}

	intent.CreatedAt = time.Now().UTC()

	_, err := db.DB.ExecContext(c.Request.Context(), `
		INSERT INTO canonical_intents (
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			source_row_num,
			created_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
		) ON CONFLICT (intent_id) DO UPDATE SET
			client_payout_ref        = EXCLUDED.client_payout_ref,
			client_batch_ref         = EXCLUDED.client_batch_ref,
			amount                   = EXCLUDED.amount,
			currency_code            = EXCLUDED.currency_code,
			governance_state         = EXCLUDED.governance_state,
			beneficiary_fingerprint  = EXCLUDED.beneficiary_fingerprint,
			zord_signature_carrier   = EXCLUDED.zord_signature_carrier,
			source_row_num           = EXCLUDED.source_row_num`,
		intent.IntentID, intent.TenantID,
		intent.ClientPayoutRef, intent.ClientBatchRef, intent.BusinessIdempotencyKey,
		intent.Amount, intent.CurrencyCode,
		intent.IntendedExecutionAt, intent.PayoutType, intent.ProviderHint, intent.Corridor,
		intent.ProofReadinessScore, intent.MatchabilityScore,
		intent.CanonicalHash, intent.GovernanceState,
		intent.BeneficiaryFingerprint, intent.ZordSignatureCarrier,
		intent.SourceRowNum,
		intent.CreatedAt,
	)
	if err != nil {
		log.Printf("attachment.handler.register_intent_failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register intent: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"intent_id": intent.IntentID,
		"status":    "registered",
	})
}
