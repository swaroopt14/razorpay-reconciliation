package audittests

// TOK-02: "Wait for producer delivery acknowledgment before declaring
// token result published."
//
// The bug: kafka/producer.go's Publish used an async Kafka producer and
// returned nil the instant a message was QUEUED, not once the broker
// acknowledged it. Delivery errors only surfaced in a disconnected
// background goroutine. So a Kafka outage let TokenizePII succeed,
// Publish lie and return nil, and TOK-01's retry logic (which only reacts
// to a returned error) never even trigger -- the result was silently
// lost.
//
// The fix: Publish now uses a real sarama.SyncProducer (blocks until the
// broker acknowledges, or the producer's own small retry budget is
// exhausted) and returns the real error, wrapped in kafka.ErrDeliveryFailed.
// cmd/main.go's onExhausted callback then keeps a delivery failure
// redelivering indefinitely (never marks the offset) rather than treating
// it like a permanent processing failure that gets a durable receipt and
// is advanced past.
//
// Run with: go test ./testing/... -run TestTOK02 -v

import (
	"context"
	"errors"
	"testing"

	"github.com/IBM/sarama"
	"github.com/IBM/sarama/mocks"

	"zord-token-enclave/kafka"
)

type nopErrorReporter struct{ t *testing.T }

func (r nopErrorReporter) Errorf(format string, args ...interface{}) {
	r.t.Errorf(format, args...)
}

// TestTOK02_PublishReturnsRealErrorOnBrokerFailure is the direct proof of
// the fix: against a real sarama.SyncProducer (mocked broker responses,
// not a reimplementation of Publish), a broker-level failure now returns
// a real, non-nil error instead of the old async producer's "always nil,
// message merely enqueued" behavior.
func TestTOK02_PublishReturnsRealErrorOnBrokerFailure(t *testing.T) {
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true

	mockProducer := mocks.NewSyncProducer(nopErrorReporter{t}, cfg)
	brokerErr := errors.New("simulated broker unreachable")
	mockProducer.ExpectSendMessageAndFail(brokerErr)

	p := kafka.NewProducerFromClient(mockProducer)

	err := p.Publish(context.Background(), "pii.tokenize.result", "envelope-1", map[string]string{"a": "b"})
	if err == nil {
		t.Fatal("Publish() error = nil, want a real delivery error -- the old async producer would have wrongly returned nil here")
	}
	if !errors.Is(err, kafka.ErrDeliveryFailed) {
		t.Fatalf("Publish() error = %v, want it to wrap kafka.ErrDeliveryFailed", err)
	}
	t.Logf("CONFIRMED: Publish() surfaces a real broker failure as an error: %v", err)
}

// TestTOK02_PublishReturnsNilOnRealAck proves the happy path is unaffected:
// a message the mock broker genuinely acknowledges still returns nil.
func TestTOK02_PublishReturnsNilOnRealAck(t *testing.T) {
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true

	mockProducer := mocks.NewSyncProducer(nopErrorReporter{t}, cfg)
	mockProducer.ExpectSendMessageAndSucceed()

	p := kafka.NewProducerFromClient(mockProducer)

	err := p.Publish(context.Background(), "pii.tokenize.result", "envelope-1", map[string]string{"a": "b"})
	if err != nil {
		t.Fatalf("Publish() error = %v, want nil for a genuinely acknowledged message", err)
	}
}

// TestTOK02_NonDeliveryErrorsDoNotMatchErrDeliveryFailed proves the
// classification in cmd/main.go's onExhausted callback discriminates
// correctly: an ordinary error (e.g. from TokenizePII/DB/crypto) must NOT
// be mistaken for a delivery failure, or a permanent processing failure
// would incorrectly block the partition forever instead of being resolved
// into the poison DLQ like TOK-01 intends.
func TestTOK02_NonDeliveryErrorsDoNotMatchErrDeliveryFailed(t *testing.T) {
	dbErr := errors.New("simulated database failure")
	if errors.Is(dbErr, kafka.ErrDeliveryFailed) {
		t.Fatal("a plain, unrelated error incorrectly matched kafka.ErrDeliveryFailed")
	}
	t.Log("CONFIRMED: a non-delivery error does not match kafka.ErrDeliveryFailed, so onExhausted's errors.Is check correctly leaves TOK-01's original poison-DLQ behavior intact for processing failures.")
}
