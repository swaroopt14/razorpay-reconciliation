package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"zord-outcome-engine/db"
)

// SettlementJobStatusResponse is the response body for GET /v1/settlement/jobs/:job_id.
// It returns everything the caller needs to understand the current state of an ingest run.
type SettlementJobStatusResponse struct {
	IngestRunID            string     `json:"ingest_run_id"`
	SettlementBatchID      string     `json:"settlement_batch_id"`
	ClientBatchID          string     `json:"client_batch_id"`
	TenantID               uuid.UUID  `json:"tenant_id"`
	SourceSystem           string     `json:"source_system"`
	MappingProfileID       string     `json:"mapping_profile_id"`
	RunNumber              int        `json:"run_number"`
	ForceReprocess         bool       `json:"force_reprocess"`
	ActiveRunID            *string    `json:"current_active_run_id,omitempty"`
	RunStatus              string     `json:"run_status"`
	RowCountParsed         int        `json:"row_count_parsed"`
	RowCountFailed         int        `json:"row_count_failed"`
	RowCountCanonicalized  int        `json:"row_count_canonicalized"`
	ParseConfidenceOverall float64    `json:"parse_confidence_overall"`
	FailureReasonCode      *string    `json:"failure_reason_code,omitempty"`
	StartedAt              *time.Time `json:"started_at,omitempty"`
	CompletedAt            *time.Time `json:"completed_at,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
}

// GetSettlementJobHandler returns the current status and row counts for a settlement ingest job.
// This allows callers to re-query job progress after upload and verify canonicalization results.
//
// GET /v1/settlement/jobs/:job_id?tenant_id=<uuid>
func (h *Handler) GetSettlementJobHandler(c *gin.Context) {
	// Parse and validate tenant_id from query param.
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	jobID := strings.TrimSpace(c.Param("job_id"))
	if jobID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_id is required"})
		return
	}

	log.Printf("settlement.job.get tenant_id=%s job_id=%s", tenantID, jobID)

	// Query the settlement_ingest_runs table and join settlement_batches so the
	// caller gets both run-level and batch-level status in one round trip.
	var resp SettlementJobStatusResponse
	err = db.DB.QueryRowContext(c.Request.Context(), `
        SELECT
            r.ingest_run_id,
            r.tenant_id,
            r.source_system,
            r.mapping_profile_id,
            r.run_status,
            r.run_number,
            r.force_reprocess,
            r.row_count_parsed,
            r.row_count_failed,
            r.row_count_canonicalized,
            r.parse_confidence_overall,
            r.failure_reason_code,
            r.started_at,
            r.completed_at,
            r.created_at,
            b.settlement_batch_id,
            b.client_batch_id,
            b.current_active_run_id
        FROM settlement_ingest_runs r
        JOIN settlement_batches b ON b.settlement_batch_id = r.settlement_batch_id
        WHERE r.ingest_run_id = $1 AND r.tenant_id = $2
        LIMIT 1`,
		jobID, tenantID,
	).Scan(
		&resp.IngestRunID, &resp.TenantID, &resp.SourceSystem, &resp.MappingProfileID,
		&resp.RunStatus, &resp.RunNumber, &resp.ForceReprocess,
		&resp.RowCountParsed, &resp.RowCountFailed, &resp.RowCountCanonicalized,
		&resp.ParseConfidenceOverall,
		&resp.FailureReasonCode,
		&resp.StartedAt, &resp.CompletedAt, &resp.CreatedAt,
		&resp.SettlementBatchID, &resp.ClientBatchID, &resp.ActiveRunID,
	)

	if err == sql.ErrNoRows {
		// Return 404 if job does not exist or belongs to a different tenant.
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	if err != nil {
		log.Printf("settlement.job.get.error tenant_id=%s job_id=%s err=%v", tenantID, jobID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch job"})
		return
	}

	c.JSON(http.StatusOK, resp)
}
