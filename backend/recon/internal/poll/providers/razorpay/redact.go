package razorpay

import (
	"log/slog"
	"strings"
)

// sensitivePatterns lists substrings that must never appear in logs.
var sensitivePatterns = []string{
	"key_secret",
	"key_secret=",
	"Authorization:",
	"Basic ",
	"Bearer ",
}

// RedactConfig returns a map of safe config fields for logging.
// It never includes KeySecret, KeyID, or BaseURL.
func RedactConfig(cfg Config) map[string]any {
	return map[string]any{
		"provider":     "razorpay",
		"mode":         string(cfg.Mode),
		"max_retries":  cfg.MaxRetries,
		"timeout_ms":   cfg.Timeout.Milliseconds(),
		"max_page_size": cfg.MaxPageSize,
	}
}

// RedactHealthResult returns safe fields from a health check for structured logging.
func RedactHealthResult(r *HealthResult) map[string]any {
	m := map[string]any{
		"provider":    r.Provider,
		"mode":        r.Mode,
		"status":      r.Status,
		"checked_at":  r.CheckedAt,
		"latency_ms":  r.LatencyMs,
	}
	if r.ErrorCode != "" {
		m["error_code"] = r.ErrorCode
	}
	if r.RequestID != "" {
		m["request_id"] = r.RequestID
	}
	return m
}

// SafeLogAttrs returns structured log attributes from an error, stripping secrets.
func SafeLogAttrs(err error) []slog.Attr {
	if err == nil {
		return nil
	}
	msg := err.Error()
	// Strip any leaked sensitive data
	for _, pat := range sensitivePatterns {
		if strings.Contains(msg, pat) {
			msg = "[REDACTED]"
			break
		}
	}
	return []slog.Attr{
		slog.String("error_kind", "razorpay_error"),
		slog.String("message", msg),
	}
}

// ContainsSensitiveData checks if a string contains any sensitive patterns.
func ContainsSensitiveData(s string) bool {
	for _, pat := range sensitivePatterns {
		if strings.Contains(s, pat) {
			return true
		}
	}
	return false
}
