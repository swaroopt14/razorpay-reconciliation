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

type Consumer struct {
	ready   chan bool
	handler func([]byte) error
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler func([]byte) error) error {
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
		ready:   make(chan bool),
		handler: handler,
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

func (c *Consumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	tracer := otel.Tracer("zord-outcome-engine/consumer")

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

		err := c.handler(msg.Value)
		if err != nil {
			span.RecordError(err)
			log.Printf("Handler error: %v", err)
			span.End()
			continue
		}

		session.MarkMessage(msg, "")
		span.End()
	}
	return nil
}
