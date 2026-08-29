package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"zord-edge/db"
	"zord-edge/logger"
	"zord-edge/model"
	"zord-edge/validator"

	"github.com/google/uuid"
)

// RazorpayWebhookService handles Razorpay webhook processing.
type RazorpayWebhookService struct{}

// NewRazorpayWebhookService creates a new service instance.
func NewRazorpayWebhookService() *RazorpayWebhookService {
	return &RazorpayWebhookService{}
}

// WebhookRequest holds the parsed input from the HTTP handler.
type WebhookRequest struct {
	TenantID      uuid.UUID
	ConnectorID   uuid.UUID
	Provider      string
	ProviderMode  string
	RawBody       []byte
	EventID       string
	Signature     string
	WebhookSecret string
	TraceID       string
}

// Receive processes a Razorpay webhook event end-to-end.
// Returns a ReceiptResult and an HTTP status code.
func (s *RazorpayWebhookService) Receive(ctx context.Context, req WebhookRequest) (model.ReceiptResult, int, error) {
	// Step 1: Parse Razorpay event metadata
	metadata, err := s.ParseMetadata(req.RawBody)
	if err != nil {
		logger.Log.Warn("razorpay webhook: failed to parse event metadata",
			slog.String("event_id", req.EventID),
			slog.String("error", err.Error()),
		)
		return model.ReceiptResult{}, 400, fmt.Errorf("invalid event payload")
	}

	// Step 2: Verify HMAC-SHA256 signature
	if err := validator.VerifyRazorpaySignature(req.RawBody, req.Signature, req.WebhookSecret); err != nil {
		logger.Log.Warn("razorpay webhook: invalid signature",
			slog.String("event_id", req.EventID),
			slog.String("provider", req.Provider),
		)
		return model.ReceiptResult{}, 401, fmt.Errorf("invalid signature")
	}

	// Step 3: Compute SHA-256 hash of raw body
	hash := sha256.Sum256(req.RawBody)
	bodyHash := "sha256:" + hex.EncodeToString(hash[:])

	// Step 4: Persist receipt and outbox atomically
	result, err := s.persistAndEnqueue(ctx, req, metadata, bodyHash)
	if err != nil {
		logger.Log.Error("razorpay webhook: persist failed",
			slog.String("event_id", req.EventID),
			slog.String("trace_id", req.TraceID),
			slog.String("error", err.Error()),
		)
		return model.ReceiptResult{}, 500, err
	}

	// Step 5: Return appropriate status
	if result.Duplicate {
		logger.Log.Info("razorpay webhook: duplicate accepted",
			slog.String("event_id", req.EventID),
			slog.Int("delivery_count", result.DeliveryCount),
		)
		return result, 200, nil
	}

	logger.Log.Info("razorpay webhook: accepted",
		slog.String("event_id", req.EventID),
		slog.String("event_type", metadata.EventType),
		slog.String("entity_id", metadata.EntityID),
		slog.String("receipt_id", result.ReceiptID.String()),
		slog.String("trace_id", req.TraceID),
	)

	return result, 200, nil
}

// ParseMetadata extracts event type, entity type, entity ID, and created_at from the raw body.
func (s *RazorpayWebhookService) ParseMetadata(rawBody []byte) (model.WebhookMetadata, error) {
	var event model.RazorpayWebhookEvent
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return model.WebhookMetadata{}, fmt.Errorf("failed to parse Razorpay event: %w", err)
	}

	meta := model.WebhookMetadata{
		EventType: event.Event,
	}

	if event.CreatedAt > 0 {
		t := time.Unix(event.CreatedAt, 0).UTC()
		meta.ProviderCreatedAt = &t
	}

	// Extract entity type and ID from the event structure
	// Razorpay puts entity info in payload.payment.entity.id etc.
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(event.Payload, &payload); err == nil {
		for entityType, entityRaw := range payload {
			var entity struct {
				ID     string `json:"id"`
				Entity string `json:"entity"`
			}
			if err := json.Unmarshal(entityRaw, &entity); err == nil {
				meta.EntityType = entityType
				if entity.ID != "" {
					meta.EntityID = entity.ID
				}
				break
			}
		}
	}

	return meta, nil
}

// persistAndEnqueue atomically inserts the webhook receipt and outbox event.
func (s *RazorpayWebhookService) persistAndEnqueue(
	ctx context.Context,
	req WebhookRequest,
	metadata model.WebhookMetadata,
	bodyHash string,
) (model.ReceiptResult, error) {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return model.ReceiptResult{}, fmt.Errorf("transaction begin failed: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	receiptID := uuid.Must(uuid.NewV7())
	now := time.Now().UTC()

	// Try to insert receipt — the UNIQUE(connector_id, event_id) constraint handles idempotency
	var existingDeliveryCount int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO provider_webhook_receipts (
			id, tenant_id, connector_id, provider, provider_mode,
			event_id, event_type, provider_entity_type, provider_entity_id,
			raw_body_hash, raw_body_size_bytes,
			signature_header, signature_valid,
			received_at, provider_created_at,
			ingestion_status, first_seen_trace_id, delivery_count,
			created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
		ON CONFLICT (connector_id, event_id) DO UPDATE SET
			last_seen_at = now(),
			delivery_count = provider_webhook_receipts.delivery_count + 1,
			updated_at = now()
		RETURNING delivery_count
	`,
		receiptID, req.TenantID, req.ConnectorID, req.Provider, req.ProviderMode,
		req.EventID, metadata.EventType, metadata.EntityType, metadata.EntityID,
		bodyHash, int64(len(req.RawBody)),
		req.Signature, true,
		now, metadata.ProviderCreatedAt,
		model.WebhookStatusPersisted, req.TraceID, 1,
		now, now,
	).Scan(&existingDeliveryCount)

	if err != nil {
		return model.ReceiptResult{}, fmt.Errorf("receipt persist failed: %w", err)
	}

	isDuplicate := existingDeliveryCount > 1

	// For duplicates, no second outbox event
	if !isDuplicate {
		// Insert transactional outbox event in the same transaction
		eventPayload := map[string]any{
			"event_name":            "provider.observation.received",
			"schema_version":        "v1",
			"tenant_id":             req.TenantID.String(),
			"connector_id":          req.ConnectorID.String(),
			"provider":              req.Provider,
			"provider_mode":         req.ProviderMode,
			"source_kind":           "webhook",
			"provider_event_id":     req.EventID,
			"provider_event_type":   metadata.EventType,
			"provider_entity_type":  metadata.EntityType,
			"provider_entity_id":    metadata.EntityID,
			"receipt_id":            receiptID.String(),
			"raw_body_hash":         bodyHash,
			"received_at":           now.Format(time.RFC3339),
			"provider_created_at":   metadata.ProviderCreatedAt,
			"trace_id":              req.TraceID,
		}
		payloadJSON, _ := json.Marshal(eventPayload)

		_, err = tx.ExecContext(ctx, `
			INSERT INTO ingress_outbox (
				trace_id, envelope_id, tenant_id, artifact_id, artifact_version_id,
				object_ref, received_at, ingress_channel, source,
				idempotency_key, encrypted_payload, payload_hash,
				raw_row_hash, envelope_hash, envelope_signature,
				content_type, kms_key_version, encryption_key_id,
				topic, status, event_type
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		`,
			req.TraceID,
			uuid.Must(uuid.NewV7()).String(),
			req.TenantID,
			uuid.Must(uuid.NewV7()).String(),
			uuid.Must(uuid.NewV7()).String(),
			"",
			now,
			"webhook:razorpay:"+req.ConnectorID.String(),
			"provider.observation.received",
			req.EventID,
			payloadJSON,
			bodyHash,
			bodyHash,
			bodyHash,
			"",
			"application/json",
			"",
			"",
			"payments.ledger.events.v1",
			"PENDING",
			"provider.observation.received",
		)
		if err != nil {
			return model.ReceiptResult{}, fmt.Errorf("outbox insert failed: %w", err)
		}

		// Update receipt status to published
		_, err = tx.ExecContext(ctx, `
			UPDATE provider_webhook_receipts
			SET ingestion_status = $1, published_at = $2, updated_at = $2
			WHERE id = $3
		`, model.WebhookStatusPublished, now, receiptID)
		if err != nil {
			return model.ReceiptResult{}, fmt.Errorf("status update failed: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return model.ReceiptResult{}, fmt.Errorf("transaction commit failed: %w", err)
	}

	status := model.WebhookStatusPublished
	if isDuplicate {
		status = model.WebhookStatusDuplicate
	}

	return model.ReceiptResult{
		ReceiptID:     receiptID,
		Status:        status,
		Duplicate:     isDuplicate,
		Published:     !isDuplicate,
		DeliveryCount: existingDeliveryCount,
	}, nil
}

// GetReceipt retrieves a receipt by ID.
func (s *RazorpayWebhookService) GetReceipt(ctx context.Context, receiptID uuid.UUID) (*model.ProviderWebhookReceipt, error) {
	var r model.ProviderWebhookReceipt
	err := db.DB.QueryRowContext(ctx, `
		SELECT id, tenant_id, connector_id, provider, provider_mode,
		       event_id, event_type, provider_entity_type, provider_entity_id,
		       raw_body_hash, raw_body_size_bytes,
		       signature_valid, received_at, ingestion_status,
		       delivery_count, created_at
		FROM provider_webhook_receipts
		WHERE id = $1
	`, receiptID).Scan(
		&r.ID, &r.TenantID, &r.ConnectorID, &r.Provider, &r.ProviderMode,
		&r.EventID, &r.EventType, &r.ProviderEntityType, &r.ProviderEntityID,
		&r.RawBodyHash, &r.RawBodySizeBytes,
		&r.SignatureValid, &r.ReceivedAt, &r.IngestionStatus,
		&r.DeliveryCount, &r.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("receipt not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get receipt: %w", err)
	}
	return &r, nil
}

// ListReceiptsByConnector returns receipts for a connector.
func (s *RazorpayWebhookService) ListReceiptsByConnector(connectorID uuid.UUID, limit int) ([]model.ProviderWebhookReceipt, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := db.DB.Query(`
		SELECT id, tenant_id, connector_id, provider, provider_mode,
		       event_id, event_type, provider_entity_type, provider_entity_id,
		       raw_body_hash, raw_body_size_bytes,
		       signature_valid, received_at, ingestion_status,
		       delivery_count, created_at
		FROM provider_webhook_receipts
		WHERE connector_id = $1
		ORDER BY received_at DESC
		LIMIT $2
	`, connectorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []model.ProviderWebhookReceipt
	for rows.Next() {
		var r model.ProviderWebhookReceipt
		if err := rows.Scan(
			&r.ID, &r.TenantID, &r.ConnectorID, &r.Provider, &r.ProviderMode,
			&r.EventID, &r.EventType, &r.ProviderEntityType, &r.ProviderEntityID,
			&r.RawBodyHash, &r.RawBodySizeBytes,
			&r.SignatureValid, &r.ReceivedAt, &r.IngestionStatus,
			&r.DeliveryCount, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		receipts = append(receipts, r)
	}
	return receipts, nil
}
