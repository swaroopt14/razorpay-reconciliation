package error

// APIError represents a standardized error response returned by the API.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
	TraceID string `json:"trace_id"`
}

// Error implements the error interface so APIError can be returned as an error.
func (e APIError) Error() string {
	return e.Code + ": " + e.Message
}

// HasHint returns true if a hint is provided.
func (e APIError) HasHint() bool {
	return e.Hint != ""
}
