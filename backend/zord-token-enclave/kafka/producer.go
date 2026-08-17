package kafka

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/IBM/sarama"
)

type Producer struct {
	producer sarama.AsyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {

	config := sarama.NewConfig()

	config.Version = sarama.V2_8_0_0

	// SASL/SCRAM-SHA-512 authentication (PLAT-06)
	ApplySASL(config)

	config.Producer.RequiredAcks = sarama.WaitForAll

	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1

	// Retry
	config.Producer.Retry.Max = 10
	config.Producer.Retry.Backoff = 2 * time.Second

	// Batch
	config.Producer.Flush.Bytes = 1_000_000
	config.Producer.Flush.Messages = 100
	config.Producer.Flush.Frequency = 5 * time.Millisecond

	// Compression
	config.Producer.Compression = sarama.CompressionSnappy

	config.Producer.Return.Successes = false
	config.Producer.Return.Errors = true

	producer, err := sarama.NewAsyncProducer(brokers, config)
	if err != nil {
		return nil, err
	}

	p := &Producer{producer: producer}

	go func() {
		for err := range producer.Errors() {
			log.Printf("Kafka async error: %v", err)
		}
	}()

	return p, nil
}

func (p *Producer) Publish(
	ctx context.Context,
	topic string,
	key string,
	event interface{},
) error {

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(payload),
	}

	select {

	case p.producer.Input() <- msg:
		return nil

	case <-ctx.Done():
		return ctx.Err()
	}
}
