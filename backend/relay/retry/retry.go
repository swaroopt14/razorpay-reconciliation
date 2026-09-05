package retry

import (
	"context"
	"math"
	"math/rand"
	"time"
)

// Attempt holds metadata about one retry attempt.
type Attempt struct {
	Number    int
	LastError error
}

// Policy defines retry behaviour for Kafka publish failures.
type Policy struct {
	// MaxAttempts is the maximum number of total tries (including the first).
	MaxAttempts int

	// BaseDelay is the initial backoff duration.
	BaseDelay time.Duration

	// MaxDelay caps the computed backoff regardless of attempt number.
	MaxDelay time.Duration

	// Multiplier is the exponential growth factor. Defaults to 2.
	Multiplier float64
}

// DefaultPolicy returns the non-negotiable fintech retry policy.
// Schedule (approximate): 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s…
func DefaultPolicy() Policy {
	return Policy{
		MaxAttempts: 20,
		BaseDelay:   1 * time.Second,
		MaxDelay:    5 * time.Minute,
		Multiplier:  2.0,
	}
}

// Do executes fn up to p.MaxAttempts times.
// Between attempts it sleeps for the computed backoff, respecting ctx cancellation.
// Returns the last error if all attempts fail, or nil on success.
// The onRetry callback (optional) is called before each sleep; pass nil to omit.
func (p Policy) Do(
	ctx context.Context,
	fn func(ctx context.Context, attempt Attempt) error,
	onRetry func(attempt Attempt, delay time.Duration),
) error {
	mult := p.Multiplier
	if mult <= 0 {
		mult = 2.0
	}

	var lastErr error
	for i := 0; i < p.MaxAttempts; i++ {
		attempt := Attempt{Number: i + 1, LastError: lastErr}

		if err := fn(ctx, attempt); err == nil {
			return nil
		} else {
			lastErr = err
		}

		// Do not sleep after the final attempt.
		if i == p.MaxAttempts-1 {
			break
		}

		delay := p.delay(i, mult)
		if onRetry != nil {
			onRetry(Attempt{Number: i + 1, LastError: lastErr}, delay)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}

	return lastErr
}

// delay computes the jittered exponential backoff for attempt i (0-indexed).
// Formula: min(maxDelay, base * multiplier^i) * jitter(0.8..1.2)
func (p Policy) delay(i int, mult float64) time.Duration {
	backoff := float64(p.BaseDelay) * math.Pow(mult, float64(i))
	if backoff > float64(p.MaxDelay) {
		backoff = float64(p.MaxDelay)
	}
	// ±20% jitter to avoid thundering herd across multiple relay instances.
	jitter := 0.8 + rand.Float64()*0.4
	return time.Duration(backoff * jitter)
}

// Schedule returns the computed delay for attempt i without executing anything.
// Useful for logging / testing.
func (p Policy) Schedule(attemptIndex int) time.Duration {
	mult := p.Multiplier
	if mult <= 0 {
		mult = 2.0
	}
	return p.delay(attemptIndex, mult)
}
