package razorpay

import (
	"errors"
	"time"
)

// Mode represents the Razorpay account mode.
type Mode string

const (
	ModeTest Mode = "test"
	ModeLive Mode = "live"
)

// Config holds Razorpay provider configuration.
// This struct must never be serialized into logs, events, or database records.
type Config struct {
	BaseURL     string
	KeyID       string
	KeySecret   string
	Mode        Mode
	Timeout     time.Duration
	MaxRetries       int
	BaseDelay        time.Duration
	MaxPageSize      int
	ReconMaxPageSize int
}

// DefaultConfig returns a sensible default configuration for local testing.
func DefaultConfig() Config {
	return Config{
		BaseURL:     "https://api.razorpay.com/v1",
		Mode:        ModeTest,
		Timeout:     10 * time.Second,
		MaxRetries:  3,
		BaseDelay:   250 * time.Millisecond,
		MaxPageSize:      100,
		ReconMaxPageSize: 1000,
	}
}

// PaymentPageSize returns the capped payments page size (max 100).
func (c Config) PaymentPageSize() int {
	if c.MaxPageSize <= 0 {
		return 100
	}
	if c.MaxPageSize > 100 {
		return 100
	}
	return c.MaxPageSize
}

// SettlementReconPageSize returns the capped recon page size (max 1000).
func (c Config) SettlementReconPageSize() int {
	if c.ReconMaxPageSize <= 0 {
		return 1000
	}
	if c.ReconMaxPageSize > 1000 {
		return 1000
	}
	return c.ReconMaxPageSize
}

// Validate checks the configuration for required fields and valid values.
func (c Config) Validate() error {
	if c.BaseURL == "" {
		return errors.New("razorpay base URL is required")
	}
	if c.KeyID == "" {
		return errors.New("razorpay key ID is required")
	}
	if c.KeySecret == "" {
		return errors.New("razorpay key secret is required")
	}
	if c.Mode != ModeTest && c.Mode != ModeLive {
		return errors.New("invalid Razorpay mode: must be 'test' or 'live'")
	}
	if c.Timeout <= 0 {
		return errors.New("timeout must be positive")
	}
	if c.MaxRetries < 0 || c.MaxRetries > 5 {
		return errors.New("invalid retry count: must be between 0 and 5")
	}
	if c.BaseDelay <= 0 {
		return errors.New("base delay must be positive")
	}
	if c.MaxPageSize <= 0 || c.MaxPageSize > 100 {
		return errors.New("max page size must be between 1 and 100")
	}
	return nil
}

// IsTest returns true if the config is in test mode.
func (c Config) IsTest() bool {
	return c.Mode == ModeTest
}

// IsLive returns true if the config is in live mode.
func (c Config) IsLive() bool {
	return c.Mode == ModeLive
}
