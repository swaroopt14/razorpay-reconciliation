package handlers

import (
	"context"
	"io"
	"net/http"
	"strings"

	"zord-outcome-engine/internal/imports"

	"github.com/gin-gonic/gin"
)

type ImportHandler struct {
	Service         *imports.Service
	AfterBankCommit func(ctx context.Context, tenantID, connectorID, accountID string) error
}

func (h *ImportHandler) Upload(c *gin.Context) {
	in, err := readUpload(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	imp, err := h.Service.Upload(c.Request.Context(), in)
	if err != nil {
		writeImportErr(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": imp.ToSummary(nil)})
}

func (h *ImportHandler) Get(c *gin.Context) {
	imp, err := h.Service.Get(c.Request.Context(), c.Query("tenant_id"), c.Param("import_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": imp.ToSummary(nil)})
}

func (h *ImportHandler) Validate(c *gin.Context) {
	var req imports.ValidateRequest
	_ = c.ShouldBindJSON(&req)
	imp, rows, err := h.Service.Validate(c.Request.Context(), c.Query("tenant_id"), c.Param("import_id"), req)
	if err != nil {
		writeImportErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": imp.ToSummary(rows)})
}

func (h *ImportHandler) Rows(c *gin.Context) {
	rows, err := h.Service.ListRows(c.Request.Context(), c.Query("tenant_id"), c.Param("import_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *ImportHandler) Commit(c *gin.Context) {
	imp, err := h.Service.Commit(c.Request.Context(), c.Query("tenant_id"), c.Param("import_id"))
	if err != nil {
		writeImportErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": imp.ToSummary(nil)})
}

func (h *ImportHandler) Cancel(c *gin.Context) {
	imp, err := h.Service.Cancel(c.Request.Context(), c.Query("tenant_id"), c.Param("import_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": imp.ToSummary(nil)})
}

func (h *ImportHandler) OneShotBankUpload(c *gin.Context) {
	in, err := readUpload(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	in.ImportType = imports.TypeBankCSV
	imp, err := h.Service.UploadValidateCommit(c.Request.Context(), in, imports.ValidateRequest{
		Currency:   c.Query("currency"),
		AmountUnit: c.DefaultQuery("amount_unit", "rupees"),
		Timezone:   c.DefaultQuery("timezone", "Asia/Kolkata"),
		Profile:    c.Query("profile"),
	})
	if err != nil {
		writeImportErr(c, err)
		return
	}
	if h.AfterBankCommit != nil && imp.Status != imports.StatusDuplicate && imp.Status != imports.StatusValidationFailed {
		_ = h.AfterBankCommit(c.Request.Context(), in.TenantID, in.ConnectorID, in.AccountID)
	}
	c.JSON(http.StatusAccepted, gin.H{
		"upload_id": imp.ID, "row_count": imp.ValidRows, "file_hash": imp.FileSHA256,
		"status": imp.Status, "message": imports.CopyBankImported,
	})
}

func readUpload(c *gin.Context) (imports.UploadInput, error) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		return imports.UploadInput{}, err
	}
	defer file.Close()
	raw, err := io.ReadAll(file)
	if err != nil {
		return imports.UploadInput{}, err
	}
	importType := c.DefaultQuery("import_type", imports.TypeBankCSV)
	if strings.HasSuffix(strings.ToLower(header.Filename), ".json") && importType == imports.TypeBankCSV {
		importType = imports.TypeSettlementJSON
	}
	return imports.UploadInput{
		TenantID:     strings.TrimSpace(c.Query("tenant_id")),
		ConnectorID:  strings.TrimSpace(c.Query("connector_id")),
		AccountID:    strings.TrimSpace(c.Query("account_id")),
		ImportType:   importType,
		FileName:     header.Filename,
		ContentType:  header.Header.Get("Content-Type"),
		ProviderMode: c.DefaultQuery("provider_mode", "test"),
		Payload:      raw,
	}, nil
}

func writeImportErr(c *gin.Context, err error) {
	if fe, ok := err.(*imports.FatalError); ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fe.Message, "code": fe.Code})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}
