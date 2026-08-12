package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/IBM/sarama"
)

// EventType constants for Service 6 evidence life-cycle events (spec §13 step 11).
const (
	TopicEvidencePack = "evidence.packs"

	EventPackCreated          = "evidence.pack.created"
	EventPackUpdated          = "evidence.pack.updated"
	EventPackReplayed         = "evidence.pack.replayed"
	EventPackReversalSupersed = "evidence.pack.reversal_superseded"
)

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

// PackEvent is the envelope published to evidence.packs topic.
type PackEvent struct {
	EventType string `json:"event_type"`
	// EventVersion / SchemaVersion are mapped from the pack's own upstream-
	// sourced items (see packEnvelopeVersions in services/evidence_service.go)
	// rather than hardcoded here.
	EventVersion   string    `json:"event_version,omitempty"`
	SchemaVersion  string    `json:"schema_version,omitempty"`
	EvidencePackID string    `json:"evidence_pack_id"`
	TenantID       string    `json:"tenant_id"`
	BatchID        string    `json:"batch_id,omitempty"`
	IntentID       string    `json:"intent_id,omitempty"`
	ContractID     string    `json:"contract_id,omitempty"`
	Mode           string    `json:"mode"`
	MerkleRoot     string    `json:"merkle_root"`
	RulesetVersion string    `json:"ruleset_version"`
	OccurredAt     time.Time `json:"occurred_at"`
	PackCompletenessScore float64 `json:"pack_completeness_score"`
	LeafCount int `json:"leaf_count"`
	RequiredLeafCount int `json:"required_leaf_count"`
	SettlementLeafPresentFlag bool `json:"settlement_leaf_present_flag"`
	AttachmentDecisionLeafPresentFlag bool `json:"attachment_decision_leaf_present_flag"`
	// Extra metadata for specific event types.
	Extra map[string]any `json:"extra,omitempty"`
}

// Publisher is a synchronous Kafka producer for evidence pack events.
type Publisher struct {
	producer sarama.SyncProducer
	topic    string
}

func NewPublisher(brokers []string, topic string) (*Publisher, error) {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Producer.RequiredAcks = sarama.WaitForAll
	cfg.Producer.Retry.Max = 3
	cfg.Producer.Return.Successes = true

	p, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("kafka producer init: %w", err)
	}
	return &Publisher{producer: p, topic: topic}, nil
}

func (p *Publisher) Close() {
	_ = p.producer.Close()
}

// Publish encodes PackEvent as JSON and sends it to the evidence.packs topic.
// The key is tenant_id/evidence_pack_id for partition affinity.
func (p *Publisher) Publish(_ context.Context, evt PackEvent) error {
	body, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal pack event: %w", err)
	}
	key := fmt.Sprintf("%s/%s", evt.TenantID, evt.EvidencePackID)
	msg := &sarama.ProducerMessage{
		Topic: p.topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(body),
	}
	_, _, err = p.producer.SendMessage(msg)
	return err
}

func (p *Publisher) PublishVectorIndexRequest(_ context.Context, event VectorIndexRequestEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal vector index event: %w", err)
	}

	msg := &sarama.ProducerMessage{
		Topic: VectorIndexRequestTopic,
		Key:   sarama.StringEncoder(event.TenantID),
		Value: sarama.ByteEncoder(body),
	}
	_, _, err = p.producer.SendMessage(msg)
	return err
}

// NoopPublisher satisfies the Publisher interface for local/dev environments.
type NoopPublisher struct{}

func (NoopPublisher) Publish(_ context.Context, _ PackEvent) error { return nil }
func (NoopPublisher) Close()                                        {}

// EventPublisher is the interface the service layer depends on.
type EventPublisher interface {
	Publish(ctx context.Context, evt PackEvent) error
	Close()
}
