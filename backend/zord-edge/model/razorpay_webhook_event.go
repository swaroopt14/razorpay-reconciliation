package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// RazorpayWebhookEvent represents the top-level Razorpay webhook payload.
// Only envelope fields are parsed here — raw payload is preserved for later normalization.
type RazorpayWebhookEvent struct {
	Entity    string          `json:"entity"`
	AccountID string          `json:"account_id"`
	Event     string          `json:"event"`
	CreatedAt int64           `json:"created_at"`
	Payload   json.RawMessage `json:"payload"`
}

// RazorpayPaymentEntity extracts payment-specific fields from the nested payload.
type RazorpayPaymentEntity struct {
	ID       string `json:"id"`
	Entity   string `json:"entity"`
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Status   string `json:"status"`
	OrderID  string `json:"order_id"`
	Method   string `json:"method"`
}

// WebhookHeaders holds the parsed Razorpay-specific HTTP headers.
type WebhookHeaders struct {
	EventID   string
	Signature string
}

// WebhookMetadata holds extracted metadata from the Razorpay event.
// Amount/status fields are a safe payment snapshot for downstream
// observation processing — not a canonical outcome.
type WebhookMetadata struct {
	EventType         string
	EntityType        string
	EntityID          string
	AmountMinor       int64
	Currency          string
	Status            string
	OrderID           string
	Captured          bool
	FeeMinor          int64
	TaxMinor          int64
	ProviderCreatedAt *time.Time
}

// ReceiptResult is the outcome of processing a webhook receipt.
type ReceiptResult struct {
	ReceiptID     uuid.UUID
	Status        string
	Duplicate     bool
	Conflict      bool
	Published     bool
	DeliveryCount int
}
