package handler

import (
	"context"

	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/storage"

	"github.com/google/uuid"
)

type Handler struct {
	S3store *storage.S3Store

	// Optional test hooks. Production leaves these nil.
	ReceiveRazorpayWebhook  func(ctx context.Context, req services.WebhookRequest) (model.ReceiptResult, int, error)
	LookupRazorpayConnector func(connectorID uuid.UUID) (tenantID uuid.UUID, mode string, secret string, err error)
}
