package handler

import (
	stdctx "context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"zord-edge/db"
	"zord-edge/logger"
	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) WebhookHandler(c *gin.Context) {

	// ── STRICT: Only from verified middleware context ──

	provider := c.GetString("psp_provider")
	if provider == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "psp_provider missing from context"})
		return
	}

	connectorID := c.GetString("connector_id")
	if connectorID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "connector_id missing from context"})
		return
	}

	tenantIDStr := c.GetString("tenant_id")
	if tenantIDStr == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tenant_id missing from verified context"})
		return
	}

	tenantUUID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		logger.Log.Error("webhook invalid tenant_id in context",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("tenant_id_raw", tenantIDStr),
			slog.String("error", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid tenant_id in context"})
		return
	}

	idempotencyKey := c.GetString("psp_event_id")
	if idempotencyKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "psp_event_id missing from context"})
		return
	}

	rawPayloadAny, ok := c.Get("raw_payload")
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "raw_payload missing from context"})
		return
	}
	rawPayload := rawPayloadAny.([]byte)

	// ── Observability ──
	traceID := uuid.Must(uuid.NewV7()).String()
	envelopeID := uuid.Must(uuid.NewV7()).String()
	receivedAt := time.Now().UTC()

	// ── Metadata ──
	contentType := c.GetHeader("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	sourceType := "WEBHOOK:" + provider + ":" + connectorID

	if eventType := c.GetString("psp_event_type"); eventType != "" {
		sourceType += ":" + eventType
	}

	sourceSystem := c.GetHeader("X-Zord-Source-System")
	if sourceSystem == "" {
		sourceSystem = "UNKNOWN"
	}

	// ── Context with timeout ──
	reqCtx, cancel := stdctx.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	c.Request = c.Request.WithContext(reqCtx)

	// ── Headers hash ──
	headersBytes, _ := json.Marshal(c.Request.Header)
	headersHashSum := sha256.Sum256(headersBytes)
	headersHash := headersHashSum[:]

	// ── Encrypt payload ──
	encryptedPayload, err := vault.Encrypt(rawPayload)
	if err != nil {
		logger.Log.Error("webhook payload encryption failed",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("trace_id", traceID),
			slog.String("error", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt payload"})
		return
	}

	// ── Fingerprint (strong idempotency) ──
	fingerprintInput := append(rawPayload, []byte(idempotencyKey+tenantUUID.String())...)
	fingerprintSum := sha256.Sum256(fingerprintInput)
	fingerprint := hex.EncodeToString(fingerprintSum[:])

	// ── Build message ──
	msg := model.RawIntentMessage{
		TenantID:           tenantUUID.String(),
		TraceID:            traceID,
		IdempotencyKey:     idempotencyKey,
		PayloadSize:        len(rawPayload),
		Payload:            encryptedPayload,
		ContentType:        contentType,
		SourceType:         sourceType,
		SourceSystem:       sourceSystem,
		RequestHeadersHash: headersHash,
		RequestFingerprint: fingerprint,
		SchemaHint:         nil,
	}

	// ── Idempotency ──
	dupID, err := services.PersistIdempotency(reqCtx, msg, db.DB)
	if err != nil {
		if errors.Is(err, services.ErrFingerprintMismatch) {
			c.JSON(http.StatusBadRequest, gin.H{
				"IdempotencyKey": idempotencyKey,
				"ErrorCode":      "IDEMPOTENCY_CONFLICT",
				"ErrorMsg":       "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD",
				"HttpStatus":     http.StatusBadRequest,
			})
			return
		}
		if errors.Is(err, services.ErrIdempotencyInFlight) {
			c.JSON(http.StatusConflict, gin.H{
				"ErrorCode":  "IDEMPOTENCY_IN_FLIGHT",
				"ErrorMsg":   "request with this idempotency key is already being processed",
				"HttpStatus": http.StatusConflict,
			})
			return
		}

		logger.Log.Error("webhook idempotency persist failed",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("trace_id", traceID),
			slog.String("error", err.Error()))

		c.JSON(http.StatusInternalServerError, gin.H{
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist idempotency key.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}

	// ── Duplicate ──
	if dupID != uuid.Nil {
		logger.Log.Info("webhook duplicate event detected",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("event_id", idempotencyKey),
			slog.String("trace_id", traceID),
			slog.String("envelope_id", dupID.String()))

		c.JSON(http.StatusOK, gin.H{
			"status":     "received",
			"trace_id":   traceID,
			"EnvelopeID": dupID.String(),
		})
		return
	}

	claimActive := msg.IdempotencyKey != ""
	ingestOK := false
	defer func() {
		if claimActive && !ingestOK {
			services.ReleaseIdempotencyClaim(reqCtx, db.DB, msg.TenantID, msg.IdempotencyKey, fingerprint)
		}
	}()

	// ── S3 ──
	data, err := services.ProcessRawIntent(reqCtx, msg, h.S3store, envelopeID, receivedAt)
	if err != nil {
		logger.Log.Error("webhook raw intent processing failed",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("trace_id", traceID),
			slog.String("error", err.Error()))

		c.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   traceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  err.Error(),
		})
		return
	}

	if data == nil {
		logger.Log.Error("webhook S3 storage returned nil ack",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("trace_id", traceID))

		c.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   traceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  "S3 data is nil",
		})
		return
	}

	// ── Payload hash ──
	hash := sha256.Sum256(rawPayload)
	msg.PayloadHash = hash[:]

	// ── Persist ──
	if err := services.RawIntent(reqCtx, msg, data); err != nil {
		logger.Log.Error("webhook raw intent persist failed",
			slog.String("provider", provider),
			slog.String("connector_id", connectorID),
			slog.String("trace_id", traceID),
			slog.String("envelope_id", envelopeID),
			slog.String("error", err.Error()))

		c.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":    traceID,
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist raw intent.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}

	ingestOK = true
	c.JSON(http.StatusOK, gin.H{
		"status":   "received",
		"trace_id": traceID,
	})
}
