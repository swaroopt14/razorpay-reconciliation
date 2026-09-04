package razorpay

import (
	"testing"
	"time"
)

func validTestConfig() Config {
	return Config{
		BaseURL:     "https://api.razorpay.com/v1",
		KeyID:       "rzp_test_xxx",
		KeySecret:   "test_secret_xxx",
		Mode:        ModeTest,
		Timeout:     10 * time.Second,
		MaxRetries:  3,
		BaseDelay:   250 * time.Millisecond,
		MaxPageSize: 100,
	}
}

func TestValidTestConfig(t *testing.T) {
	cfg := validTestConfig()
	if err := cfg.Validate(); err != nil {
		t.Errorf("valid config should pass validation, got: %v", err)
	}
}

func TestValidLiveConfig(t *testing.T) {
	cfg := validTestConfig()
	cfg.Mode = ModeLive
	cfg.KeyID = "rzp_live_xxx"
	if err := cfg.Validate(); err != nil {
		t.Errorf("valid live config should pass, got: %v", err)
	}
}

func TestMissingBaseURL(t *testing.T) {
	cfg := validTestConfig()
	cfg.BaseURL = ""
	if err := cfg.Validate(); err == nil {
		t.Error("missing base URL should fail")
	}
}

func TestMissingKeyID(t *testing.T) {
	cfg := validTestConfig()
	cfg.KeyID = ""
	if err := cfg.Validate(); err == nil {
		t.Error("missing key ID should fail")
	}
}

func TestMissingKeySecret(t *testing.T) {
	cfg := validTestConfig()
	cfg.KeySecret = ""
	if err := cfg.Validate(); err == nil {
		t.Error("missing key secret should fail")
	}
}

func TestInvalidMode(t *testing.T) {
	cfg := validTestConfig()
	cfg.Mode = "production"
	if err := cfg.Validate(); err == nil {
		t.Error("invalid mode should fail")
	}
}

func TestZeroTimeout(t *testing.T) {
	cfg := validTestConfig()
	cfg.Timeout = 0
	if err := cfg.Validate(); err == nil {
		t.Error("zero timeout should fail")
	}
}

func TestNegativeRetries(t *testing.T) {
	cfg := validTestConfig()
	cfg.MaxRetries = -1
	if err := cfg.Validate(); err == nil {
		t.Error("negative retries should fail")
	}
}

func TestTooManyRetries(t *testing.T) {
	cfg := validTestConfig()
	cfg.MaxRetries = 10
	if err := cfg.Validate(); err == nil {
		t.Error("more than 5 retries should fail")
	}
}

func TestZeroPageSize(t *testing.T) {
	cfg := validTestConfig()
	cfg.MaxPageSize = 0
	if err := cfg.Validate(); err == nil {
		t.Error("zero page size should fail")
	}
}

func TestPageSizeOver100(t *testing.T) {
	cfg := validTestConfig()
	cfg.MaxPageSize = 200
	if err := cfg.Validate(); err == nil {
		t.Error("page size > 100 should fail")
	}
}

func TestDefaultConfigStructure(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Mode != ModeTest {
		t.Error("default mode should be test")
	}
	if cfg.BaseURL != "https://api.razorpay.com/v1" {
		t.Error("default base URL mismatch")
	}
	if cfg.Timeout != 10*time.Second {
		t.Error("default timeout should be 10s")
	}
	if cfg.MaxRetries != 3 {
		t.Error("default max retries should be 3")
	}
}

func TestDefaultConfigNeedsCredentials(t *testing.T) {
	cfg := DefaultConfig()
	if err := cfg.Validate(); err == nil {
		t.Error("default config without credentials should fail validation")
	}
}

func TestIsTestAndIsLive(t *testing.T) {
	testCfg := validTestConfig()
	if !testCfg.IsTest() {
		t.Error("IsTest should return true for test mode")
	}
	if testCfg.IsLive() {
		t.Error("IsLive should return false for test mode")
	}

	liveCfg := validTestConfig()
	liveCfg.Mode = ModeLive
	if liveCfg.IsTest() {
		t.Error("IsTest should return false for live mode")
	}
	if !liveCfg.IsLive() {
		t.Error("IsLive should return true for live mode")
	}
}
