package handler

import (
	"bytes"
	"context"
	"crypto/sha256"

	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"zord-edge/db"
	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// bulkIngestJobTimeout is the maximum wall-clock duration allowed for a single
// bulk upload request (shared across all its worker goroutines). It is
// configured via BULK_INGEST_JOB_TIMEOUT_MINUTES; defaults to 8 minutes.
var bulkIngestJobTimeout time.Duration

func init() {
	const defaultBulkIngestJobTimeoutMinutes = 8
	minutes := defaultBulkIngestJobTimeoutMinutes
	if v := os.Getenv("BULK_INGEST_JOB_TIMEOUT_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			minutes = n
		} else {
			log.Printf("[BulkHandler] WARNING: BULK_INGEST_JOB_TIMEOUT_MINUTES=%q is not a valid positive integer; using default %d minutes",
				v, defaultBulkIngestJobTimeoutMinutes)
		}
	}
	bulkIngestJobTimeout = time.Duration(minutes) * time.Minute
	log.Printf("[BulkHandler] bulk ingest job timeout set to %v", bulkIngestJobTimeout)
}

type BulkResult struct {
	Row        int    `json:"row"`
	EnvelopeID string `json:"EnvelopeID,omitempty"`
	TraceID    string `json:"Trace_id,omitempty"`
	Status     string `json:"Status"`
	ReceivedAt string `json:"Received_At,omitempty"`
	Error      string `json:"error,omitempty"`
}

type BulkJob struct {
	Row            int
	Payload        []byte
	IdempotencyKey string // client-provided (from CSV/xlsx column) or server-assigned deterministic hash
	SourceRowRef   string
}

type bulkSourceRow struct {
	FileRowNumber int
	Values        []string
}

// BulkIntentHandler ingests a CSV/XLSX into per-row envelopes.
//
// Architectural default: per-row outcomes that map to a business row (parse errors,
// validation failures, duplicate/conflict after idempotency) should surface as
// first-class ingestion results (intents or batch line items) with FAILED/DUPLICATE
// status and structured errors for Intent Journal — not conflated with DLQ, which
// is reserved for dead-letter traffic that never becomes a proper intent (or must
// stay out of normal intent lists).
func (h *Handler) BulkIntentHandler(c *gin.Context) {

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unable to open file"})
		return
	}
	defer src.Close()

	// ── Phase 1: Stream file to S3 while computing hash/size/row-count ────────
	//
	// REQUIREMENT 12: The entire original file must be stored as a file-level
	// RawEnvelope BEFORE any row processing begins. This is source-of-truth for
	// dispute reconstruction, replay after parser upgrades, and batch audit.
	//
	// STREAMING STRATEGY: We cannot hold the full file in memory (original
	// io.ReadAll), but we also cannot drop the file bytes (previous refactor
	// mistake — it removed "file_data" from the envelope, breaking Req 12).
	//
	// Solution: pipe src through an io.TeeReader into a MultiWriter that
	// simultaneously (a) hashes the stream and (b) writes chunks into a
	// fileEnvelopeWriter that accumulates ONLY enough to build the S3 payload.
	// Because ProcessRawIntent/S3store expects a []byte payload today, we still
	// need to buffer — but we do it in one pass rather than two (no ReadAll +
	// re-read). The buffer is released immediately after the file envelope is
	// stored, before any row processing begins.
	//
	// If S3store is later upgraded to accept an io.Reader, the `var fileBuf`
	// block below becomes the only change needed — everything else stays the same.

	hasher := sha256.New()
	var fileBuf bytes.Buffer
	cw := &countingWriter{}

	// TeeReader: every byte read from src is written to MultiWriter.
	// MultiWriter fans to: hash computation + raw file buffer + byte/newline counter.
	tee := io.TeeReader(src, io.MultiWriter(hasher, &fileBuf, cw))

	// Drain the TeeReader — this is the single read pass over the file.
	if _, err := io.Copy(io.Discard, tee); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	fileHash := hex.EncodeToString(hasher.Sum(nil))
	fileSizeBytes := int64(cw.total)
	rowCountEstimate := cw.newlines - 1 // subtract header line, matches original

	// Reset file pointer so the format-specific parser (CSV/xlsx) starts at byte 0.
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset file pointer"})
		return
	}

	tenantID := c.MustGet("tenant_id").(uuid.UUID)
	tenantName := c.MustGet("tenant_name").(string)
	PayloadSize := c.MustGet("PayloadSize").(int64)
	fileTraceID := uuid.Must(uuid.NewV7()).String()

	batchIDHeader := c.GetHeader("Batch-ID")
	originalBatchID := batchIDHeader
	// if batchIDHeader == "" {
	// 	batchIDHeader = uuid.Must(uuid.NewV7()).String()
	// }
	artifactID := uuid.Must(uuid.NewV7()).String()
	artifactVersionId := "ART_V1"
	finalBatchID := &batchIDHeader

	if originalBatchID != "" {
		exists, err := services.CheckBatchIDExists(c.Request.Context(), tenantID, finalBatchID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify batch_id uniqueness"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, gin.H{
				"error": "batch_id must be unique for each tenant",
			})
			return
		}
	}

	// ── Force-Reprocess guard ─────────────────────────────────────────────────
	// X-Zord-Force-Reprocess: true signals the client explicitly wants to
	// reprocess a batch previously detected as duplicate.
	// Batch-ID is REQUIRED when force-reprocessing — it is the nonce that
	// makes reprocess idempotency keys unique and prevents unbounded
	// re-ingestion if the client hammers the endpoint.
	forceReprocess := c.GetHeader("X-Zord-Force-Reprocess") == "true"
	if forceReprocess && originalBatchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Batch-ID header is required when X-Zord-Force-Reprocess is true",
		})
		return
	}

	log.Printf(
		"Bulk file stored | filename=%s size=%d hash=%s ",
		file.Filename,
		fileSizeBytes,
		fileHash,
	)

	// REQUIREMENT 12 PRESERVED: "file_data" contains the raw file bytes,
	// identical to the original. This is the source-of-truth payload stored
	// in the file-level RawEnvelope on S3 before any row is processed.
	filePayload := map[string]interface{}{
		"file_name":           file.Filename,
		"artifact_id":         artifactID,
		"artifact_version_id": artifactVersionId,
		"file_size":           PayloadSize,
		"file_content_hash":   fileHash,
		"row_count_estimate":  rowCountEstimate,
		"file_upload_channel": "CSV",
		"file_data":           fileBuf.Bytes(), // raw file bytes — Req 12 source truth
	}

	payloadBytes, err := json.Marshal(filePayload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to build file payload",
		})
		return
	}

	fileMsg := model.RawIntentMessage{
		TenantID:             tenantID.String(),
		TraceID:              fileTraceID,
		TenantName:           tenantName,
		IdempotencyKey:       uuid.Must(uuid.NewV7()).String(),
		PayloadSize:          int(PayloadSize),
		Payload:              payloadBytes,
		ContentType:          "application/json",
		SourceType:           "BULK_FILE",
		SourceClass:          c.GetString("source_class"),
		ObjectEncryptionAlg:  "AES256",
		KMSKeyVersion:        "v1",
		SourceSystemHint:     nil,
		IngressAPIVersion:    "v1",
		RetentionPolicyClass: "STANDARD",
		EventType:            "Envelope.Created",
		//FileName:             &file.Filename,
		//FileSizeBytes:        &fileSizeBytes,
		//FileContentHash:      &fileHash,
		//RowCountEstimate:     &rowCountEstimate,
		//FileUploadChannel:    func(s string) *string { return &s }("CSV"),
		BatchID: finalBatchID,
	}

	data, err := services.ProcessRawIntent(context.Background(), fileMsg, h.S3store, artifactID, time.Now().UTC())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to store bulk file envelope",
		})
		return
	}
	data.ArtifactVersionId = artifactVersionId
	data.ArtifactId = artifactID

	// File envelope is now durably stored on S3. Release the buffer — row
	// processing from this point forward uses only the reset src reader.
	fileBuf.Reset()

	// ── Phase 2: Stream rows for per-row processing ───────────────────────────

	ext := strings.ToLower(filepath.Ext(file.Filename))

	// ── Parser resolution — profile-driven first, type-based fallback ──────────

	tenantType := strings.ToUpper(strings.TrimSpace(c.GetHeader("X-Zord-Tenant-Type")))
	sourceSystem := strings.ToUpper(strings.TrimSpace(c.GetHeader("X-Zord-Source-System"))) // e.g. "TALLY", "SAP", "ERP"

	var parser services.IntentParser
	var parserErr error

	switch {
	case sourceSystem != "":
		log.Printf("[BulkHandler] using profile-driven pass-through for source_system=%s tenant=%s",
			sourceSystem, tenantID)

	case tenantType == "TALLY" || tenantType == "SAP" || tenantType == "ERP" || tenantType == "QUICKBOOKS":
		sourceSystem = tenantType
		log.Printf("[BulkHandler] using profile-driven pass-through for source_system=%s tenant=%s",
			sourceSystem, tenantID)

	case tenantType != "":
		parser, parserErr = services.GetParserByType(tenantType)
		if parserErr != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error":  "invalid tenant type",
				"detail": parserErr.Error(),
				"hint":   "Valid static parser types: BANK, NBFC, MERCHANT, VENDOR, GATEWAY",
			})
			return
		}
		sourceSystem = "UNKNOWN"
		log.Printf("[BulkHandler] using type-based parser type=%s tenant=%s",
			tenantType, tenantID)

	default:
		sourceSystem = "UNKNOWN"
		log.Printf("[BulkHandler] using profile-driven pass-through with source auto-detection tenant=%s",
			tenantID)
	}

	profileIDForAudit := tenantType
	if sourceSystem != "UNKNOWN" {
		profileIDForAudit = sourceSystem + "_pass_through"
	} else if profileIDForAudit == "" {
		profileIDForAudit = "auto_detect_pass_through"
	}

	headersBytes, _ := json.Marshal(c.Request.Header)
	headersHashSum := sha256.Sum256(headersBytes)
	headersHash := headersHashSum[:]

	switch ext {

	// ── CSV ───────────────────────────────────────────────────────────────────
	case ".csv":
		totalDataRows := rowCountEstimate

		if totalDataRows < 1 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "file must contain header and at least one row",
			})
			return
		}
		if totalDataRows >= 10000 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "CSV limit exceeded (max 10000 rows)",
			})
			return
		}

		var resultsMu sync.Mutex
		resultsMap := make(map[int]BulkResult)
		jobs := make(chan BulkJob, 500)

		var acceptedCount, failedCount, duplicateCount int32

		workerCount := runtime.NumCPU() * 2
		var wg sync.WaitGroup

		ctx, cancel := context.WithTimeout(
			context.WithoutCancel(c.Request.Context()),
			bulkIngestJobTimeout,
		)
		defer cancel()

		for w := 0; w < workerCount; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for job := range jobs {
					traceID := uuid.Must(uuid.NewV7()).String()

					// IdempotencyKey is resolved in the producer before the job is
					// enqueued: client-provided column value takes priority; server
					// falls back to SHA256(fileHash:rowIndex:tenantID) deterministic key.
					idempotencyKey := job.IdempotencyKey

					envelopeID := uuid.Must(uuid.NewV7()).String()
					receivedAt := time.Now().UTC()

					storageAck, duplicateID, err := h.processBulkIntentRow(
						ctx,
						job.Payload,
						tenantID,
						tenantName,
						traceID,
						idempotencyKey,
						envelopeID,
						receivedAt,
						len(job.Payload),
						"application/json",
						"CSV",
						headersHash,
						sourceSystem,
						c.GetString("source_class"),
						finalBatchID,
						&file.Filename,
						&fileSizeBytes,
						&fileHash,
						&rowCountEstimate,
						func(s string) *string { return &s }("CSV"),
						&job.SourceRowRef,
						&profileIDForAudit, // Use profileIDForAudit as the audit hint
						artifactID,
						artifactVersionId,
					)

					resultsMu.Lock()
					if err != nil {
						atomic.AddInt32(&failedCount, 1)
						if errors.Is(err, services.ErrFingerprintMismatch) {
							resultsMap[job.Row] = BulkResult{
								Row:    job.Row,
								Status: "CONFLICT",
								Error:  "idempotency key reuse with different payload",
							}
						} else if errors.Is(err, services.ErrIdempotencyInFlight) {
							resultsMap[job.Row] = BulkResult{
								Row:    job.Row,
								Status: "CONFLICT",
								Error:  "idempotency key in flight — retry later",
							}
						} else {
							resultsMap[job.Row] = BulkResult{
								Row:     job.Row,
								Status:  "FAILED",
								TraceID: traceID,
								Error:   err.Error(),
							}
						}
					} else if duplicateID != uuid.Nil {
						atomic.AddInt32(&duplicateCount, 1)
						resultsMap[job.Row] = BulkResult{
							Row:        job.Row,
							Status:     "DUPLICATE",
							TraceID:    traceID,
							EnvelopeID: duplicateID.String(),
							Error:      "duplicate idempotency key",
						}
					} else {
						atomic.AddInt32(&acceptedCount, 1)
						resultsMap[job.Row] = BulkResult{
							Row:        job.Row,
							Status:     "Accepted",
							TraceID:    traceID,
							EnvelopeID: storageAck.EnvelopeId,
							ReceivedAt: storageAck.ReceivedAt.Format(time.RFC3339Nano),
						}
					}
					resultsMu.Unlock()
				}
			}()
		}

		reader := csv.NewReader(src)

		headers, err := reader.Read()
		if err != nil {
			close(jobs)
			wg.Wait()
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid CSV file"})
			return
		}

		// ── Collect all non-empty rows for batch parse ──────────────────────
		var allCSVRows []bulkSourceRow
		fileRowNumber := 1
		for {
			row, err := reader.Read()
			if err == io.EOF {
				break
			}
			fileRowNumber++
			if err != nil {
				log.Printf("CSV read error (skipping row): %v", err)
				continue
			}
			isEmpty := true
			for _, col := range row {
				if strings.TrimSpace(col) != "" {
					isEmpty = false
					break
				}
			}
			if !isEmpty {
				allCSVRows = append(allCSVRows, bulkSourceRow{FileRowNumber: fileRowNumber, Values: row})
			}
		}

		var jobsToSend []BulkJob
		if parser == nil {
			// Profile-driven path: Bypass static parser.
			// Construct raw row JSON payloads.
			for _, row := range allCSVRows {
				rowNum := row.FileRowNumber
				sourceRowRef := strconv.Itoa(rowNum)
				rawJSON, err := buildRowPayload(headers, row.Values, rowNum)
				if err != nil {
					resultsMu.Lock()
					resultsMap[rowNum] = BulkResult{Row: rowNum, Status: "FAILED", Error: "failed to build raw row payload"}
					resultsMu.Unlock()
					continue
				}

				rowIdempotencyKey := extractIdempotencyKey(rawJSON)
				if rowIdempotencyKey == "" {
					var input string
					if forceReprocess {
						input = fmt.Sprintf("%s:%d:%s:reprocess:%s", fileHash, rowNum, tenantID.String(), batchIDHeader)
					} else {
						input = fmt.Sprintf("%s:%d:%s", fileHash, rowNum, tenantID.String())
					}
					sum := sha256.Sum256([]byte(input))
					rowIdempotencyKey = hex.EncodeToString(sum[:])
				}

				jobsToSend = append(jobsToSend, BulkJob{Row: rowNum, Payload: rawJSON, IdempotencyKey: rowIdempotencyKey, SourceRowRef: sourceRowRef})
			}
		} else {
			// Type-based static parser path: Parse into UniversalIntentShape.
			parseRows, rowIndexToFileRow := flattenSourceRows(allCSVRows)
			shapes, parseErrors := parser.Parse(parseRows, headers)

			// Record parse failures directly in resultsMap
			for _, pe := range parseErrors {
				rowNum := sourceFileRowNumber(rowIndexToFileRow, pe.RowIndex)
				resultsMu.Lock()
				resultsMap[rowNum] = BulkResult{
					Row:    rowNum,
					Status: "FAILED",
					Error:  fmt.Sprintf("parse error on field %q: %s", pe.Field, pe.Message),
				}
				resultsMu.Unlock()
			}

			// Fan out clean shapes
			for _, shape := range shapes {
				parserRowNum, _ := strconv.Atoi(strings.TrimPrefix(shape.SourceRowRef, "row:"))
				rowNum := sourceFileRowNumber(rowIndexToFileRow, parserRowNum)
				sourceRowRef := strconv.Itoa(rowNum)
				shape.SourceRowRef = sourceRowRef

				jsonPayload, err := json.Marshal(shape)
				if err != nil {
					resultsMu.Lock()
					resultsMap[rowNum] = BulkResult{Row: rowNum, Status: "FAILED", Error: "failed to serialize shape"}
					resultsMu.Unlock()
					continue
				}

				rowIdempotencyKey := extractIdempotencyKey(jsonPayload)
				if rowIdempotencyKey == "" {
					var input string
					if forceReprocess {
						input = fmt.Sprintf("%s:%d:%s:reprocess:%s", fileHash, rowNum, tenantID.String(), batchIDHeader)
					} else {
						input = fmt.Sprintf("%s:%d:%s", fileHash, rowNum, tenantID.String())
					}
					sum := sha256.Sum256([]byte(input))
					rowIdempotencyKey = hex.EncodeToString(sum[:])
				}

				jobsToSend = append(jobsToSend, BulkJob{Row: rowNum, Payload: jsonPayload, IdempotencyKey: rowIdempotencyKey, SourceRowRef: sourceRowRef})
			}
		}

		for _, job := range jobsToSend {
			jobs <- job
		}

		close(jobs)
		wg.Wait()

		var actualResults []BulkResult
		maxRow := 0
		for k := range resultsMap {
			if k > maxRow {
				maxRow = k
			}
		}
		for j := 1; j <= maxRow; j++ {
			if r, ok := resultsMap[j]; ok && r.Status != "" {
				actualResults = append(actualResults, r)
			}
		}

		respondBulkResults(c, actualResults, file.Filename, fileHash)

	// ── Excel ─────────────────────────────────────────────────────────────────
	case ".xlsx":
		f, err := excelize.OpenReader(src)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid excel file"})
			return
		}

		sheet := f.GetSheetName(0)

		// Pre-scan: count rows (O(1) memory — no row data stored).
		scanRows, err := f.Rows(sheet)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read sheet"})
			return
		}
		totalRows := 0
		for scanRows.Next() {
			totalRows++
		}
		scanRows.Close()

		totalDataRows := totalRows - 1 // subtract header
		xlsxRowCount := totalDataRows

		if totalDataRows < 1 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "file must contain header and at least one row",
			})
			return
		}
		if totalRows > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "CSV limit exceeded (max 10000 rows)",
			})
			return
		}

		var resultsMu sync.Mutex
		resultsMap := make(map[int]BulkResult)
		jobs := make(chan BulkJob, 500)

		var acceptedCount, failedCount, duplicateCount int32

		workerCount := runtime.NumCPU() * 2
		var wg sync.WaitGroup

		ctx, cancel := context.WithTimeout(
			context.WithoutCancel(c.Request.Context()),
			bulkIngestJobTimeout,
		)
		defer cancel()

		for w := 0; w < workerCount; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for job := range jobs {
					traceID := uuid.Must(uuid.NewV7()).String()

					// IdempotencyKey is resolved in the producer before the job is
					// enqueued: client-provided column value takes priority; server
					// falls back to SHA256(fileHash:rowIndex:tenantID) deterministic key.
					idempotencyKey := job.IdempotencyKey

					envelopeID := uuid.Must(uuid.NewV7()).String()
					receivedAt := time.Now().UTC()

					storageAck, duplicateID, err := h.processBulkIntentRow(
						ctx,
						job.Payload,
						tenantID,
						tenantName,
						traceID,
						idempotencyKey,
						envelopeID,
						receivedAt,
						len(job.Payload),
						"application/json",
						"CSV",
						headersHash,
						sourceSystem,
						c.GetString("source_class"),
						finalBatchID,
						&file.Filename,
						&fileSizeBytes,
						&fileHash,
						&xlsxRowCount,
						func(s string) *string { return &s }("XLSX"),
						&job.SourceRowRef,
						&profileIDForAudit, // Use profileIDForAudit as the audit hint
						artifactID,
						artifactVersionId,
					)

					resultsMu.Lock()
					if err != nil {
						atomic.AddInt32(&failedCount, 1)
						if errors.Is(err, services.ErrFingerprintMismatch) {
							resultsMap[job.Row] = BulkResult{
								Row:    job.Row,
								Status: "CONFLICT",
								Error:  "idempotency key reuse with different payload",
							}
						} else if errors.Is(err, services.ErrIdempotencyInFlight) {
							resultsMap[job.Row] = BulkResult{
								Row:    job.Row,
								Status: "CONFLICT",
								Error:  "idempotency key in flight — retry later",
							}
						} else {
							resultsMap[job.Row] = BulkResult{
								Row:     job.Row,
								Status:  "FAILED",
								TraceID: traceID,
								Error:   err.Error(),
							}
						}
					} else if duplicateID != uuid.Nil {
						atomic.AddInt32(&duplicateCount, 1)
						resultsMap[job.Row] = BulkResult{
							Row:        job.Row,
							Status:     "DUPLICATE",
							TraceID:    traceID,
							EnvelopeID: duplicateID.String(),
							Error:      "duplicate idempotency key",
						}
					} else {
						atomic.AddInt32(&acceptedCount, 1)
						resultsMap[job.Row] = BulkResult{
							Row:        job.Row,
							Status:     "Accepted",
							TraceID:    traceID,
							EnvelopeID: storageAck.EnvelopeId,
							ReceivedAt: storageAck.ReceivedAt.Format(time.RFC3339Nano),
						}
					}
					resultsMu.Unlock()
				}
			}()
		}

		dataRows, err := f.Rows(sheet)
		if err != nil {
			close(jobs)
			wg.Wait()
			c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read sheet"})
			return
		}
		defer dataRows.Close()

		if !dataRows.Next() {
			close(jobs)
			wg.Wait()
			c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read sheet header"})
			return
		}
		headers, err := dataRows.Columns()
		if err != nil {
			close(jobs)
			wg.Wait()
			c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read sheet header"})
			return
		}

		// ── Collect all non-empty XLSX rows for batch parse ─────────────────
		var allXLSXRows []bulkSourceRow
		fileRowNumber := 1
		for dataRows.Next() {
			fileRowNumber++
			row, err := dataRows.Columns()
			if err != nil {
				log.Printf("XLSX read error (skipping row): %v", err)
				continue
			}
			isEmpty := true
			for _, col := range row {
				if strings.TrimSpace(col) != "" {
					isEmpty = false
					break
				}
			}
			if !isEmpty {
				allXLSXRows = append(allXLSXRows, bulkSourceRow{FileRowNumber: fileRowNumber, Values: row})
			}
		}

		var jobsToSend []BulkJob
		if parser == nil {
			// Profile-driven path: Bypass static parser.
			// Construct raw row JSON payloads.
			for _, row := range allXLSXRows {
				rowNum := row.FileRowNumber
				sourceRowRef := strconv.Itoa(rowNum)
				rawJSON, err := buildRowPayload(headers, row.Values, rowNum)
				if err != nil {
					resultsMu.Lock()
					resultsMap[rowNum] = BulkResult{Row: rowNum, Status: "FAILED", Error: "failed to build raw row payload"}
					resultsMu.Unlock()
					continue
				}

				rowIdempotencyKey := extractIdempotencyKey(rawJSON)
				if rowIdempotencyKey == "" {
					var input string
					if forceReprocess {
						input = fmt.Sprintf("%s:%d:%s:reprocess:%s", fileHash, rowNum, tenantID.String(), batchIDHeader)
					} else {
						input = fmt.Sprintf("%s:%d:%s", fileHash, rowNum, tenantID.String())
					}
					sum := sha256.Sum256([]byte(input))
					rowIdempotencyKey = hex.EncodeToString(sum[:])
				}

				jobsToSend = append(jobsToSend, BulkJob{Row: rowNum, Payload: rawJSON, IdempotencyKey: rowIdempotencyKey, SourceRowRef: sourceRowRef})
			}
		} else {
			// Type-based static parser path: Parse into UniversalIntentShape.
			parseRows, rowIndexToFileRow := flattenSourceRows(allXLSXRows)
			shapes, parseErrors := parser.Parse(parseRows, headers)

			// Record parse failures directly in resultsMap
			for _, pe := range parseErrors {
				rowNum := sourceFileRowNumber(rowIndexToFileRow, pe.RowIndex)
				resultsMu.Lock()
				resultsMap[rowNum] = BulkResult{
					Row:    rowNum,
					Status: "FAILED",
					Error:  fmt.Sprintf("parse error on field %q: %s", pe.Field, pe.Message),
				}
				resultsMu.Unlock()
			}

			// Fan out clean shapes
			for _, shape := range shapes {
				parserRowNum, _ := strconv.Atoi(strings.TrimPrefix(shape.SourceRowRef, "row:"))
				rowNum := sourceFileRowNumber(rowIndexToFileRow, parserRowNum)
				sourceRowRef := strconv.Itoa(rowNum)
				shape.SourceRowRef = sourceRowRef

				jsonPayload, err := json.Marshal(shape)
				if err != nil {
					resultsMu.Lock()
					resultsMap[rowNum] = BulkResult{Row: rowNum, Status: "FAILED", Error: "failed to serialize shape"}
					resultsMu.Unlock()
					continue
				}

				rowIdempotencyKey := extractIdempotencyKey(jsonPayload)
				if rowIdempotencyKey == "" {
					var input string
					if forceReprocess {
						input = fmt.Sprintf("%s:%d:%s:reprocess:%s", fileHash, rowNum, tenantID.String(), batchIDHeader)
					} else {
						input = fmt.Sprintf("%s:%d:%s", fileHash, rowNum, tenantID.String())
					}
					sum := sha256.Sum256([]byte(input))
					rowIdempotencyKey = hex.EncodeToString(sum[:])
				}

				jobsToSend = append(jobsToSend, BulkJob{Row: rowNum, Payload: jsonPayload, IdempotencyKey: rowIdempotencyKey, SourceRowRef: sourceRowRef})
			}
		}

		for _, job := range jobsToSend {
			jobs <- job
		}

		close(jobs)
		wg.Wait()

		var actualResults []BulkResult
		maxRow := 0
		for k := range resultsMap {
			if k > maxRow {
				maxRow = k
			}
		}
		for j := 1; j <= maxRow; j++ {
			if r, ok := resultsMap[j]; ok && r.Status != "" {
				actualResults = append(actualResults, r)
			}
		}

		respondBulkResults(c, actualResults, file.Filename, fileHash)

	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "unsupported file format (.csv or .xlsx only)",
		})
		return
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// countingWriter counts total bytes written and newline characters seen.
type countingWriter struct {
	total    int
	newlines int
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	cw.total += len(p)
	cw.newlines += strings.Count(string(p), "\n")
	return len(p), nil
}

// respondBulkResults inspects the completed results slice and writes the
// appropriate HTTP response:
//
//   - If every row is DUPLICATE → the entire batch was already ingested.
//     Return a single 409 JSON explaining the situation and telling the client
//     exactly what headers to send to reprocess.
//   - Otherwise → normal 202 response with the full per-row results array.
//
// This avoids returning a noisy array of N duplicate rows when the client
// simply re-uploaded a file they already sent.
func respondBulkResults(c *gin.Context, results []BulkResult, fileName, fileHash string) {
	// empty result set means all rows were skipped/empty, not a duplicate batch
	if len(results) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "no processable rows found in file",
		})
		return
	}
	duplicateCount := 0
	for _, r := range results {
		if r.Status == "DUPLICATE" {
			duplicateCount++
		}
	}

	if duplicateCount == len(results) {
		c.JSON(http.StatusConflict, gin.H{
			"status":     "DUPLICATE_BATCH",
			"message":    "This batch has already been processed. All rows exist in the system.",
			"file_name":  fileName,
			"total_rows": len(results),
			"hint":       "If you intended to reprocess this batch, resend the request with the headers: X-Zord-Force-Reprocess: true and a unique Batch-ID.",
		})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"total":   len(results),
		"results": results,
	})
}

// extractIdempotencyKey reads the "idempotency_key" field from an already-marshalled
// JSON row payload. Returns an empty string if the field is absent or blank,
// in which case the caller must assign a server-side deterministic key.
func extractIdempotencyKey(payload []byte) string {
	var m map[string]interface{}
	if err := json.Unmarshal(payload, &m); err != nil {
		return ""
	}
	if v, ok := m["idempotency_key"]; ok {
		if s, ok := v.(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

// buildRowPayload converts headers + row into a dot-notation-expanded JSON
// payload. Logic is identical to the original producer loop.
func buildRowPayload(headers, row []string, rowNum int) ([]byte, error) {
	payloadMap := make(map[string]interface{})
	payloadMap["source_row_ref"] = strconv.Itoa(rowNum)

	for j, header := range headers {
		value := ""
		if j < len(row) {
			value = row[j]
		} else {
			log.Printf("buildRowPayload: row has %d cols, header expects %d, filling '%s' with empty string", len(row), len(headers), header)
		}

		keys := strings.Split(header, ".")
		current := payloadMap

		for k := 0; k < len(keys); k++ {
			if k == len(keys)-1 {
				current[keys[k]] = value
			} else {
				if _, exists := current[keys[k]]; !exists {
					current[keys[k]] = make(map[string]interface{})
				}
				current = current[keys[k]].(map[string]interface{})
			}
		}
	}

	return json.Marshal(payloadMap)
}

func flattenSourceRows(rows []bulkSourceRow) ([][]string, map[int]int) {
	parseRows := make([][]string, 0, len(rows))
	rowIndexToFileRow := make(map[int]int, len(rows))
	for i, row := range rows {
		parserRowIndex := i + 1
		parseRows = append(parseRows, row.Values)
		rowIndexToFileRow[parserRowIndex] = row.FileRowNumber
	}
	return parseRows, rowIndexToFileRow
}

func sourceFileRowNumber(rowIndexToFileRow map[int]int, parserRowIndex int) int {
	if fileRow, ok := rowIndexToFileRow[parserRowIndex]; ok {
		return fileRow
	}
	return parserRowIndex
}

// processBulkIntentRow persists one canonical row envelope through the
// S3 → idempotency → ingress pipeline. profileID is stamped on every
// envelope as a permanent audit trail of which profile parsed the row.
func (h *Handler) processBulkIntentRow(
	ctx context.Context,
	rawPayload []byte,
	tenantID uuid.UUID,
	tenantName string,
	traceID string,
	idempotencyKey string,
	envelopeID string,
	receivedAt time.Time,
	payloadSize int,
	contentType string,
	sourceType string,
	headersHash []byte,
	sourceSystem string,
	sourceClass string,
	batchID *string,
	fileName *string,
	fileSizeBytes *int64,
	fileContentHash *string,
	rowCountEstimate *int,
	fileUploadChannel *string,
	sourceRowRef *string,
	profileID *string, // audit: which mapping profile parsed this row
	artifactID string, // shared file-level artifact id, stamped on every row envelope
	artifactVersionID string,
) (*model.AckMessage, uuid.UUID, error) {

	encryptedPayload, err := vault.Encrypt(rawPayload)
	if err != nil {
		log.Printf("Error encrypting payload for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}

	fingerprintInput := append(rawPayload, []byte(idempotencyKey+tenantID.String())...)
	fingerprintSum := sha256.Sum256(fingerprintInput)
	fingerprint := hex.EncodeToString(fingerprintSum[:])

	rawIntent := model.RawIntentMessage{
		TenantID:           tenantID.String(),
		TenantName:         tenantName,
		TraceID:            traceID,
		IdempotencyKey:     idempotencyKey,
		PayloadSize:        payloadSize,
		Payload:            encryptedPayload,
		ContentType:        contentType,
		SourceType:         sourceType,
		SourceClass:        sourceClass,
		SourceSystem:       sourceSystem,
		RequestHeadersHash: headersHash,
		RequestFingerprint: fingerprint,
		SchemaHint:         nil,
		MappingProfileHint: profileID, // permanent audit trail

		// Hardcoded values
		ObjectEncryptionAlg:  "AES256",
		KMSKeyVersion:        "v1",
		IngressAPIVersion:    "v1",
		RetentionPolicyClass: "STANDARD",
		EventType:            "Envelope.Created",
		BatchID:              batchID,
		FileName:             fileName,
		FileSizeBytes:        fileSizeBytes,
		FileContentHash:      fileContentHash,
		RowCountEstimate:     rowCountEstimate,
		FileUploadChannel:    fileUploadChannel,
		SourceRowRef:         sourceRowRef,
	}

	id, err := services.PersistIdempotency(ctx, rawIntent, db.DB)
	if err != nil {
		return nil, uuid.Nil, err
	}
	if id != uuid.Nil {
		return nil, id, nil
	}

	claimActive := rawIntent.IdempotencyKey != ""
	ingestOK := false
	defer func() {
		if claimActive && !ingestOK {
			services.ReleaseIdempotencyClaim(ctx, db.DB, rawIntent.TenantID, rawIntent.IdempotencyKey, fingerprint)
		}
	}()

	storageAck, err := services.ProcessRawIntent(ctx, rawIntent, h.S3store, envelopeID, receivedAt)
	if err != nil {
		log.Printf("Error processing raw intent for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}
	if storageAck == nil {
		log.Printf("S3 data is nil for bulk row, trace_id=%s", traceID)
		return nil, uuid.Nil, fmt.Errorf("S3 store returned nil ack for trace_id=%s", traceID)
	}
	storageAck.ArtifactId = artifactID
	storageAck.ArtifactVersionId = artifactVersionID

	payloadHashSum := sha256.Sum256(rawPayload)
	rawIntent.PayloadHash = payloadHashSum[:]

	rawRowHash, err := services.ComputeRawRowHash(rawPayload)
	if err != nil {
		log.Printf("Error computing raw_row_hash for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}
	rawIntent.RawRowHash = rawRowHash

	if err := services.RawIntent(ctx, rawIntent, storageAck); err != nil {
		log.Printf("Error persisting raw intent for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}

	ingestOK = true
	return storageAck, uuid.Nil, nil
}
