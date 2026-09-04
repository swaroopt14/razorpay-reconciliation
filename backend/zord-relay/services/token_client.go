package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// TokenClient calls Service 3 (Token Enclave) for JIT detokenization.
// Detokenization must only happen immediately before a PSP call.
// Resolved values must never be logged, stored, or passed outside
// the scope of the PSP call that consumes them.
type TokenClient interface {
	Detokenize(ctx context.Context, req DetokenizeRequest) (*DetokenizeResponse, error)
}

// DetokenizeRequest matches Service 3's /v1/detokenize input exactly.
// It is a flat map of field-name → token-value.
// Only send the fields you actually need for the PSP call.
// Example:
//
//	{
//	  "account_number": "tok_thZQ2Y8oOP6CUg...",
//	  "name":           "tok_h+v05u6HV5ypX...",
//	  "ifsc":           "tok_3lHFptxRL9DPy...",
//	  "vpa":            "tok_SuqX4NuAK+4aV..."
//	}
type DetokenizeRequest struct {
	AccountNumber string `json:"account_number,omitempty"`
	Name          string `json:"name,omitempty"`
	IFSC          string `json:"ifsc,omitempty"`
	VPA           string `json:"vpa,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
}

// DetokenizeResponse is the resolved plaintext map returned by Service 3.
// Same field names as the request, values are now plaintext.
// These values exist in memory only — zero them after the PSP call.
type DetokenizeResponse struct {
	AccountNumber string `json:"account_number,omitempty"`
	Name          string `json:"name,omitempty"`
	IFSC          string `json:"ifsc,omitempty"`
	VPA           string `json:"vpa,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
}

// HTTPTokenClient calls Service 3's real /v1/detokenize endpoint.
// This is the only supported TokenClient implementation.
// There is no stub fallback — a missing or unreachable enclave is a fatal
// startup error to prevent any dispatch flow from proceeding without real
// tokenization controls.
type HTTPTokenClient struct {
	baseURL string
	http    *http.Client
}

// NewHTTPTokenClient creates an HTTPTokenClient without a connectivity probe.
// Prefer NewHTTPTokenClientWithConnectivityCheck for production startup.
func NewHTTPTokenClient(baseURL string, timeoutSecs int) *HTTPTokenClient {
	return &HTTPTokenClient{
		baseURL: baseURL,
		http: &http.Client{
			Timeout: time.Duration(timeoutSecs) * time.Second,
		},
	}
}

// NewHTTPTokenClientWithConnectivityCheck creates an HTTPTokenClient and
// immediately probes GET <baseURL>/health to confirm the enclave is reachable.
//
// If the probe fails the error is returned to the caller (main.run) which
// treats it as a fatal startup failure — the process exits before accepting
// any work. This guarantees that no dispatch flow can silently proceed
// without a live, verified token enclave connection.
func NewHTTPTokenClientWithConnectivityCheck(baseURL string, timeoutSecs int) (*HTTPTokenClient, error) {
	c := NewHTTPTokenClient(baseURL, timeoutSecs)

	probeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	probeURL := baseURL + "/health"
	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, probeURL, nil)
	if err != nil {
		return nil, fmt.Errorf("token_client: build probe request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf(
			"token_client: connectivity check failed — token enclave at %q is unreachable: %w",
			baseURL, err,
		)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf(
			"token_client: connectivity check failed — token enclave at %q returned HTTP %d",
			baseURL, resp.StatusCode,
		)
	}

	return c, nil
}

func (c *HTTPTokenClient) Detokenize(ctx context.Context, req DetokenizeRequest) (*DetokenizeResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("token_client: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/detokenize", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("token_client: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("token_client: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token_client: HTTP %d", resp.StatusCode)
	}

	var result DetokenizeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("token_client: decode response: %w", err)
	}
	return &result, nil
}