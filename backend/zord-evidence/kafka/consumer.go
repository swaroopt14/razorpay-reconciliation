package kafka

import (
	"context"
	"log"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// SaramaHeaderCarrier implements propagation.TextMapCarrier for Kafka headers.
// Enables extracting W3C traceparent from Kafka message headers for end-to-end tracing.
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

type MessageHandler func(ctx context.Context, key string, payload []byte) error

type Consumer struct {
	handler MessageHandler
}

func NewConsumer(handler MessageHandler) *Consumer {
	return &Consumer{handler: handler}
}

func (c *Consumer) Setup(sess sarama.ConsumerGroupSession) error {
	return nil
}

func (c *Consumer) Cleanup(sess sarama.ConsumerGroupSession) error {
	log.Printf("evidence.kafka.session_cleanup member_id=%s", sess.MemberID())
	return nil
}

func (c *Consumer) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	tracer := otel.Tracer("zord-evidence/consumer")

	for msg := range claim.Messages() {
		// Extract trace context from Kafka headers (W3C traceparent)
		carrier := SaramaHeaderCarrier(msg.Headers)
		ctx := otel.GetTextMapPropagator().Extract(sess.Context(), carrier)

		// Start a consumer span linked to the producer's trace
		ctx, span := tracer.Start(ctx, "consume."+msg.Topic,
			trace.WithSpanKind(trace.SpanKindConsumer),
			trace.WithAttributes(
				attribute.String("messaging.system", "kafka"),
				attribute.String("messaging.destination", msg.Topic),
				attribute.Int64("messaging.kafka.partition", int64(msg.Partition)),
				attribute.Int64("messaging.kafka.offset", msg.Offset),
				attribute.String("messaging.kafka.key", string(msg.Key)),
			),
		)

		log.Printf("evidence.kafka.message_received topic=%s partition=%d offset=%d key=%s payload_bytes=%d", msg.Topic, msg.Partition, msg.Offset, string(msg.Key), len(msg.Value))

		if err := c.handler(ctx, string(msg.Key), msg.Value); err != nil {
			span.RecordError(err)
			log.Printf("evidence.kafka.consume_error topic=%s partition=%d offset=%d err=%v", msg.Topic, msg.Partition, msg.Offset, err)
			span.End()
			continue
		}

		sess.MarkMessage(msg, "")
		log.Printf("evidence.kafka.message_committed topic=%s partition=%d offset=%d key=%s", msg.Topic, msg.Partition, msg.Offset, string(msg.Key))
		span.End()
	}
	return nil
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler MessageHandler) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	cfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()

	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return err
	}
	go func() {
		defer consumerGroup.Close()
		consumer := NewConsumer(handler)
		for {
			if err := consumerGroup.Consume(ctx, []string{topic}, consumer); err != nil {
				log.Printf("evidence.kafka.consume_loop_error err=%v", err)
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()
	return nil
}

func StartConsumerForTopics(ctx context.Context, brokers []string, groupID string, topics []string, handler MessageHandler) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	cfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()

	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return err
	}

	go func() {
		log.Printf("evidence.kafka.consumer_started group=%s topics=%v brokers=%v", groupID, topics, brokers)

		defer consumerGroup.Close()
		consumer := NewConsumer(handler)
		for {
			if err := consumerGroup.Consume(ctx, topics, consumer); err != nil {
				log.Printf("evidence.kafka.consume_loop_error topics=%v err=%v", topics, err)
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	return nil
}
