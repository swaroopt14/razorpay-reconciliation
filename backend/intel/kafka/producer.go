package kafka

// What is this file?
// ZPI's "mouth" — sends actuation messages to Kafka.
// ONLY called by internal/worker/outbox_worker.go
// ONLY sends to 3 topics (actuation only — NOT for sending KPI data)
//
// WHO CALLS THIS FILE?
//   outbox_worker.go → producer.Publish(topic, key, payload)
//
// WHAT DOES IT CALL?
//   Nothing. It just writes to Kafka and returns.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
)

// Producer wraps kafka-go's Writer.
// We wrap it so the rest of the code doesn't need to know about kafka-go directly.
// They just call producer.Publish() and we handle the details.
type Producer struct {
	writer *kafka.Writer
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

// NewProducer creates a Kafka producer connected to the given broker.
//
// Called once from cmd/main.go:
//
//	producer := kafka.NewProducer(cfg.KafkaBrokers)
//	defer producer.Close()
func NewProducer(brokers string) *Producer {
	brokerList := strings.Split(brokers, ",")
	for i := range brokerList {
		brokerList[i] = strings.TrimSpace(brokerList[i])
	}
	writer := &kafka.Writer{
		// Addr is the Kafka broker address
		Addr: kafka.TCP(brokerList...),

		// Balancer decides which partition a message goes to.
		// LeastBytes sends to the partition with the fewest recent bytes.
		// For ZPI, we use the tenant_id as the message Key (set in Publish below),
		// so all messages for the same tenant go to the same partition.
		// This ensures ordering of events per tenant.
		Balancer: &kafka.LeastBytes{},

		// RequiredAcks: wait for ALL in-sync replicas to confirm the write.
		// Slower but guarantees the message is not lost if one broker fails.
		// For financial intelligence events, we always use this.
		RequiredAcks: kafka.RequireAll,

		// Async false = synchronous writes.
		// We wait for broker acknowledgment before returning.
		// If the write fails, we get an error we can handle.
		Async: false,
	}

	// SASL/SCRAM-SHA-512 authentication (PLAT-06). NewSASLTransport returns a
	// nil *kafka.Transport when no SASL credentials are configured. Writer.Transport
	// is declared as the RoundTripper interface, so assigning a nil *kafka.Transport
	// to it directly (rather than leaving the field untouched) would wrap a nil
	// pointer in a non-nil interface value — kafka-go's own "is Transport unset?"
	// check (`if w.Transport != nil`) would then see a non-nil interface and try to
	// use it, panicking on first write. Only assign when there's a real transport.
	if transport := NewSASLTransport(); transport != nil {
		writer.Transport = transport
	}

	return &Producer{writer: writer}
}

// Publish sends a message to a Kafka topic.
//
// PARAMETERS:
//
//	ctx     → context for cancellation
//	topic   → which Kafka topic to publish to
//	key     → partition key (use tenant_id for consistent ordering)
//	payload → any Go struct — will be marshaled to JSON automatically
//
// EXAMPLE CALL from outbox_worker.go:
//
//	err := producer.Publish(ctx, cfg.TopicActuationAlert, tenantID, alertPayload)
func (p *Producer) Publish(ctx context.Context, topic, key string, payload any) error {

	// json.Marshal converts any Go struct to JSON bytes
	// "any" is Go's way of saying "any type" (like Object in Java)
	value, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("producer: failed to marshal payload for topic=%s: %w", topic, err)
	}

	// Write the message to Kafka
	err = p.writer.WriteMessages(ctx,
		kafka.Message{
			Topic: topic,
			Key:   []byte(key), // tenant_id as bytes — used for partition routing
			Value: value,       // JSON payload as bytes
		},
	)
	if err != nil {
		return fmt.Errorf("producer: failed to write to topic=%s: %w", topic, err)
	}

	log.Printf("kafka: published to topic=%s key=%s bytes=%d", topic, key, len(value))
	return nil
}

func (p *Producer) PublishVectorIndexRequest(ctx context.Context, event VectorIndexRequestEvent) error {
	return p.Publish(ctx, VectorIndexRequestTopic, event.TenantID, event)
}

// Close flushes any pending messages and closes the connection.
// Call this during service shutdown.
//
// In main.go:
//
//	defer producer.Close()
func (p *Producer) Close() error {
	if err := p.writer.Close(); err != nil {
		return fmt.Errorf("producer: close error: %w", err)
	}
	return nil
}
