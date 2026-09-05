package razorpay

import "fmt"

// ErrorKind classifies Razorpay provider errors.
type ErrorKind string

const (
	ErrUnauthorized ErrorKind = "unauthorized"
	ErrForbidden    ErrorKind = "forbidden"
	ErrRateLimited  ErrorKind = "rate_limited"
	ErrBadRequest   ErrorKind = "bad_request"
	ErrNotFound     ErrorKind = "not_found"
	ErrProvider     ErrorKind = "provider_error"
	ErrTimeout      ErrorKind = "timeout"
	ErrTransport    ErrorKind = "transport_error"
	ErrDecode       ErrorKind = "decode_error"
)

// ProviderError represents a typed error from the Razorpay API.
type ProviderError struct {
	Kind       ErrorKind
	HTTPStatus int
	Code       string
	Message    string
	Retryable  bool
	RequestID  string
}

// Error implements the error interface.
func (e *ProviderError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("razorpay %s: %s (HTTP %d)", e.Kind, e.Code, e.HTTPStatus)
	}
	return fmt.Sprintf("razorpay %s: %s (HTTP %d)", e.Kind, e.Message, e.HTTPStatus)
}

// IsRetryable returns whether this error should be retried.
func (e *ProviderError) IsRetryable() bool {
	return e.Retryable
}

// ClassifyHTTPStatus maps an HTTP status code to a ProviderError.
func ClassifyHTTPStatus(status int, body string, requestID string) *ProviderError {
	base := &ProviderError{
		HTTPStatus: status,
		RequestID:  requestID,
	}

	switch {
	case status == 400:
		base.Kind = ErrBadRequest
		base.Code = "RAZORPAY_BAD_REQUEST"
		base.Message = "Invalid request parameters"
		base.Retryable = false

	case status == 401:
		base.Kind = ErrUnauthorized
		base.Code = "RAZORPAY_AUTH_FAILED"
		base.Message = "Razorpay credentials were rejected"
		base.Retryable = false

	case status == 403:
		base.Kind = ErrForbidden
		base.Code = "RAZORPAY_FORBIDDEN"
		base.Message = "Account lacks permission for this endpoint"
		base.Retryable = false

	case status == 404:
		base.Kind = ErrNotFound
		base.Code = "RAZORPAY_NOT_FOUND"
		base.Message = "Requested resource not found"
		base.Retryable = false

	case status == 408:
		base.Kind = ErrTimeout
		base.Code = "RAZORPAY_TIMEOUT"
		base.Message = "Request timed out"
		base.Retryable = true

	case status == 429:
		base.Kind = ErrRateLimited
		base.Code = "RAZORPAY_RATE_LIMITED"
		base.Message = "Rate limit exceeded"
		base.Retryable = true

	case status >= 500:
		base.Kind = ErrProvider
		base.Code = "RAZORPAY_SERVER_ERROR"
		base.Message = "Razorpay server error"
		base.Retryable = true

	default:
		base.Kind = ErrProvider
		base.Code = "RAZORPAY_UNKNOWN"
		base.Message = fmt.Sprintf("Unexpected status %d", status)
		base.Retryable = false
	}

	return base
}
