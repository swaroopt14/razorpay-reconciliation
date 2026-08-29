package razorpay

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"

	"time"
)

const (
	defaultUserAgent = "zord-connector/1.0"
	maxRetryAfter   = 30 * time.Second
)

// Logger is the interface the client uses for structured logging.
type Logger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
	Error(msg string, args ...any)
}

// Metrics optionally tracks client operation metrics.
type Metrics interface {
	IncCounter(name string, labels map[string]string)
	ObserveHistogram(name string, value float64, labels map[string]string)
}

// Client is a Razorpay API client with retry, timeout, and redacted logging.
type Client struct {
	httpClient *http.Client
	config     Config
	logger     Logger
	metrics    Metrics
}

// NewClient creates a validated Razorpay client.
func NewClient(cfg Config, httpClient *http.Client, logger Logger, metrics Metrics) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("razorpay client config invalid: %w", err)
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: cfg.Timeout}
	}
	if logger == nil {
		logger = &noopLogger{}
	}
	return &Client{
		httpClient: httpClient,
		config:     cfg,
		logger:     logger,
		metrics:    metrics,
	}, nil
}

// HealthCheck performs a safe read-only call to verify credentials.
func (c *Client) HealthCheck(ctx context.Context) (*HealthResult, error) {
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.config.BaseURL+"/payments?count=1", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create health check request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		latency := time.Since(start).Milliseconds()
		c.logger.Warn("razorpay health check failed",
			slog.String("provider", "razorpay"),
			slog.String("mode", string(c.config.Mode)),
			slog.String("operation", "health_check"),
			slog.Duration("latency", time.Since(start)),
		)
		c.emitMetrics("health_check", 0, "error")
		return &HealthResult{
			Provider:  "razorpay",
			Mode:      string(c.config.Mode),
			Status:    "unreachable",
			ErrorCode: "RAZORPAY_TRANSPORT_ERROR",
			Message:   "Could not reach Razorpay API",
			CheckedAt: start,
			LatencyMs: latency,
		}, nil
	}
	defer resp.Body.Close()

	latency := time.Since(start).Milliseconds()

	if resp.StatusCode == 200 {
		c.logger.Info("razorpay health check passed",
			slog.String("provider", "razorpay"),
			slog.String("mode", string(c.config.Mode)),
			slog.String("operation", "health_check"),
			slog.Int64("latency_ms", latency),
			slog.Int("http_status", resp.StatusCode),
		)
		c.emitMetrics("health_check", latency, "success")
		return &HealthResult{
			Provider:  "razorpay",
			Mode:      string(c.config.Mode),
			Status:    "healthy",
			CheckedAt: start,
			LatencyMs: latency,
		}, nil
	}

	pErr := ClassifyHTTPStatus(resp.StatusCode, "", "")
	c.logger.Warn("razorpay health check failed",
		slog.String("provider", "razorpay"),
		slog.String("mode", string(c.config.Mode)),
		slog.String("operation", "health_check"),
		slog.Int64("latency_ms", latency),
		slog.Int("http_status", resp.StatusCode),
		slog.String("error_code", pErr.Code),
	)
	c.emitMetrics("health_check", latency, "error")

	return &HealthResult{
		Provider:  "razorpay",
		Mode:      string(c.config.Mode),
		Status:    string(pErr.Kind),
		ErrorCode: pErr.Code,
		Message:   pErr.Message,
		CheckedAt: start,
		LatencyMs: latency,
	}, nil
}

// do executes an HTTP request with retry logic and response decoding.
func (c *Client) do(ctx context.Context, method, path string, query url.Values, out any) error {
	var lastErr error

	for attempt := 0; attempt <= c.config.MaxRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return &ProviderError{
				Kind:    ErrTimeout,
				Message: "context cancelled",
			}
		}

		if attempt > 0 {
			delay := c.retryDelay(attempt)
			c.logger.Info("razorpay retry attempt",
				slog.String("provider", "razorpay"),
				slog.String("operation", method+" "+path),
				slog.Int("attempt", attempt),
				slog.Duration("delay", delay),
			)
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return &ProviderError{Kind: ErrTimeout, Message: "context cancelled during retry wait"}
			}
		}

		fullURL := c.config.BaseURL + path
		if query != nil && len(query) > 0 {
			fullURL += "?" + query.Encode()
		}

		req, err := http.NewRequestWithContext(ctx, method, fullURL, nil)
		if err != nil {
			return &ProviderError{Kind: ErrTransport, Message: fmt.Sprintf("failed to create request: %v", err)}
		}

		c.setHeaders(req)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return &ProviderError{Kind: ErrTimeout, Message: "context cancelled"}
			}
			lastErr = &ProviderError{
				Kind:      ErrTransport,
				Code:      "RAZORPAY_TRANSPORT_ERROR",
				Message:   fmt.Sprintf("request failed: %v", err),
				Retryable: true,
			}
			c.emitMetrics(method+" "+path, 0, "transport_error")
			continue
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if out != nil && len(bodyBytes) > 0 {
				if err := json.Unmarshal(bodyBytes, out); err != nil {
					return &ProviderError{
						Kind:       ErrDecode,
						Code:       "RAZORPAY_DECODE_ERROR",
						Message:    "failed to parse response JSON",
						HTTPStatus: resp.StatusCode,
					}
				}
			}
			c.emitMetrics(method+" "+path, 0, "success")
			return nil
		}

		requestID := resp.Header.Get("X-Request-Id")
		pErr := ClassifyHTTPStatus(resp.StatusCode, string(bodyBytes), requestID)

		if !pErr.Retryable {
			return pErr
		}

		lastErr = pErr
		c.emitMetrics(method+" "+path, 0, string(pErr.Kind))
	}

	return lastErr
}

// setHeaders adds Basic Auth, User-Agent, Accept, and trace headers.
func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", defaultUserAgent)

	// Basic Auth: base64(keyID:keySecret)
	cred := c.config.KeyID + ":" + c.config.KeySecret
	encoded := base64.StdEncoding.EncodeToString([]byte(cred))
	req.Header.Set("Authorization", "Basic "+encoded)
}

// retryDelay calculates the delay for a given attempt with jitter.
func (c *Client) retryDelay(attempt int) time.Duration {
	base := c.config.BaseDelay * time.Duration(1<<(attempt-1)) // exponential
	jitter := time.Duration(rand.Int63n(int64(base) / 2))      // 0..50% of base
	delay := base + jitter

	// Cap at 30 seconds
	if delay > maxRetryAfter {
		delay = maxRetryAfter
	}
	return delay
}

// ListPayments fetches a single page of payments within a time window.
func (c *Client) ListPayments(ctx context.Context, window TimeWindow, page SkipCount) ([]PaymentResponse, error) {
	q := PaginationParams(page)
	q.Set("from", strconv.FormatInt(window.From.Unix(), 10))
	q.Set("to", strconv.FormatInt(window.To.Unix(), 10))

	var result ListResponse[PaymentResponse]
	if err := c.do(ctx, http.MethodGet, "/payments", q, &result); err != nil {
		return nil, err
	}
	return result.Items, nil
}

// ListSettlements fetches a single page of settlements within a time window.
func (c *Client) ListSettlements(ctx context.Context, window TimeWindow, page SkipCount) ([]SettlementResponse, error) {
	q := PaginationParams(page)
	q.Set("from", strconv.FormatInt(window.From.Unix(), 10))
	q.Set("to", strconv.FormatInt(window.To.Unix(), 10))

	var result ListResponse[SettlementResponse]
	if err := c.do(ctx, http.MethodGet, "/settlements", q, &result); err != nil {
		return nil, err
	}
	return result.Items, nil
}

// FetchPayment retrieves a single payment by ID.
func (c *Client) FetchPayment(ctx context.Context, paymentID string) (*PaymentResponse, error) {
	var result PaymentResponse
	if err := c.do(ctx, http.MethodGet, "/payments/"+paymentID, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// emitMetrics sends a metric if metrics collector is configured.
func (c *Client) emitMetrics(operation string, latencyMs int64, status string) {
	if c.metrics == nil {
		return
	}
	labels := map[string]string{
		"provider":  "razorpay",
		"operation": operation,
		"status":    status,
	}
	c.metrics.IncCounter("razorpay_requests_total", labels)
	if latencyMs > 0 {
		c.metrics.ObserveHistogram("razorpay_request_duration_ms", float64(latencyMs), labels)
	}
}

// noopLogger is a silent logger used when no logger is provided.
type noopLogger struct{}

func (l *noopLogger) Info(msg string, args ...any)  {}
func (l *noopLogger) Warn(msg string, args ...any)  {}
func (l *noopLogger) Error(msg string, args ...any) {}
