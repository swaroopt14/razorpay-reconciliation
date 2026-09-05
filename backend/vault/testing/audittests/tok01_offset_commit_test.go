package audittests

// TOK-01: "Do not commit Kafka offsets after failed token processing."
//
// The bug: kafka/consumer.go's ConsumeClaim called session.MarkMessage()
// unconditionally after the handler ran, regardless of error. Combined
// with sarama's default auto-commit, a failed tokenize (DB down, crypto
// error, malformed payload) was marked and committed anyway -- gone
// forever, no retry, no record.
//
// The fix has three layers:
//  1. kafka.WithRetryAndPoisonDLQ decorates the byte-level handler with a
//     bounded retry (internal/retryutil.Policy), then -- only if the
//     budget is exhausted -- a durable failure receipt via
//     repository.TokenizeFailureRepo.Record before giving up.
//  2. kafka.ConsumerHandler.ConsumeClaim (the real production type, not a
//     reimplementation -- exported for exactly this test) only calls
//     session.MarkMessage on success, and STOPS the claim entirely (does
//     not keep consuming later messages) on any failure that reaches it,
//     because sarama commits the highest MARKED offset regardless of
//     order -- letting a later message get marked first would silently
//     skip the earlier unrecorded failure on the next restart.
//  3. repository.TokenizeFailureRepo.Record durably persists the failure,
//     keyed by a dedupe_key that falls back to a content hash when the
//     message doesn't even parse far enough to have an envelope_id --
//     otherwise two different unparseable poison messages would collide
//     and silently overwrite each other's raw_message.
//
// Run with: go test ./testing/... -run TestTOK01 -v

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/IBM/sarama"

	"zord-token-enclave/internal/retryutil"
	"zord-token-enclave/kafka"
)

// -------------------- retryutil.Policy --------------------

// TestTOK01_PolicySucceedsWithoutExhaustingBudget proves a handler that
// fails a bounded number of times then succeeds returns nil overall, and
// stops retrying immediately on success (doesn't burn the whole budget).
func TestTOK01_PolicyRecoversBeforeExhaustion(t *testing.T) {
	policy := retryutil.Policy{MaxAttempts: 5, BaseDelay: time.Millisecond, MaxDelay: 5 * time.Millisecond, Multiplier: 2}

	calls := 0
	err := policy.Do(context.Background(), func(ctx context.Context, a retryutil.Attempt) error {
		calls++
		if calls < 3 {
			return errors.New("transient failure")
		}
		return nil
	}, nil)

	if err != nil {
		t.Fatalf("Do() error = %v, want nil (should have recovered on attempt 3)", err)
	}
	if calls != 3 {
		t.Fatalf("handler called %d times, want exactly 3 (2 failures + 1 success, no wasted attempts)", calls)
	}
}

// TestTOK01_PolicyExhaustsAndReturnsLastError proves a handler that always
// fails is retried exactly MaxAttempts times, no more, and the last error
// is returned.
func TestTOK01_PolicyExhaustsAndReturnsLastError(t *testing.T) {
	policy := retryutil.Policy{MaxAttempts: 5, BaseDelay: time.Millisecond, MaxDelay: 5 * time.Millisecond, Multiplier: 2}

	calls := 0
	wantErr := errors.New("permanent failure")
	err := policy.Do(context.Background(), func(ctx context.Context, a retryutil.Attempt) error {
		calls++
		return wantErr
	}, nil)

	if !errors.Is(err, wantErr) {
		t.Fatalf("Do() error = %v, want %v", err, wantErr)
	}
	if calls != 5 {
		t.Fatalf("handler called %d times, want exactly MaxAttempts=5", calls)
	}
}

// TestTOK01_PolicyRespectsContextCancellation proves a cancelled context
// stops retries promptly instead of burning the full backoff schedule --
// this is what lets a service shutdown mid-retry exit cleanly, leaving the
// message unmarked (safe, redelivered on restart) rather than blocking.
func TestTOK01_PolicyRespectsContextCancellation(t *testing.T) {
	policy := retryutil.Policy{MaxAttempts: 10, BaseDelay: time.Hour, MaxDelay: time.Hour, Multiplier: 2}

	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	done := make(chan error, 1)
	go func() {
		done <- policy.Do(ctx, func(ctx context.Context, a retryutil.Attempt) error {
			calls++
			return errors.New("always fails")
		}, nil)
	}()

	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Do() error = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Do() did not return promptly after context cancellation -- retry is not respecting ctx")
	}
	if calls != 1 {
		t.Fatalf("handler called %d times before cancellation, want exactly 1 (BaseDelay=1h means no retry should have fired yet)", calls)
	}
}

// -------------------- kafka.WithRetryAndPoisonDLQ --------------------

func fastPolicy() retryutil.Policy {
	return retryutil.Policy{MaxAttempts: 3, BaseDelay: time.Millisecond, MaxDelay: 2 * time.Millisecond, Multiplier: 2}
}

// TestTOK01_WrapperSucceedsWithoutInvokingOnExhausted proves the ordinary
// success path never touches the durable-failure path at all.
func TestTOK01_WrapperSucceedsWithoutInvokingOnExhausted(t *testing.T) {
	onExhaustedCalls := 0
	wrapped := kafka.WithRetryAndPoisonDLQ(
		func(raw []byte) error { return nil },
		fastPolicy(),
		func(ctx context.Context, raw []byte, attempts int, lastErr error) error {
			onExhaustedCalls++
			return nil
		},
	)

	if err := wrapped([]byte("msg")); err != nil {
		t.Fatalf("wrapped() error = %v, want nil", err)
	}
	if onExhaustedCalls != 0 {
		t.Fatalf("onExhausted called %d times, want 0 -- handler never failed", onExhaustedCalls)
	}
}

// TestTOK01_WrapperRecoversWithinBudget proves a handler that fails once
// then succeeds (e.g. a transient DB blip that clears) results in exactly
// one successful outcome and zero durable-failure records -- "recovery
// produces one result," matching the acceptance test's wording.
func TestTOK01_WrapperRecoversWithinBudget(t *testing.T) {
	attempts := 0
	onExhaustedCalls := 0
	wrapped := kafka.WithRetryAndPoisonDLQ(
		func(raw []byte) error {
			attempts++
			if attempts == 1 {
				return errors.New("simulated transient DB failure")
			}
			return nil
		},
		fastPolicy(),
		func(ctx context.Context, raw []byte, n int, lastErr error) error {
			onExhaustedCalls++
			return nil
		},
	)

	if err := wrapped([]byte("msg")); err != nil {
		t.Fatalf("wrapped() error = %v, want nil (should have recovered on attempt 2)", err)
	}
	if onExhaustedCalls != 0 {
		t.Fatalf("onExhausted called %d times, want 0 -- recovery within the retry budget must not produce a failure record", onExhaustedCalls)
	}
}

// TestTOK01_WrapperRecordsDurableFailureOnExhaustion proves a handler that
// always fails exhausts the retry budget, then calls onExhausted exactly
// once with the full attempt count, and -- because the durable receipt
// succeeded -- returns nil so the caller (consumer.go) is safe to mark the
// offset (the message is accounted for, not lost).
func TestTOK01_WrapperRecordsDurableFailureOnExhaustion(t *testing.T) {
	policy := fastPolicy()
	onExhaustedCalls := 0
	var gotAttempts int
	var gotErr error

	wrapped := kafka.WithRetryAndPoisonDLQ(
		func(raw []byte) error { return errors.New("permanent DB failure") },
		policy,
		func(ctx context.Context, raw []byte, n int, lastErr error) error {
			onExhaustedCalls++
			gotAttempts = n
			gotErr = lastErr
			return nil // durable receipt "succeeded"
		},
	)

	if err := wrapped([]byte("msg")); err != nil {
		t.Fatalf("wrapped() error = %v, want nil -- durable receipt succeeded, safe to mark", err)
	}
	if onExhaustedCalls != 1 {
		t.Fatalf("onExhausted called %d times, want exactly 1", onExhaustedCalls)
	}
	if gotAttempts != policy.MaxAttempts {
		t.Fatalf("onExhausted attempts = %d, want %d", gotAttempts, policy.MaxAttempts)
	}
	if gotErr == nil {
		t.Fatal("onExhausted lastErr = nil, want the handler's error")
	}
}

// TestTOK01_WrapperPropagatesErrorWhenReceiptFails is the critical
// safety-net case: if even the durable-failure write fails (e.g. DB
// unreachable), the wrapper must return a non-nil error so consumer.go
// does NOT mark the offset -- the message must be redelivered rather than
// silently lost.
func TestTOK01_WrapperPropagatesErrorWhenReceiptFails(t *testing.T) {
	recordErr := errors.New("durable receipt DB write failed")
	wrapped := kafka.WithRetryAndPoisonDLQ(
		func(raw []byte) error { return errors.New("permanent DB failure") },
		fastPolicy(),
		func(ctx context.Context, raw []byte, n int, lastErr error) error {
			return recordErr
		},
	)

	err := wrapped([]byte("msg"))
	if !errors.Is(err, recordErr) {
		t.Fatalf("wrapped() error = %v, want %v -- offset must not be marked when the durable receipt itself fails", err, recordErr)
	}
}

// -------------------- kafka.ConsumerHandler.ConsumeClaim (real production type) --------------------

// fakeSession is a minimal sarama.ConsumerGroupSession recording which
// messages get marked, so the test can assert on ConsumeClaim's real
// behavior without a live Kafka broker.
type fakeSession struct {
	marked []int64
}

func (f *fakeSession) Claims() map[string][]int32 { return nil }
func (f *fakeSession) MemberID() string           { return "test-member" }
func (f *fakeSession) GenerationID() int32         { return 1 }
func (f *fakeSession) MarkOffset(topic string, partition int32, offset int64, metadata string) {
}
func (f *fakeSession) Commit() {}
func (f *fakeSession) ResetOffset(topic string, partition int32, offset int64, metadata string) {
}
func (f *fakeSession) MarkMessage(msg *sarama.ConsumerMessage, metadata string) {
	f.marked = append(f.marked, msg.Offset)
}
func (f *fakeSession) Context() context.Context { return context.Background() }

// fakeClaim is a minimal sarama.ConsumerGroupClaim backed by an in-memory
// channel of pre-built messages.
type fakeClaim struct {
	ch chan *sarama.ConsumerMessage
}

func newFakeClaim(messages []*sarama.ConsumerMessage) *fakeClaim {
	ch := make(chan *sarama.ConsumerMessage, len(messages))
	for _, m := range messages {
		ch <- m
	}
	close(ch)
	return &fakeClaim{ch: ch}
}

func (f *fakeClaim) Topic() string                          { return "pii.tokenize.request" }
func (f *fakeClaim) Partition() int32                        { return 0 }
func (f *fakeClaim) InitialOffset() int64                    { return 0 }
func (f *fakeClaim) HighWaterMarkOffset() int64               { return int64(len(f.ch)) }
func (f *fakeClaim) Messages() <-chan *sarama.ConsumerMessage { return f.ch }

// TestTOK01_ConsumeClaimMarksOnlyOnSuccess is the direct regression test
// for the original bug: against the REAL kafka.ConsumerHandler.ConsumeClaim
// (not a reimplementation), a handler that fails on message 2 of 3 must
// result in message 1 (only) being marked -- never message 2, and message
// 3 must never even be attempted (ConsumeClaim must stop the claim, not
// skip past the failure, per the offset-ordering hazard documented in
// consumer.go).
func TestTOK01_ConsumeClaimMarksOnlyOnSuccess(t *testing.T) {
	messages := []*sarama.ConsumerMessage{
		{Offset: 100, Value: []byte("ok-1")},
		{Offset: 101, Value: []byte("fails")},
		{Offset: 102, Value: []byte("ok-3-must-not-be-processed")},
	}

	var processed []string
	handler := &kafka.ConsumerHandler{
		Handler: func(raw []byte) error {
			processed = append(processed, string(raw))
			if string(raw) == "fails" {
				return errors.New("handler failed")
			}
			return nil
		},
	}

	session := &fakeSession{}
	claim := newFakeClaim(messages)

	err := handler.ConsumeClaim(session, claim)
	if err == nil {
		t.Fatal("ConsumeClaim() error = nil, want non-nil -- the claim must stop (return an error) when the handler fails")
	}

	if len(session.marked) != 1 || session.marked[0] != 100 {
		t.Fatalf("marked offsets = %v, want exactly [100] -- the failed message and everything after it must never be marked", session.marked)
	}
	if len(processed) != 2 {
		t.Fatalf("processed %d messages (%v), want exactly 2 -- ConsumeClaim must stop at the failure, never reaching message 3", len(processed), processed)
	}
}

// TestTOK01_ConsumeClaimMarksAllOnFullSuccess is the baseline: when every
// message succeeds, every offset is marked, in order -- proving the fix
// didn't regress the happy path.
func TestTOK01_ConsumeClaimMarksAllOnFullSuccess(t *testing.T) {
	messages := []*sarama.ConsumerMessage{
		{Offset: 200, Value: []byte("a")},
		{Offset: 201, Value: []byte("b")},
		{Offset: 202, Value: []byte("c")},
	}

	handler := &kafka.ConsumerHandler{
		Handler: func(raw []byte) error { return nil },
	}

	session := &fakeSession{}
	claim := newFakeClaim(messages)

	if err := handler.ConsumeClaim(session, claim); err != nil {
		t.Fatalf("ConsumeClaim() error = %v, want nil", err)
	}
	want := []int64{200, 201, 202}
	if len(session.marked) != len(want) {
		t.Fatalf("marked offsets = %v, want %v", session.marked, want)
	}
	for i, off := range want {
		if session.marked[i] != off {
			t.Fatalf("marked offsets = %v, want %v", session.marked, want)
		}
	}
}
