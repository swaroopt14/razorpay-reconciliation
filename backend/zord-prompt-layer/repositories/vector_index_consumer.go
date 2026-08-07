package repositories

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/IBM/sarama"
)

const (
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
type VectorIndexDeferredError struct {
	Reason      string
	NextRetryAt time.Time
	Cause       error
}

func (e VectorIndexDeferredError) Error() string {
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return e.Reason
}

func IsVectorIndexDeferredError(err error) bool {
	_, ok := err.(VectorIndexDeferredError)
	return ok
}

type VectorIndexEventHandler interface {
	HandleVectorIndexRequest(ctx context.Context, event VectorIndexRequestEvent) error
}

type VectorIndexEventHandlerFunc func(ctx context.Context, event VectorIndexRequestEvent) error

func (f VectorIndexEventHandlerFunc) HandleVectorIndexRequest(ctx context.Context, event VectorIndexRequestEvent) error {
	return f(ctx, event)
}

type VectorIndexConsumerConfig struct {
	Brokers    []string
	Topic      string
	GroupID    string
	MaxRetries int
}

type VectorIndexConsumer struct {
	cfg     VectorIndexConsumerConfig
	handler VectorIndexEventHandler
}

func NewVectorIndexConsumer(cfg VectorIndexConsumerConfig, handler VectorIndexEventHandler) *VectorIndexConsumer {
	cfg.Topic = strings.TrimSpace(cfg.Topic)
	cfg.GroupID = strings.TrimSpace(cfg.GroupID)

	brokers := make([]string, 0, len(cfg.Brokers))
	for _, broker := range cfg.Brokers {
		b := strings.TrimSpace(broker)
		if b != "" {
			brokers = append(brokers, b)
		}
	}
	cfg.Brokers = brokers

	if cfg.MaxRetries < 0 {
		cfg.MaxRetries = 0
	}

	return &VectorIndexConsumer{
		cfg:     cfg,
		handler: handler,
	}
}

func (c *VectorIndexConsumer) Start(ctx context.Context) {
	if c == nil {
		log.Printf("[prompt-layer][vector-consumer] not started: consumer is nil")
		return
	}
	if len(c.cfg.Brokers) == 0 || c.cfg.Topic == "" || c.cfg.GroupID == "" {
		log.Printf("[prompt-layer][vector-consumer] kafka config missing; brokers=%d topic=%q group=%q", len(c.cfg.Brokers), c.cfg.Topic, c.cfg.GroupID)
		return
	}
	if c.handler == nil {
		log.Printf("[prompt-layer][vector-consumer] not started: handler is nil")
		return
	}

	go c.run(ctx)
}

func (c *VectorIndexConsumer) run(ctx context.Context) {
	kafkaCfg := sarama.NewConfig()
	kafkaCfg.Version = sarama.V2_8_0_0
	kafkaCfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRange()
	kafkaCfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	kafkaCfg.Consumer.Return.Errors = true

	group, err := sarama.NewConsumerGroup(c.cfg.Brokers, c.cfg.GroupID, kafkaCfg)
	if err != nil {
		log.Printf("[prompt-layer][vector-consumer] failed creating consumer group brokers=%s group=%s err=%v", strings.Join(c.cfg.Brokers, ","), c.cfg.GroupID, err)
		return
	}
	defer group.Close()

	handler := &vectorIndexConsumerGroupHandler{
		handler:    c.handler,
		maxRetries: c.cfg.MaxRetries,
	}

	log.Printf("[prompt-layer][vector-consumer] started topic=%s group=%s brokers=%s", c.cfg.Topic, c.cfg.GroupID, strings.Join(c.cfg.Brokers, ","))

	go func() {
		for err := range group.Errors() {
			log.Printf("[prompt-layer][vector-consumer] kafka group error topic=%s group=%s err=%v", c.cfg.Topic, c.cfg.GroupID, err)
		}
	}()

	for {
		if err := group.Consume(ctx, []string{c.cfg.Topic}, handler); err != nil {
			log.Printf("[prompt-layer][vector-consumer] consume error topic=%s group=%s err=%v", c.cfg.Topic, c.cfg.GroupID, err)
			time.Sleep(2 * time.Second)
		}

		if ctx.Err() != nil {
			log.Printf("[prompt-layer][vector-consumer] stopped topic=%s group=%s", c.cfg.Topic, c.cfg.GroupID)
			return
		}
	}
}

type vectorIndexConsumerGroupHandler struct {
	handler    VectorIndexEventHandler
	maxRetries int
}

func (h *vectorIndexConsumerGroupHandler) Setup(_ sarama.ConsumerGroupSession) error {
	return nil
}

func (h *vectorIndexConsumerGroupHandler) Cleanup(_ sarama.ConsumerGroupSession) error {
	return nil
}

func (h *vectorIndexConsumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		event, err := decodeVectorIndexRequestEvent(msg.Value)
		if err != nil {
			log.Printf("[prompt-layer][vector-consumer] invalid event topic=%s partition=%d offset=%d err=%v", msg.Topic, msg.Partition, msg.Offset, err)
			session.MarkMessage(msg, "")
			continue
		}

		if err := validateVectorIndexRequestEvent(event); err != nil {
			log.Printf("[prompt-layer][vector-consumer] rejected event_id=%s tenant=%s entity=%s err=%v", event.EventID, event.TenantID, event.EntityType, err)
			session.MarkMessage(msg, "")
			continue
		}

		var lastErr error
		for attempt := 1; attempt <= h.maxRetries+1; attempt++ {
			start := time.Now()
			lastErr = h.handler.HandleVectorIndexRequest(session.Context(), event)
			if lastErr == nil {
				log.Printf(
					"[prompt-layer][vector-consumer] processed event_id=%s tenant=%s source=%s entity=%s operation=%s attempt=%d duration_ms=%d",
					event.EventID,
					event.TenantID,
					event.SourceService,
					event.EntityType,
					event.Operation,
					attempt,
					time.Since(start).Milliseconds(),
				)
				session.MarkMessage(msg, "")
				break
			}

			if IsVectorIndexDeferredError(lastErr) {
				log.Printf(
					"[prompt-layer][vector-consumer] deferred event_id=%s tenant=%s entity=%s operation=%s attempt=%d err=%v",
					event.EventID,
					event.TenantID,
					event.EntityType,
					event.Operation,
					attempt,
					lastErr,
				)
				session.MarkMessage(msg, "")
				lastErr = nil
				break
			}

			log.Printf(
				"[prompt-layer][vector-consumer] handler failed event_id=%s tenant=%s entity=%s operation=%s attempt=%d err=%v",
				event.EventID,
				event.TenantID,
				event.EntityType,
				event.Operation,
				attempt,
				lastErr,
			)

			if attempt <= h.maxRetries {
				time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
			}
		}

		if lastErr != nil {
			log.Printf("[prompt-layer][vector-consumer] event left uncommitted event_id=%s tenant=%s err=%v", event.EventID, event.TenantID, lastErr)
			return lastErr
		}
	}

	return nil
}

func decodeVectorIndexRequestEvent(raw []byte) (VectorIndexRequestEvent, error) {
	var event VectorIndexRequestEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		return event, fmt.Errorf("decode vector index request: %w", err)
	}
	return event, nil
}

func validateVectorIndexRequestEvent(event VectorIndexRequestEvent) error {
	if strings.TrimSpace(event.EventID) == "" {
		return fmt.Errorf("missing event_id")
	}
	if strings.TrimSpace(event.EventType) != VectorIndexEventRequested {
		return fmt.Errorf("unsupported event_type=%q", event.EventType)
	}
	if strings.TrimSpace(event.TenantID) == "" || !uuidRegex.MatchString(strings.TrimSpace(event.TenantID)) {
		return fmt.Errorf("invalid tenant_id")
	}
	if strings.TrimSpace(event.SourceService) == "" {
		return fmt.Errorf("missing source_service")
	}
	if strings.TrimSpace(event.EntityType) == "" {
		return fmt.Errorf("missing entity_type")
	}
	if strings.TrimSpace(event.EntityID) == "" {
		return fmt.Errorf("missing entity_id")
	}

	op := strings.TrimSpace(event.Operation)
	if op == "" {
		return fmt.Errorf("missing operation")
	}
	if op != VectorIndexOperationUpsert && op != VectorIndexOperationDelete {
		return fmt.Errorf("unsupported operation=%q", op)
	}

	return nil
}
