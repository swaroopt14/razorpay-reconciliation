package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"time"

	"zord-edge/config"
	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) bankIngestStore() services.BankIngestStore {
	if h.BankIngest != nil {
		return h.BankIngest
	}
	return services.NewSQLBankIngestStore(db.DB)
}

func (h *Handler) PostBankStatement(c *gin.Context) {
	tenantID := c.MustGet("tenant_id").(uuid.UUID)
	fileHdr, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FILE_REQUIRED", "message": "file is required"})
		return
	}
	accountID := strings.TrimSpace(c.PostForm("account_id"))
	if accountID == "" {
		accountID = strings.TrimSpace(c.Query("account_id"))
	}
	if accountID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": "ACCOUNT_REQUIRED", "message": "account_id is required"})
		return
	}
	src, err := fileHdr.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FILE_OPEN_ERROR", "message": "unable to open file"})
		return
	}
	defer src.Close()
	limited := io.LimitReader(src, config.MaxBulkUploadBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FILE_READ_ERROR", "message": "unable to read file"})
		return
	}
	if int64(len(raw)) > config.MaxBulkUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"code": "FILE_TOO_LARGE", "limit": config.MaxBulkUploadBytes})
		return
	}
	sum := sha256.Sum256(raw)
	hash := "sha256:" + hex.EncodeToString(sum[:])

	storageURI := "memory://" + hash
	if h.S3store != nil {
		tenantName, _ := c.Get("tenant_name")
		name, _ := tenantName.(string)
		ref, err := h.S3store.StoreRawPayload(c.Request.Context(), uuid.Must(uuid.NewV7()).String(), time.Now().UTC(), raw, tenantID.String(), name, fileHdr.Header.Get("Content-Type"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "STORAGE_ERROR", "message": "unable to store file"})
			return
		}
		storageURI = ref
	}

	var connector *uuid.UUID
	if cid := strings.TrimSpace(c.PostForm("connector_id")); cid != "" {
		parsed, err := uuid.Parse(cid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_CONNECTOR", "message": "connector_id must be a UUID"})
			return
		}
		connector = &parsed
	}

	store := h.bankIngestStore()
	existing, err := store.FindLatestByHash(c.Request.Context(), tenantID, hash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "INGEST_LOOKUP_FAILED", "message": "unable to check duplicate"})
		return
	}

	run := services.BankIngestRun{
		IngestID:    uuid.Must(uuid.NewV7()),
		TenantID:    tenantID,
		ConnectorID: connector,
		AccountID:   accountID,
		Filename:    fileHdr.Filename,
		FileSHA256:  hash,
		StorageURI:  storageURI,
		Status:      services.BankIngestReceived,
		Profile:     strings.TrimSpace(c.PostForm("profile")),
		Currency:    strings.TrimSpace(c.PostForm("currency")),
		CreatedAt:   time.Now().UTC(),
	}

	duplicate := existing != nil && existing.FileSHA256 == hash
	if duplicate {
		run.Status = services.BankIngestDuplicate
	}
	if err := store.Insert(c.Request.Context(), run, !duplicate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "INGEST_PERSIST_FAILED", "message": "unable to record ingest"})
		return
	}

	status := services.BankIngestAccepted
	if duplicate {
		status = services.BankIngestDuplicate
	}
	c.JSON(http.StatusAccepted, gin.H{
		"ingest_id": run.IngestID.String(),
		"status":    status,
		"hash":      hash,
	})
}

func (h *Handler) GetBankStatement(c *gin.Context) {
	tenantID := c.MustGet("tenant_id").(uuid.UUID)
	ingestID, err := uuid.Parse(c.Param("ingest_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_INGEST_ID", "message": "ingest_id must be a UUID"})
		return
	}
	run, err := h.bankIngestStore().Get(c.Request.Context(), tenantID, ingestID)
	if err != nil || run == nil {
		c.JSON(http.StatusNotFound, gin.H{"code": "NOT_FOUND", "message": "ingest run not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ingest_id":  run.IngestID.String(),
		"status":     run.Status,
		"hash":       run.FileSHA256,
		"filename":   run.Filename,
		"account_id": run.AccountID,
	})
}
