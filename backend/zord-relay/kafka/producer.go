package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
)

// Producer wraps a Sarama SyncProducer.
type Producer struct {
	p sarama.SyncProducer
}

func NewProducer(brokers []string) *Producer {
	cfg := sarama.NewConfig()
	cfg.Producer.RequiredAcks = sarama.WaitForAll
	cfg.Producer.Idempotent = true
	cfg.Net.MaxOpenRequests = 1
	cfg.Producer.Retry.Max = 5
	cfg.Producer.Retry.Backoff = 200 * time.Millisecond
	cfg.Producer.Return.Successes = true
	cfg.Version = sarama.V2_8_0_0

	var (
		p   sarama.SyncProducer
		err error
	)
	for attempt := 1; attempt <= 10; attempt++ {
		p, err = sarama.NewSyncProducer(brokers, cfg)
		if err == nil {
			log.Printf("kafka: producer connected (attempt %d)", attempt)
			return &Producer{p: p}
		}
		log.Printf("kafka: producer connect failed (attempt %d/10): %v — retrying in 2s", attempt, err)
		time.Sleep(2 * time.Second)
	}
	log.Fatalf("kafka: failed to create producer after 10 attempts: %v", err)
	return nil
}

func (p *Producer) Publish(topic, key string, value interface{}, headers map[string]string) error {
	var body []byte
	switch v := value.(type) {
	case []byte:
		body = v
	case json.RawMessage:
		body = v
	default:
		var err error
		body, err = json.Marshal(v)
		if err != nil {
			return fmt.Errorf("kafka: marshal failed: %w", err)
		}
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(body),
	}

	for k, v := range headers {
		msg.Headers = append(msg.Headers, sarama.RecordHeader{
			Key:   []byte(k),
			Value: []byte(v),
		})
	}

	_, _, err := p.p.SendMessage(msg)
	if err != nil {
		return fmt.Errorf("kafka: send failed: %w", err)
	}
	return nil
}

func (p *Producer) InternalProducer() sarama.SyncProducer {
	return p.p
}

func (p *Producer) Close() error {
	return p.p.Close()
}
