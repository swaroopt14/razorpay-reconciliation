package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
	"zord-outcome-engine/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// SettlementUploadHandler manages end-to-end settlement file ingestion.
//
// FIX #18: SeedDefaultAttachmentRuleProfile replaced with ensureRuleProfileSeeded
//          (at-most-once per tenant per process, via sync.Map cache).
//
// FIX #14: attachment job pre-registration now includes stale_after so the
//          reaper goroutine can recover stuck jobs after EC2 replacement.
//
// FIX #20: PersistParseErrorsBatch error is now logged instead of silently
//          swallowed with _ =.
func (h *Handler) SettlementUploadHandler(c *gin.Context) {
	// ── PRE-FLIGHT ───────────────────────────────────────────────────────────
		const maxPayloadSize = 1000 * 1024 // 1000 KB
	if c.Request.ContentLength > maxPayloadSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error": fmt.Sprintf("Payload size exceeds maximum allowed limit %d kilobytes", maxPayloadSize/1024),
			"code":  "PAYLOAD_TOO_LARGE",
		})
		c.Abort()
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPayloadSize)
	
	// Validate early to avoid processing invalid requests.
	tenantIDRaw := c.Query("tenant_id")
	tenantID, err := uuid.Parse(tenantIDRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	// FIX #18: at-most-once seed via cache instead of per-request DB upsert.
	ensureRuleProfileSeeded(c.Request.Context(), tenantID)

	psp := strings.ToLower(strings.TrimSpace(c.Query("psp")))
	if psp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "psp query param is required (e.g. ?psp=razorpay)"})
		return
	}

	profile, ok := models.GetProfile(psp)
	if !ok {
		supportedKeys := make([]string, 0, len(models.KnownProfiles))
		for k := range models.KnownProfiles {
			supportedKeys = append(supportedKeys, k)
		}
		sort.Strings(supportedKeys)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("unsupported psp %q — supported: %s",
				psp, strings.Join(supportedKeys, ", ")),
		})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	lowerName := strings.ToLower(header.Filename)
	allowedExt := []string{".csv", ".xlsx", ".xls"}
	hasAllowedExt := false
	for _, ext := range allowedExt {
		if strings.HasSuffix(lowerName, ext) {
			hasAllowedExt = true
			break
		}
	}
	if !hasAllowedExt {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type: use .csv, .xlsx, or .xls"})
		return
	}

	// ── PHASE 1: METRICS & STORAGE ───────────────────────────────────────────
	hasher := sha256.New()
	fileBytes, err := io.ReadAll(io.TeeReader(file, hasher))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	fileHash := hex.EncodeToString(hasher.Sum(nil))
	fileSize := int64(len(fileBytes))

	log.Printf("settlement.upload.metrics tenant_id=%s filename=%s hash=%s size=%d",
		tenantID, header.Filename, fileHash, fileSize)

	// ── IDEMPOTENCY ───────────────────────────────────────────────────────────
	externalBatchIDRaw := strings.TrimSpace(c.Query("batch_id"))
	if externalBatchIDRaw == "" {
		externalBatchIDRaw = strings.TrimSpace(c.GetHeader("Batch-ID"))
	}
	forceReprocess := strings.ToLower(strings.TrimSpace(
		c.GetHeader("X-Zord-Force-Reprocess"))) == "true"
	reprocessReason := strings.TrimSpace(c.GetHeader("X-Zord-Force-Reprocess-Reason"))

	svc := &services.SettlementIngestService{S3: h.S3store}

	clientBatchID := externalBatchIDRaw
	if clientBatchID == "" {
		clientBatchID = uuid.New().String()
	}

	existingBatch, err := svc.FindBatchByClientID(c.Request.Context(), tenantID, psp, clientBatchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if existingBatch != nil {
		sameFile := existingBatch.ActiveRunFileSHA256 == fileHash

		if sameFile && !forceReprocess {
			log.Printf("settlement.upload.duplicate tenant_id=%s batch=%s active_run=%s",
				tenantID, clientBatchID, existingBatch.CurrentActiveRunID)
			c.JSON(http.StatusOK, gin.H{
				"settlement_batch_id": existingBatch.SettlementBatchID,
				"active_run_id":       existingBatch.CurrentActiveRunID,
				"client_batch_id":     clientBatchID,
				"status":              existingBatch.ActiveRunStatus,
				"already_processed":   true,
				"message":             "file already ingested for this batch - use X-Zord-Force-Reprocess: true to reprocess",
			})
			return
		}

		if !sameFile && !forceReprocess {
			c.JSON(http.StatusConflict, gin.H{
				"error":               "BATCH_CONTENT_CHANGED",
				"settlement_batch_id": existingBatch.SettlementBatchID,
				"client_batch_id":     clientBatchID,
				"message":             "a different file was previously ingested for this batch - add X-Zord-Force-Reprocess: true and X-Zord-Force-Reprocess-Reason header to reprocess",
			})
			return
		}

		if reprocessReason == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "X-Zord-Force-Reprocess-Reason header is required when force reprocessing",
				"allowed": []string{"CLIENT_CORRECTED_FILE", "PARSER_FIX", "BACKFILL", "MANUAL"},
			})
			return
		}
	}

	envelopeID, _, objRef, err := h.S3store.StoreRawPayload(c.Request.Context(), fileBytes, tenantID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "S3 storage failed: " + err.Error()})
		return
	}

	ingestRunID, settlementBatchID, runNumber, err := svc.RegisterBatchAndRun(
		c.Request.Context(),
		tenantID, psp, clientBatchID,
		existingBatch,
		envelopeID, profile, fileHash,
		forceReprocess, reprocessReason,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register run: " + err.Error()})
		return
	}

	previousRunID := ""
	if existingBatch != nil {
		previousRunID = existingBatch.CurrentActiveRunID
	}

	c.JSON(http.StatusAccepted, gin.H{
		"ingest_run_id":          ingestRunID,
		"settlement_batch_id":    settlementBatchID,
		"client_batch_id":        clientBatchID,
		"settlement_envelope_id": envelopeID,
		"status":                 "ACCEPTED",
		"psp":                    psp,
		"mapping_profile_id":     profile.ProfileID,
		"run_number":             runNumber,
		"force_reprocess":        forceReprocess,
		"file": gin.H{
			"name":       header.Filename,
			"size_bytes": fileSize,
			"sha256":     fileHash,
		},
		"processing_status": "PARSING_IN_PROGRESS",
		"poll_url":          fmt.Sprintf("/v1/settlement/jobs/%s", ingestRunID),
		"received_at":       time.Now().UTC().Format(time.RFC3339),
	})

	// ── ASYNC BACKGROUND PIPELINE ─────────────────────────────────────────────
	bgCtx, cancel := backgroundJobContext()
	go func(
		bgCtx context.Context,
		pspProfile models.MappingProfile,
		bgIngestRunID string,
		bgSettlementBatchID string,
		bgPreviousRunID string,
		bgRunNumber int,
		bgTenant uuid.UUID,
		bgEnvelope uuid.UUID,
		bgRef string,
		bgClientBatchID string,
		data []byte,
	) {
		defer cancel()

		waitStart := acquireJobSlot()
		defer releaseJobSlot()
		log.Printf("settlement.upload.slot_acquired job_id=%s wait_ms=%d",
			bgIngestRunID, time.Since(waitStart).Milliseconds())

		// ── PHASE 3: PARSING ──────────────────────────────────────────────────
		parser, err := services.GetParser(pspProfile.ParserKey)
		if err != nil {
			svc.MarkJobFailed(bgCtx, bgIngestRunID, "MAPPING_PROFILE_MISSING")
			return
		}

		results, err := parser.Parse(data, bgRef, bgEnvelope, pspProfile)
		if err != nil {
			failureCode := "FILE_CORRUPTED"
			var rle *services.RunLevelError
			if errors.As(err, &rle) {
				failureCode = string(rle.Kind)
			}
			log.Printf("settlement.parse.file_failed job_id=%s code=%s err=%v", bgIngestRunID, failureCode, err)
			svc.MarkJobFailed(bgCtx, bgIngestRunID, failureCode)
			return
		}

		var rowCountFailed int
		var parsedRowItems []services.ParsedRowBatchItem
		var parseErrorItems []services.ParseErrorBatchItem

		// ── PHASE 4: PERSISTENCE ──────────────────────────────────────────────
		for _, result := range results {
			rowRef := fmt.Sprintf("%d", result.RowIndex)

			if result.Failed {
				log.Printf("settlement.parse.row_failed job_id=%s row=%d reason=%s",
					bgIngestRunID, result.RowIndex, result.FailureReason)
				rowCountFailed++
				parsedRowItems = append(parsedRowItems, services.ParsedRowBatchItem{
					RowRef:            rowRef,
					Result:            result,
					Status:            "FAILED",
					FailureReasonCode: result.FailureReason,
				})
				parseErrorItems = append(parseErrorItems, services.ParseErrorBatchItem{
					RowRef:     rowRef,
					ErrorStage: "PARSING",
					Reason:     result.FailureReason,
				})
				continue
			}

			parsedRowItems = append(parsedRowItems, services.ParsedRowBatchItem{
				RowRef: rowRef,
				Result: result,
				Status: "PARSED",
			})
		}

		persistResult, _ := svc.PersistParsedRowsBatch(
			bgCtx, bgTenant, bgIngestRunID, bgEnvelope, bgRef,
			pspProfile, bgSettlementBatchID, bgClientBatchID, parsedRowItems)

		// FIX #20: log parse-error persistence failures rather than silently
		// swallowing them. The run is not failed — parse errors are non-fatal
		// at the row level — but missing audit rows must be visible to operators.
		if parseErr := svc.PersistParseErrorsBatch(
			bgCtx, bgTenant, bgIngestRunID, bgEnvelope,
			pspProfile, bgSettlementBatchID, bgClientBatchID, parseErrorItems,
		); parseErr != nil {
			log.Printf("settlement.upload.parse_errors_persist_failed job_id=%s err=%v — parse error audit rows may be missing",
				bgIngestRunID, parseErr)
		}

		rowCountParsed := persistResult.ParsedCount
		confidenceSum := persistResult.ConfidenceSum

		avgConfidence := 0.0
		if rowCountParsed > 0 {
			avgConfidence = confidenceSum / float64(rowCountParsed)
		}
		if err := svc.FinalizeJob(bgCtx, bgIngestRunID, rowCountParsed, rowCountFailed, avgConfidence); err != nil {
			log.Printf("settlement.upload.finalize_error job_id=%s err=%v", bgIngestRunID, err)
		}

		// ── PHASE 5: CANONICALIZATION ─────────────────────────────────────────
		log.Printf("settlement.upload.canonicalize_start job_id=%s", bgIngestRunID)
		canonSvc := &services.SettlementCanonicalizeService{}
		if err := canonSvc.RunForJob(bgCtx, bgIngestRunID, bgTenant, pspProfile, bgClientBatchID); err != nil {
			log.Printf("settlement.upload.canonicalize_error job_id=%s err=%v", bgIngestRunID, err)
			return
		}

		if err := svc.ActivateRun(bgCtx, bgSettlementBatchID, bgIngestRunID, bgPreviousRunID, bgRunNumber); err != nil {
			log.Printf("settlement.upload.activate_run_error run_id=%s err=%v", bgIngestRunID, err)
		}

		// Trigger attachment engine automatically on canonicalization success.
		// FIX #14: include stale_after in the pre-registration row.
		attachJobID := uuid.New()
		attachNow := time.Now().UTC()
		attachStaleAfter := attachNow.Add(jobStaleAfterDuration)
		if _, insErr := db.DB.ExecContext(bgCtx, `
			INSERT INTO attachment_jobs (
				attachment_job_id, tenant_id, job_scope_type, scope_ref,
				matching_ruleset_version, status,
				candidate_count_total, exact_match_count, high_confidence_count,
				ambiguous_count, unresolved_count, conflicted_count,
				started_at, stale_after, created_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			attachJobID, bgTenant, "INGEST_RUN", bgIngestRunID,
			services.RulesetVersion, "RUNNING",
			0, 0, 0, 0, 0, 0,
			attachNow, attachStaleAfter, attachNow,
		); insErr != nil {
			log.Printf("settlement.upload.attachment_preregister_failed job_id=%s err=%v", bgIngestRunID, insErr)
		}

		log.Printf("settlement.upload.attachment_start ingest_run=%s attachment_job=%s",
			bgIngestRunID, attachJobID)
		engine := &services.AttachmentEngine{}
		if _, err := engine.RunForJob(bgCtx, bgTenant, bgIngestRunID, attachJobID); err != nil {
			log.Printf("settlement.upload.attachment_error ingest_run=%s attachment_job=%s err=%v",
				bgIngestRunID, attachJobID, err)
		}
	}(bgCtx, profile, ingestRunID, settlementBatchID, previousRunID, runNumber,
		tenantID, envelopeID, objRef, clientBatchID, fileBytes)
}
