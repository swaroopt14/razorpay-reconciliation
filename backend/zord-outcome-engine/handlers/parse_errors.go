package handlers

import (
	"net/http"
	"strconv"
	"zord-outcome-engine/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func SettlementParseErrors(c *gin.Context) {
	batchid := c.Query("batch_id")
	if batchid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_id query parameter is required"})
		return
	}

	rawtenantid := c.Query("tenant_id")
	tenantid, err := uuid.Parse(rawtenantid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page <= 0 {
		page = 1
	}

	pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if err != nil || pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize

	type ParseErrorRow struct {
		SourceRowRef *string `json:"source_row_ref"`
		ErrorStage   string  `json:"error_stage"`
		ReasonCode   string  `json:"reason_code"`
		Severity     string  `json:"severity"`
	}

	type Pagination struct {
		Page     int `json:"page"`
		PageSize int `json:"page_size"`
		Total    int `json:"total"`
	}

	type SettlementParseErrorsResponse struct {
		Items      []ParseErrorRow `json:"items"`
		Pagination Pagination      `json:"pagination"`
	}

	countQuery := `
		SELECT COUNT(*)
		FROM settlement_parse_errors
		WHERE client_batch_id = $1 AND tenant_id = $2
	`

	var total int
	if err := db.DB.QueryRowContext(c.Request.Context(), countQuery, batchid, tenantid).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	query := `
		SELECT source_row_ref, error_stage, reason_code, severity
		FROM settlement_parse_errors
		WHERE client_batch_id = $1 AND tenant_id = $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := db.DB.QueryContext(c.Request.Context(), query, batchid, tenantid, pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	errors := []ParseErrorRow{}
	for rows.Next() {
		var row ParseErrorRow
		if err := rows.Scan(
			&row.SourceRowRef,
			&row.ErrorStage,
			&row.ReasonCode,
			&row.Severity,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		errors = append(errors, row)
	}

	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, SettlementParseErrorsResponse{
		Items: errors,
		Pagination: Pagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	})
}
