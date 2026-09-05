package psp

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// PayoutRequest is the payload sent to the PSP.
// All PII fields here are resolved from Service 3 tokens just before this
// call is made. They exist in memory only for the duration of this call.
// After Do() returns, the caller must zero / discard these fields immediately.
type PayoutRequest struct {
	ReferenceID string      `json:"reference_id"` // = dispatch_id (L1 correlation carrier)
	Narration   string      `json:"narration"`    // = "ZRD:" + contract_id (L2 carrier)
	Amount      int64       `json:"amount"`       // in smallest currency unit (paise)
	Mode        string      `json:"mode"`         // corridor_id e.g. IMPS
	Beneficiary Beneficiary `json:"beneficiary"`
}

// Beneficiary contains the resolved PII fields.
// These are obtained from Service 3 (detokenize) immediately before the PSP call
// and must be discarded from memory immediately after Do() returns.
// NEVER log these fields. NEVER persist these fields.
type Beneficiary struct {
	Name          string `json:"name"`           // resolved from beneficiary_name_token
	AccountNumber string `json:"account_number"` // resolved from bank_account_token
	IFSC          string `json:"ifsc"`           // not PII, safe to pass
}

// PayoutResponse is the PSP's synchronous acknowledgement.
// This is NOT a final outcome — status = "pending" means the PSP has
// accepted the instruction. The real outcome (success/failure + UTR)
// arrives later via webhook or statement reconciliation (Service 5).
type PayoutResponse struct {
	PayoutID    string `json:"payout_id"`    // PSP's internal ID (provider_attempt_id)
	ReferenceID string `json:"reference_id"` // echoed back from our request
	Status      string `json:"status"`       // "pending" at this stage
}

// PSPError is a structured error returned by PSP client implementations.
// classifyPSPError uses this type for safe classification — never string matching.
// All PSP client implementations (DemoClient, real RazorpayX) must return
// *PSPError so the dispatch loop can classify outcomes correctly.
type PSPError struct {
	// HTTPStatusCode is the HTTP status code returned by the PSP.
	// 0 means the request never reached the PSP (network error).
	HTTPStatusCode int

	// IsTimeout is true when the PSP call exceeded the configured deadline.
	// Money may have already moved — caller must NOT retry without querying PSP.
	IsTimeout bool

	// IsNetworkDrop is true when the connection was dropped before a response.
	// Treat the same as timeout — uncertain outcome.
	IsNetworkDrop bool

	// Message is a human-readable description for logging.
	// Must NOT contain PII.
	Message string

	// Underlying is the wrapped original error.
	Underlying error
}

func (e *PSPError) Error() string {
	if e.IsTimeout {
		return fmt.Sprintf("psp: timeout: %s", e.Message)
	}
	if e.IsNetworkDrop {
		return fmt.Sprintf("psp: network drop: %s", e.Message)
	}
	return fmt.Sprintf("psp: HTTP %d: %s", e.HTTPStatusCode, e.Message)
}

func (e *PSPError) Unwrap() error { return e.Underlying }

// Client is the PSP HTTP client interface.
// Swap the concrete implementation for real RazorpayX, Cashfree, etc.
type Client interface {
	// Do sends a payout request to the PSP.
	// Returns PayoutResponse on HTTP 2xx.
	// Returns *PSPError on any non-2xx, timeout, or network failure.
	Do(ctx context.Context, req PayoutRequest) (PayoutResponse, error)

	// QueryByReference asks the PSP whether a payout with the given
	// reference_id (= dispatch_id) exists and what its current status is.
	// Returns (nil, nil) if the PSP has no record — meaning the original
	// call never reached the PSP and it is safe to retry.
	// Returns (*PSPError) only for network/infrastructure failures.
	// Used by the recovery sweeper for SENT and AWAITING_PROVIDER_SIGNAL rows.
	QueryByReference(ctx context.Context, referenceID string) (*PayoutResponse, error)
}

// DemoClient is a deterministic stub that always returns success.
// Replace with a real implementation before connecting to any PSP.
// The URL field is kept so you can swap in a mock HTTP server for
// integration testing without changing the interface.
type DemoClient struct {
	BaseURL    string
	TimeoutSec int
	http       *http.Client
}

func NewDemoClient(baseURL string, timeoutSec int) *DemoClient {
	return &DemoClient{
		BaseURL:    baseURL,
		TimeoutSec: timeoutSec,
		http: &http.Client{
			Timeout: time.Duration(timeoutSec) * time.Second,
		},
	}
}

// QueryByReference checks if the PSP has a record for the given reference_id.
// Demo stub always returns nil (no record) — safe to retry.
// Real implementation: GET {baseURL}/payouts?reference_id={referenceID}
func (c *DemoClient) QueryByReference(_ context.Context, _ string) (*PayoutResponse, error) {
	// Demo: always returns not-found so the recovery sweeper schedules a retry.
	return nil, nil
}
func (c *DemoClient) Do(_ context.Context, req PayoutRequest) (PayoutResponse, error) {
	if req.ReferenceID == "" {
		return PayoutResponse{}, &PSPError{
			HTTPStatusCode: 400,
			Message:        "reference_id is required",
		}
	}
	if req.Beneficiary.AccountNumber == "" || req.Beneficiary.Name == "" {
		return PayoutResponse{}, &PSPError{
			HTTPStatusCode: 422,
			Message:        "beneficiary fields are required",
		}
	}

	payoutID := "pout_demo_" + req.ReferenceID
	return PayoutResponse{
		PayoutID:    payoutID,
		ReferenceID: req.ReferenceID,
		Status:      "pending",
	}, nil
}