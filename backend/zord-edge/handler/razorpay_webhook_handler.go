package handler

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"zord-edge/db"
	"zord-edge/logger"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxWebhookBodyBytes = 1 << 20 // 1 MB

// HandleRazorpayWebhook processes incoming Razorpay webhook events.
//
// Flow:
//  1. Resolve connector from route param
//  2. Read raw body exactly once (before any JSON parsing)
//  3. Extract X-Razorpay-Signature and x-razorpay-event-id headers
//  4. Verify HMAC-SHA256 signature using webhook secret
//  5. Persist receipt + outbox atomically
//  6. Return HTTP 2xx
//
// POST /v1/webhooks/razorpay/:connectorID
func (h *Handler) HandleRazorpayWebhook(c *gin.Context) {
	connectorIDStr := c.Param("connectorID")
	if connectorIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing connector ID"})
		return
	}

	connectorID, err := uuid.Parse(connectorIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid connector ID"})
		return
	}

	// Step 1: Read raw body EXACTLY ONCE — signature must match these bytes
	rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBodyBytes+1))
	if err != nil {
		logger.Log.Error("razorpay webhook: failed to read body",
			slog.String("connector_id", connectorIDStr),
			slog.String("error", err.Error()),
		)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "body too large"})
		return
	}
	if int64(len(rawBody)) > maxWebhookBodyBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "body exceeds 1MB limit"})
		return
	}

	// Step 2: Extract Razorpay-specific headers
	eventID := c.GetHeader("x-razorpay-event-id")
	if eventID == "" {
		eventID = c.GetHeader("X-Razorpay-Event-Id")
	}
	if eventID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing x-razorpay-event-id header"})
		return
	}

	signature := c.GetHeader("X-Razorpay-Signature")
	if signature == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing X-Razorpay-Signature header"})
		return
	}

	// Resolve tenant from the connector record (webhook routes are not JWT-authenticated).
	var tenantID uuid.UUID
	err = db.DB.QueryRow(
		`SELECT tenant_id FROM connectors WHERE id = $1 AND active = true`,
		connectorID,
	).Scan(&tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector not found"})
		return
	}

	// Step 4: Resolve webhook secret
	webhookSecret := resolveWebhookSecret(connectorID)

	// Step 5: Generate trace ID
	traceID := uuid.Must(uuid.NewV7()).String()

	// Step 6: Compute raw body hash for logging
	hash := sha256.Sum256(rawBody)
	bodyHash := hex.EncodeToString(hash[:])

	logger.Log.Info("razorpay webhook: received",
		slog.String("event_id", eventID),
		slog.String("connector_id", connectorIDStr),
		slog.String("tenant_id", tenantID.String()),
		slog.Int("body_size", len(rawBody)),
		slog.String("body_hash", bodyHash[:16]+"..."),
		slog.String("trace_id", traceID),
	)

	// Step 7: Resolve provider mode
	providerMode := resolveProviderMode(connectorID)

	// Step 8: Call the webhook service
	svc := services.NewRazorpayWebhookService()
	result, httpStatus, err := svc.Receive(c.Request.Context(), services.WebhookRequest{
		TenantID:      tenantID,
		ConnectorID:   connectorID,
		Provider:      "razorpay",
		ProviderMode:  providerMode,
		RawBody:       rawBody,
		EventID:       eventID,
		Signature:     signature,
		WebhookSecret: webhookSecret,
		TraceID:       traceID,
	})

	if err != nil {
		logger.Log.Warn("razorpay webhook: rejected",
			slog.String("event_id", eventID),
			slog.Int("http_status", httpStatus),
			slog.String("error", err.Error()),
		)
		c.JSON(httpStatus, gin.H{
			"error":   "webhook_error",
			"message": "event not accepted",
		})
		return
	}

	// Step 9: Return 2xx
	response := gin.H{
		"status":    result.Status,
		"receipt_id": result.ReceiptID.String(),
		"trace_id":  traceID,
	}
	if result.Duplicate {
		response["delivery_count"] = result.DeliveryCount
	}

	c.JSON(http.StatusOK, response)
}

// HandleRazorpayWebhookStatus returns receipt status.
// GET /v1/webhooks/razorpay/receipt/:receiptID
func (h *Handler) HandleRazorpayWebhookStatus(c *gin.Context) {
	receiptIDStr := c.Param("receiptID")
	receiptID, err := uuid.Parse(receiptIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid receipt ID"})
		return
	}

	svc := services.NewRazorpayWebhookService()
	receipt, err := svc.GetReceipt(c.Request.Context(), receiptID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": "receipt not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"receipt_id":           receipt.ID.String(),
		"provider":             receipt.Provider,
		"provider_mode":        receipt.ProviderMode,
		"event_id":             receipt.EventID,
		"event_type":           receipt.EventType,
		"provider_entity_type": receipt.ProviderEntityType,
		"provider_entity_id":   receipt.ProviderEntityID,
		"raw_body_hash":        receipt.RawBodyHash,
		"signature_valid":      receipt.SignatureValid,
		"ingestion_status":     receipt.IngestionStatus,
		"delivery_count":       receipt.DeliveryCount,
		"received_at":          receipt.ReceivedAt,
	})
}

// HandleRazorpayWebhookList returns recent receipts for a connector.
// GET /v1/webhooks/razorpay/receipts/:connectorID
func (h *Handler) HandleRazorpayWebhookList(c *gin.Context) {
	connectorIDStr := c.Param("connectorID")
	connectorID, err := uuid.Parse(connectorIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid connector ID"})
		return
	}

	svc := services.NewRazorpayWebhookService()
	receipts, err := svc.ListReceiptsByConnector(connectorID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"connector_id": connectorIDStr,
		"count":        len(receipts),
		"receipts":     receipts,
	})
}

// resolveWebhookSecret gets the webhook secret for a connector.
func resolveWebhookSecret(connectorID uuid.UUID) string {
	// Try env var first (local dev)
	if secret := os.Getenv("RAZORPAY_WEBHOOK_SECRET"); secret != "" {
		return secret
	}

	// Try connector's stored secret
	var secret string
	err := db.DB.QueryRow(
		`SELECT secret FROM connectors WHERE id = $1 AND active = true`,
		connectorID,
	).Scan(&secret)
	if err != nil {
		logger.Log.Warn("razorpay webhook: could not resolve secret",
			slog.String("connector_id", connectorID.String()),
			slog.String("error", err.Error()),
		)
		return ""
	}
	return secret
}

// resolveProviderMode gets the provider mode from the connector record.
func resolveProviderMode(connectorID uuid.UUID) string {
	var mode string
	err := db.DB.QueryRow(
		`SELECT provider_mode FROM connectors WHERE id = $1 AND active = true`,
		connectorID,
	).Scan(&mode)
	if err != nil {
		return "test" // default
	}
	return mode
}

// HandleWebhookReceiptIndex is GET /internal/webhooks/receipts/index
func (h *Handler) HandleWebhookReceiptIndex(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	tenantID, err := uuid.Parse(strings.TrimSpace(c.Query("tenant_id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}
	connectorID, err := uuid.Parse(strings.TrimSpace(c.Query("connector_id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid connector_id"})
		return
	}
	from, err := time.Parse(time.RFC3339, strings.TrimSpace(c.Query("from")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from"})
		return
	}
	to, err := time.Parse(time.RFC3339, strings.TrimSpace(c.Query("to")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to"})
		return
	}
	if !to.After(from) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to must be after from"})
		return
	}
	svc := services.NewRazorpayWebhookService()
	rows, err := svc.IndexReceipts(c.Request.Context(), tenantID, connectorID, from.UTC(), to.UTC())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []services.ReceiptIndexRow{}
	}
	c.JSON(http.StatusOK, gin.H{
		"tenant_id":    tenantID.String(),
		"connector_id": connectorID.String(),
		"count":        len(rows),
		"receipts":     rows,
	})
}

// Ensure sql is used (imported for the db reference)
var _ = sql.ErrNoRows
