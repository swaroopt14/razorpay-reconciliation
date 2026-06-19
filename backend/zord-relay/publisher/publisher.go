package publisher

import (
	"context"

	"zord-relay/model"
)

// Publisher is the interface that both the real Kafka publisher and
// any test doubles must satisfy.
type Publisher interface {
	// Publish sends a single event to its target Kafka topic.
	// Returns an error on failure. The caller is responsible for retry logic.
	Publish(ctx context.Context, event *model.OutboxEvent, topic string) error

	// PublishDLQItem sends a single DLQItemEvent to its target Kafka topic.
	PublishDLQItem(ctx context.Context, event *model.DLQItemEvent, topic string) error

	// PublishBatchCompleted sends a single BatchCanonicalizationCompletedEvent to its target Kafka topic.
	PublishBatchCompleted(ctx context.Context, event *model.BatchCanonicalizationCompletedEvent, topic string) error

	// PublishDLQ sends a DLQMessage to the appropriate DLQ topic.
	// dlqType must be either DLQTypePublishFailure or DLQTypePoison.
	PublishDLQ(ctx context.Context, msg *model.DLQMessage, dlqType DLQType) error

	// Close flushes in-flight messages and shuts the producer down cleanly.
	Close() error
}

// DLQType distinguishes the two DLQ streams.
type DLQType string

const (
	DLQTypePublishFailure DLQType = "publish_failure"
	DLQTypePoison         DLQType = "poison"
)
