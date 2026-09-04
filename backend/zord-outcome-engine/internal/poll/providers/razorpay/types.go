package razorpay

import (
	"time"
)

// TimeWindow defines a query range for polling.
type TimeWindow struct {
	From time.Time
	To   time.Time
}

// PaymentResponse represents a Razorpay payment object.
// These are provider DTOs — not used directly by the frontend or DB.
type PaymentResponse struct {
	ID                string            `json:"id"`
	Entity            string            `json:"entity"`
	Amount            int64             `json:"amount"`
	Currency          string            `json:"currency"`
	Status            string            `json:"status"`
	OrderID           string            `json:"order_id"`
	InvoiceID         string            `json:"invoice_id"`
	International     bool              `json:"international"`
	Method            string            `json:"method"`
	AmountRefunded    int64             `json:"amount_refunded"`
	AmountTransferred int64             `json:"amount_transferred"`
	Captured          bool              `json:"captured"`
	Fee               int64             `json:"fee"`
	Tax               int64             `json:"tax"`
	ErrorDescription  string            `json:"error_description"`
	CreatedAt         int64             `json:"created_at"`
	CapturedAt        int64             `json:"captured_at"`
	Email             string            `json:"email"`
	Contact           string            `json:"contact"`
	Notes             map[string]string `json:"notes"`
}

// SettlementResponse represents a Razorpay settlement object.
type SettlementResponse struct {
	ID        string `json:"id"`
	Entity    string `json:"entity"`
	Amount    int64  `json:"amount"`
	Fee       int64  `json:"fee"`
	Tax       int64  `json:"tax"`
	NetAmount int64  `json:"net_amount"`
	Currency  string `json:"currency"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"created_at"`
	SettledAt int64  `json:"settled_at"`
	UTR       string `json:"utr"`
}

// ListResponse is a generic Razorpay paginated list response.
type ListResponse[T any] struct {
	Entity string `json:"entity"`
	Count  int    `json:"count"`
	Items  []T    `json:"items"`
}

// HealthResult is the safe, redacted output of a connection test.
type HealthResult struct {
	Provider  string    `json:"provider"`
	Mode      string    `json:"mode"`
	Status    string    `json:"status"`
	ErrorCode string    `json:"error_code,omitempty"`
	Message   string    `json:"message,omitempty"`
	CheckedAt time.Time `json:"checked_at"`
	LatencyMs int64     `json:"latency_ms,omitempty"`
	RequestID string    `json:"request_id,omitempty"`
}

// PageResult holds the result of a paginated fetch.
type PageResult[T any] struct {
	Items   []T
	Count   int
	Skip    int
	HasMore bool
}

// CivilDate is a year/month/day used by the settlement recon endpoint.
type CivilDate struct {
	Year  int
	Month int
	Day   int
}

// ResponseMeta captures evidence about a single provider HTTP response.
type ResponseMeta struct {
	Status    int
	Body      []byte
	Hash      string
	RequestID string
	Path      string
	QueryHash string
}

// SettlementReconItem is one row from GET /settlements/recon/combined.
type SettlementReconItem struct {
	EntityID      string `json:"entity_id"`
	Type          string `json:"type"`
	Debit         int64  `json:"debit"`
	Credit        int64  `json:"credit"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	Fee           int64  `json:"fee"`
	Tax           int64  `json:"tax"`
	Settled       bool   `json:"settled"`
	CreatedAt     int64  `json:"created_at"`
	SettledAt     int64  `json:"settled_at"`
	SettlementID  string `json:"settlement_id"`
	SettlementUTR string `json:"settlement_utr"`
	PaymentID     string `json:"payment_id"`
	OrderID       string `json:"order_id"`
	RefundID      string `json:"refund_id"`
	Adjustment    int64  `json:"adjustment"`
}
