package model

import (
	"time"

	"github.com/google/uuid"
)

// ProviderWebhookReceipt represents a persisted webhook delivery from a payment provider.
type ProviderWebhookReceipt struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	TenantID           uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	ConnectorID        uuid.UUID  `json:"connector_id" db:"connector_id"`
	Provider           string     `json:"provider" db:"provider"`
	ProviderMode       string     `json:"provider_mode" db:"provider_mode"`
	EventID            string     `json:"event_id" db:"event_id"`
	EventType          *string    `json:"event_type,omitempty" db:"event_type"`
	ProviderEntityType *string    `json:"provider_entity_type,omitempty" db:"provider_entity_type"`
	ProviderEntityID   *string    `json:"provider_entity_id,omitempty" db:"provider_entity_id"`
	RawBodyURI         *string    `json:"raw_body_uri,omitempty" db:"raw_body_uri"`
	RawBodyHash        string     `json:"raw_body_hash" db:"raw_body_hash"`
	RawBodySizeBytes   int64      `json:"raw_body_size_bytes" db:"raw_body_size_bytes"`
	SignatureHeader    *string    `json:"signature_header,omitempty" db:"signature_header"`
	SignatureValid     bool       `json:"signature_valid" db:"signature_valid"`
	ReceivedAt         time.Time  `json:"received_at" db:"received_at"`
	ProviderCreatedAt  *time.Time `json:"provider_created_at,omitempty" db:"provider_created_at"`
	IngestionStatus    string     `json:"ingestion_status" db:"ingestion_status"`
	PublishedAt        *time.Time `json:"published_at,omitempty" db:"published_at"`
	FirstSeenTraceID   string     `json:"first_seen_trace_id" db:"first_seen_trace_id"`
	LastSeenAt         *time.Time `json:"last_seen_at,omitempty" db:"last_seen_at"`
	DeliveryCount      int        `json:"delivery_count" db:"delivery_count"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}

// Ingestion status constants
const (
	WebhookStatusReceived          = "received"
	WebhookStatusPersisted         = "persisted"
	WebhookStatusPublished         = "published"
	WebhookStatusDuplicate         = "duplicate"
	WebhookStatusRejectedSignature = "rejected_signature"
	WebhookStatusRejectedSchema    = "rejected_schema"
	WebhookStatusFailedRetryable   = "failed_retryable"
	WebhookStatusFailedPermanent   = "failed_permanent"
)
