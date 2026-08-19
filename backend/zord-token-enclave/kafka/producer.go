package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/IBM/sarama"
)

// ErrDeliveryFailed wraps any error returned by Publish when the broker
// itself rejected or never acknowledged the message (as opposed to a
// local encoding error). TOK-02: callers use errors.Is(err,
// ErrDeliveryFailed) to distinguish "Kafka delivery failed" from other
// failure classes -- see cmd/main.go's onExhausted callback, which keeps
// a delivery failure redelivering indefinitely rather than treating it
// like a permanent processing failure.
var ErrDeliveryFailed = errors.New("kafka: result delivery failed")

type Producer struct {
	producer sarama.SyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {

	config := sarama.NewConfig()

	config.Version = sarama.V2_8_0_0

	// SASL/SCRAM-SHA-512 authentication (PLAT-06)
	ApplySASL(config)

	config.Producer.RequiredAcks = sarama.WaitForAll

	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1

	// TOK-02: this is deliberately small. The producer's own retry used to
	// be the only line of defense (10 attempts, 2s backoff -- up to ~20s
	// per Publish call) because Publish() never even returned an error a
	// caller could react to. Now that Publish() blocks and returns a real
	// error, kafka.WithRetryAndPoisonDLQ (TOK-01) is the real resilience
	// layer -- 5 attempts, ~31s worst case. This inner retry only needs to
	// absorb a single transient blip so the two layers don't compound into
	// minutes of blocking for one message.
	config.Producer.Retry.Max = 3
	config.Producer.Retry.Backoff = 500 * time.Millisecond

	// Batch
	config.Producer.Flush.Bytes = 1_000_000
	config.Producer.Flush.Messages = 100
	config.Producer.Flush.Frequency = 5 * time.Millisecond

	// Compression
	config.Producer.Compression = sarama.CompressionSnappy

	// TOK-02: SyncProducer requires Return.Successes = true -- Publish now
	// blocks on SendMessage and returns its real result instead of firing
	// into an async channel and returning nil the instant the message is
	// merely queued.
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true

	producer, err := sarama.NewSyncProducer(brokers, config)
	if err != nil {
		return nil, err
	}

	return &Producer{producer: producer}, nil
}

// NewProducerFromClient wraps an existing sarama.SyncProducer -- exported
// so testing/audittests can inject a real production Producer backed by
// sarama/mocks (a broker-error test with no live Kafka needed) rather than
// a reimplementation of Publish's logic.
func NewProducerFromClient(p sarama.SyncProducer) *Producer {
	return &Producer{producer: p}
}

// Publish blocks until the broker acknowledges the message (or the
// producer's own small retry budget is exhausted) and returns the real
// delivery result -- never a false "success" for a message that was only
// enqueued locally. On failure, the returned error wraps ErrDeliveryFailed.
func (p *Producer) Publish(
	ctx context.Context,
	topic string,
	key string,
	event interface{},
) error {

	if err := ctx.Err(); err != nil {
		return err
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(payload),
	}

	if _, _, err := p.producer.SendMessage(msg); err != nil {
		return fmt.Errorf("%w: %v", ErrDeliveryFailed, err)
	}
	return nil
}

// Close releases the underlying producer's connections. Safe to call once
// during shutdown.
func (p *Producer) Close() error {
	return p.producer.Close()
}
