package kafka

// TOK-01: "Do not commit Kafka offsets after failed token processing."
//
// WithRetryAndPoisonDLQ wraps a byte-level message handler so consumer.go's
// core loop stays generic: it only needs to know "did the handler return an
// error or not" (see consumer.go's ConsumeClaim). Everything about *how* a
// failure is handled -- bounded retry, then a durable failure receipt, then
// a best-effort poison-DLQ publish -- lives here.
//
// The returned function returns nil (safe to mark the Kafka offset) in
// exactly two cases: the handler eventually succeeded within the retry
// budget, or it exhausted the budget AND onExhausted durably recorded the
// failure. If onExhausted itself fails (e.g. DB down), a non-nil error is
// returned so the caller does NOT mark the offset -- the message is
// redelivered and retried again from scratch on the next poll/rebalance.

import (
	"context"
	"log"
	"time"

	"zord-token-enclave/internal/retryutil"
)

// OnExhausted is called once a message's retry budget is exhausted. It must
// durably record the failure (so the message is never silently lost) and
// may best-effort publish it to a poison DLQ topic for replay tooling.
// Returning a non-nil error means "not durably recorded" -- the caller must
// not mark the Kafka offset.
type OnExhausted func(ctx context.Context, rawMsg []byte, attempts int, lastErr error) error

// WithRetryAndPoisonDLQ decorates handler with bounded retry (policy) and a
// durable-failure escape hatch (onExhausted) for when the budget is
// exhausted.
func WithRetryAndPoisonDLQ(
	handler func([]byte) error,
	policy retryutil.Policy,
	onExhausted OnExhausted,
) func([]byte) error {
	return func(rawMsg []byte) error {
		err := policy.Do(context.Background(),
			func(ctx context.Context, a retryutil.Attempt) error {
				return handler(rawMsg)
			},
			func(a retryutil.Attempt, delay time.Duration) {
				log.Printf("tokenize handler attempt %d failed: %v -- retrying in %s", a.Number, a.LastError, delay)
			},
		)
		if err == nil {
			return nil
		}

		if recErr := onExhausted(context.Background(), rawMsg, policy.MaxAttempts, err); recErr != nil {
			log.Printf("CRITICAL: could not durably record tokenize failure after %d attempts (last error: %v) -- offset will NOT be marked: %v",
				policy.MaxAttempts, err, recErr)
			return recErr
		}

		log.Printf("tokenize handler exhausted %d attempts (last error: %v) -- durable failure receipt recorded, offset will be marked",
			policy.MaxAttempts, err)
		return nil
	}
}
