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

const (
	VectorIndexRequestTopic = "zord.vector.index.request.v1"

	VectorIndexEventRequested = "vector.index.requested"

	VectorIndexOperationUpsert = "upsert"
	VectorIndexOperationDelete = "delete"
)

type VectorIndexRequestEvent struct {
	EventID         string            `json:"event_id"`
	SchemaVersion   string            `json:"schema_version"`
	EventType       string            `json:"event_type"`
	SourceService   string            `json:"source_service"`
	SourceEventType string            `json:"source_event_type"`
	TenantID        string            `json:"tenant_id"`
	EntityType      string            `json:"entity_type"`
	EntityID        string            `json:"entity_id"`
	BatchID         string            `json:"batch_id,omitempty"`
	Operation       string            `json:"operation"`
	OccurredAt      time.Time         `json:"occurred_at"`
	ContentVersion  string            `json:"content_version,omitempty"`
	Metadata        map[string]string `json:"metadata,omitempty"`
}

func NewProducer(brokers []string) (*Producer, error) {

	config := sarama.NewConfig()

	config.Version = sarama.V2_8_0_0

	// SASL/SCRAM-SHA-512 authentication (PLAT-06)
	ApplySASL(config)

	config.Producer.RequiredAcks = sarama.WaitForAll

	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1

	// Retry Settings
	config.Producer.Retry.Max = 10
	config.Producer.Retry.Backoff = 2 * time.Second

	// Batch Settings
	config.Producer.Flush.Bytes = 1_000_000
	config.Producer.Flush.Messages = 100
	config.Producer.Flush.Frequency = 5 * time.Millisecond

	// Compression
	config.Producer.Compression = sarama.CompressionSnappy

	config.Producer.Return.Successes = false
	config.Producer.Return.Errors = true

	var producer sarama.AsyncProducer
	var err error

	for i := 0; i < 30; i++ {
		producer, err = sarama.NewAsyncProducer(brokers, config)
		if err == nil {
			break
		}

		log.Printf("Kafka producer retry %d/30: %v", i+1, err)
		time.Sleep(2 * time.Second)
	}

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

func (p *Producer) Publish(ctx context.Context, topic string, key string, event interface{}) error {

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
func (p *Producer) PublishVectorIndexRequest(ctx context.Context, event VectorIndexRequestEvent) error {
	return p.Publish(ctx, VectorIndexRequestTopic, event.TenantID, event)
}
func (p *Producer) Close() error {

	if p == nil || p.producer == nil {
		return nil
	}

	p.producer.AsyncClose()

	log.Println("Kafka producer shutdown initiated")

	return nil
}
