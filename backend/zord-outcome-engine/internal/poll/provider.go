package poll

import "time"

// PaymentReference identifies a single payment at the provider.
type PaymentReference struct {
	PaymentID string
	OrderID   string
}

// TimeWindow defines a query range for polling.
type TimeWindow struct {
	From time.Time
	To   time.Time
}

// Page controls pagination for list operations.
type Page struct {
	Skip  int
	Count int
}

// OutcomeProvider is the provider-neutral interface for payment outcome systems.
// Razorpay and other providers implement this interface.
type OutcomeProvider interface {
	// Name returns the provider identifier (e.g. "razorpay").
	Name() string

	// HealthCheck verifies credentials and account access via a read-only call.
	HealthCheck(ctx context.Context) error

	// FetchPayment retrieves a single payment by provider reference.
	FetchPayment(ctx context.Context, ref PaymentReference) (any, error)

	// FetchPayments retrieves payments within a time window with pagination.
	FetchPayments(ctx context.Context, window TimeWindow, page Page) (any, error)

	// FetchSettlements retrieves settlement records within a time window.
	FetchSettlements(ctx context.Context, window TimeWindow, page Page) (any, error)
}
