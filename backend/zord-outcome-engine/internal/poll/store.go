package poll

import (
	"context"
	"errors"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/models"
)

var ErrJobNotFound = errors.New("backfill job not found")
var ErrCursorLeaseHeld = errors.New("cursor lease held by another worker")

type Store interface {
	CreateJob(ctx context.Context, job BackfillJob) (BackfillJob, error)
	FindActiveJob(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (*BackfillJob, error)
	GetJob(ctx context.Context, jobID string) (BackfillJob, error)
	UpdateJob(ctx context.Context, job BackfillJob) error

	EnsureCursor(ctx context.Context, c BackfillCursor) (BackfillCursor, error)
	GetCursor(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (BackfillCursor, error)
	AcquireCursorLease(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time, owner string, ttl time.Duration) (BackfillCursor, error)
	AdvanceCursor(ctx context.Context, c BackfillCursor) error
	ReleaseCursorLease(ctx context.Context, cursorID, owner string) error

	InsertResponseReceipt(ctx context.Context, rec ResponseReceipt) error
	UpsertPayment(ctx context.Context, obs PaymentObservation) (UpsertResult, error)
	UpsertSettlementLine(ctx context.Context, obs SettlementLineObservation) (UpsertResult, error)
	ListPaymentIDsInWindow(ctx context.Context, tenantID, connectorID string, from, to time.Time) ([]string, error)
	GetPaymentHash(ctx context.Context, tenantID, connectorID, paymentID string) (string, bool, error)
	InsertOutbox(ctx context.Context, row models.OutboxRow) error
}

type ResponseReceipt struct {
	ID                string
	TenantID          string
	ConnectorID       string
	BackfillJobID     string
	Provider          string
	ResourceType      string
	RequestPath       string
	RequestQueryHash  string
	ResponseStatus    int
	ResponseHash      string
	PageSkip          int
	PageCount         int
	ProviderItemCount int
}

type PaymentObservation struct {
	ID           string
	TenantID     string
	ConnectorID  string
	Provider     string
	ProviderMode string
	Item         razorpay.NeutralPayment
	ReceiptID    string
	Source       string
}

type SettlementLineObservation struct {
	ID           string
	TenantID     string
	ConnectorID  string
	Provider     string
	ProviderMode string
	Item         razorpay.NeutralSettlementLine
	ReceiptID    string
	Source       string
}
