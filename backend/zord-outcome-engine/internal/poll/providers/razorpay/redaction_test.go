package razorpay

import (
	"testing"
)

func TestRedactConfigDoesNotExposeSecrets(t *testing.T) {
	cfg := validTestConfig()
	safe := RedactConfig(cfg)

	// Ensure no secret fields in the map
	for key, val := range safe {
		if key == "key_secret" || key == "key_id" || key == "base_url" {
			t.Errorf("sensitive field %q should not be in redacted config", key)
		}
		// Stringify and check for secret value
		if str, ok := val.(string); ok && ContainsSensitiveData(str) {
			t.Errorf("redacted value for %q contains sensitive data: %s", key, str)
		}
	}
}

func TestRedactHealthResultSafe(t *testing.T) {
	result := &HealthResult{
		Provider:  "razorpay",
		Mode:      "test",
		Status:    "healthy",
		ErrorCode: "RAZORPAY_AUTH_FAILED",
		RequestID: "req_safe_123",
	}

	safe := RedactHealthResult(result)

	// Should contain safe fields
	if safe["provider"] != "razorpay" {
		t.Error("provider should be present")
	}
	if safe["mode"] != "test" {
		t.Error("mode should be present")
	}
	if safe["status"] != "healthy" {
		t.Error("status should be present")
	}
	// Should NOT contain any sensitive data
	for key, val := range safe {
		if str, ok := val.(string); ok && ContainsSensitiveData(str) {
			t.Errorf("redacted health result field %q contains sensitive data", key)
		}
	}
}

func TestContainsSensitiveData(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"key_secret=abc123", true},
		{"Authorization: Basic dXNlcjpwYXNz", true},
		{"provider=razorpay", false},
		{"mode=test", false},
		{"status=healthy", false},
		{"error_code=RAZORPAY_AUTH_FAILED", false},
		{"", false},
	}

	for _, tt := range tests {
		result := ContainsSensitiveData(tt.input)
		if result != tt.expected {
			t.Errorf("ContainsSensitiveData(%q) = %v, want %v", tt.input, result, tt.expected)
		}
	}
}

func TestSafeLogAttrsNilError(t *testing.T) {
	attrs := SafeLogAttrs(nil)
	if len(attrs) != 0 {
		t.Error("nil error should return empty attrs")
	}
}

func TestSafeLogAttrsStripsSecrets(t *testing.T) {
	err := &ProviderError{
		Kind:    ErrUnauthorized,
		Message: "key_secret was rejected by the server",
	}
	attrs := SafeLogAttrs(err)
	if len(attrs) == 0 {
		t.Error("should return attrs")
	}
	for _, attr := range attrs {
		if ContainsSensitiveData(attr.String()) {
			t.Errorf("log attr contains sensitive data: %s", attr.String())
		}
	}
}
