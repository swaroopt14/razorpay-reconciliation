package kafka

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// SaramaHeaderCarrier implements propagation.TextMapCarrier for Kafka headers.
// This enables extracting W3C traceparent from Kafka message headers
// so that consumer spans are linked to the producer's trace (end-to-end tracing).
type SaramaHeaderCarrier []*sarama.RecordHeader

func (c SaramaHeaderCarrier) Get(key string) string {
	for _, h := range c {
		if string(h.Key) == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c SaramaHeaderCarrier) Set(key string, value string) {}

func (c SaramaHeaderCarrier) Keys() []string {
	keys := make([]string, len(c))
	for i, h := range c {
		keys[i] = string(h.Key)
	}
	return keys
}

// PermanentFailure carries everything about a Kafka message whose handler
// exhausted every retry attempt — the raw materials a durable failure
// ledger needs (OUT-02). This package stays decoupled from any specific
// payload schema or persistence mechanism: it hands the caller Kafka-level
// facts (topic/partition/offset/headers/value) plus the handler's own
// verdict (attempts, last error) and lets the caller's FailureRecorder do
// the payload parsing and durable write.
type PermanentFailure struct {
	Topic     string
	Partition int32
	Offset    int64
	Key       []byte
	Value     []byte
	Headers   []*sarama.RecordHeader
	Attempts  int
	LastError error
}

// FailureRecorder durably persists a PermanentFailure before the source
// Kafka offset is allowed to advance past it. A non-nil return means the
// write did not succeed and the message must NOT be marked — see
// ConsumeClaim, which stops consuming (ending the session, forcing a
// rejoin) rather than advancing on a failed write.
type FailureRecorder func(ctx context.Context, f PermanentFailure) error

// Consumer implements sarama.ConsumerGroupHandler. Exported fields exist so
// testing/audittests can construct one directly against a fake session/claim
// and exercise the real production ConsumeClaim logic — not a reimplementation.
type Consumer struct {
	ready              chan bool
	Handler            func([]byte) error
	OnPermanentFailure FailureRecorder
	// Sleep, if non-nil, replaces time.Sleep between in-place retries.
	// Tests inject a no-op so the acceptance suite does not wait on backoff.
	Sleep func(time.Duration)
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler func([]byte) error, onPermanentFailure FailureRecorder) error {
	if onPermanentFailure == nil {
		return errors.New("kafka.StartConsumer: onPermanentFailure is required ")
	}

	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0

	//Consumer Group Setting
	config.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{
		sarama.NewBalanceStrategyRange(),
	}
	config.Consumer.Offsets.Initial = sarama.OffsetOldest
	config.Consumer.Offsets.AutoCommit.Enable = true

	group, err := sarama.NewConsumerGroup(brokers, groupID, config)
	if err != nil {
		return err
	}

	consumer := &Consumer{
		ready:              make(chan bool),
		Handler:            handler,
		OnPermanentFailure: onPermanentFailure,
	}

	go func() {
		defer group.Close()
		for {
			if ctx.Err() != nil {
				return
			}
			err := group.Consume(ctx, []string{topic}, consumer)
			if err != nil {
				log.Printf("Kafka consume error: %v", err)
			}
			consumer.ready = make(chan bool)
		}
	}()
	<-consumer.ready

	log.Println("Kafka consumer is ready")

	return nil
}

func (c *Consumer) Setup(sarama.ConsumerGroupSession) error {
	close(c.ready)
	return nil
}

func (c *Consumer) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// MaxHandlerAttempts and handlerRetryBaseDelay bound the in-place retry below.
// OUT-02: with AutoCommit enabled, sarama commits the highest *marked* offset
// per partition on its own schedule. ConsumeClaim previously skipped marking a
// failed message but kept consuming later ones, so a later message's mark would
// silently carry the committed offset past the earlier failed one — permanently
// losing it with zero retries, since Kafka offsets are a single forward-moving
// pointer, not a per-message ledger.
//
// Retrying the same message here, in place, before ever moving on to the next
// one, means no later mark can ever advance past an unresolved earlier message.
// A message that still fails after all attempts is not marked unconditionally:
// it is durably recorded first (see FailureRecorder). Only a successful durable
// write earns the mark. If the durable write itself fails, ConsumeClaim stops
// (returns an error, ending this session) rather than advancing past a failure
// nobody can find later.
const (
	MaxHandlerAttempts    = 5
	handlerRetryBaseDelay = 200 * time.Millisecond
)

// callWithRetry invokes handler(payload) up to MaxHandlerAttempts times,
// sleeping sleepFn between attempts, and returns the last error (nil if any
// attempt succeeded). Factored out of ConsumeClaim so the retry/backoff
// behavior is unit-testable without mocking Sarama's consumer-group types.
func callWithRetry(handler func([]byte) error, payload []byte, logPrefix string, sleepFn func(time.Duration)) error {
	var err error
	for attempt := 1; attempt <= MaxHandlerAttempts; attempt++ {
		err = handler(payload)
		if err == nil {
			return nil
		}
		log.Printf("%s handler error (attempt %d/%d): %v", logPrefix, attempt, MaxHandlerAttempts, err)
		if attempt < MaxHandlerAttempts {
			sleepFn(handlerRetryBaseDelay * time.Duration(1<<uint(attempt-1)))
		}
	}
	return err
}

func (c *Consumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	tracer := otel.Tracer("zord-outcome-engine/consumer")
	sleepFn := c.Sleep
	if sleepFn == nil {
		sleepFn = time.Sleep
	}

	for msg := range claim.Messages() {
		// Extract trace context from Kafka headers (W3C traceparent)
		carrier := SaramaHeaderCarrier(msg.Headers)
		ctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)

		// Start a consumer span linked to the producer's trace
		ctx, span := tracer.Start(ctx, "consume."+msg.Topic,
			trace.WithSpanKind(trace.SpanKindConsumer),
			trace.WithAttributes(
				attribute.String("messaging.system", "kafka"),
				attribute.String("messaging.destination", msg.Topic),
				attribute.Int64("messaging.kafka.partition", int64(msg.Partition)),
				attribute.Int64("messaging.kafka.offset", msg.Offset),
			),
		)

		logPrefix := fmt.Sprintf("partition=%d offset=%d", msg.Partition, msg.Offset)
		err := callWithRetry(c.Handler, msg.Value, logPrefix, sleepFn)
		if err == nil {
			session.MarkMessage(msg, "")
			span.End()
			continue
		}

		span.RecordError(err)
		log.Printf("Handler permanently failed after %d attempts %s — recording durable failure before marking: %v",
			MaxHandlerAttempts, logPrefix, err)

		if c.OnPermanentFailure == nil {
			span.End()
			log.Printf("No durable failure recorder configured %s — stopping this partition's consumption without marking", logPrefix)
			return fmt.Errorf("durable failure recording unavailable, refusing to advance offset: %w", err)
		}

		recErr := c.OnPermanentFailure(session.Context(), PermanentFailure{
			Topic:     msg.Topic,
			Partition: msg.Partition,
			Offset:    msg.Offset,
			Key:       msg.Key,
			Value:     msg.Value,
			Headers:   msg.Headers,
			Attempts:  MaxHandlerAttempts,
			LastError: err,
		})
		if recErr != nil {
			// Do NOT mark. Ending the session here (returning an error)
			// forces a rejoin; consumption resumes from the last marked
			// offset, so this same message is redelivered and retried
			// rather than silently advanced past — OUT-02: never skip a
			// failed message just because a later one succeeded.
			span.RecordError(recErr)
			span.End()
			log.Printf("Failed to durably record permanent failure %s — stopping this partition's consumption without marking: %v",
				logPrefix, recErr)
			return fmt.Errorf("durable failure recording failed, refusing to advance offset: %w", recErr)
		}

		session.MarkMessage(msg, "")
		span.End()
	}
	return nil
}
