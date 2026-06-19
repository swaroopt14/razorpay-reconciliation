package publisher

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/model"
)

type otelHeaderCarrier struct {
	headers *[]sarama.RecordHeader
}

func (c otelHeaderCarrier) Get(key string) string {
	for _, h := range *c.headers {
		if string(h.Key) == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c otelHeaderCarrier) Set(key string, value string) {
	*c.headers = append(*c.headers, sarama.RecordHeader{Key: []byte(key), Value: []byte(value)})
}

func (c otelHeaderCarrier) Keys() []string {
	keys := make([]string, len(*c.headers))
	for i, h := range *c.headers {
		keys[i] = string(h.Key)
	}
	return keys
}

type KafkaPublisher struct {
	producer          sarama.SyncProducer
	dlqPublishFailure string
	dlqPoison          string
	log               *zap.Logger
	tracer            trace.Tracer
}

func NewKafkaPublisher(cfg config.KafkaConfig, log *zap.Logger) (*KafkaPublisher, error) {
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true

	// Compression
	switch cfg.CompressionType {
	case "snappy":
		config.Producer.Compression = sarama.CompressionSnappy
	case "lz4":
		config.Producer.Compression = sarama.CompressionLZ4
	case "zstd":
		config.Producer.Compression = sarama.CompressionZSTD
	case "gzip":
		config.Producer.Compression = sarama.CompressionGZIP
	}

	brokers := stringsToSlice(cfg.Brokers)
	var producer sarama.SyncProducer
	var err error
	for i := 0; i < 10; i++ {
		producer, err = sarama.NewSyncProducer(brokers, config)
		if err == nil {
			break
		}
		log.Warn("failed to create sarama sync producer, retrying...", zap.Error(err))
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		return nil, fmt.Errorf("creating kafka producer: %w", err)
	}

	return &KafkaPublisher{
		producer:          producer,
		dlqPublishFailure: cfg.DLQPublishFailureTopic,
		dlqPoison:         cfg.DLQPoisonTopic,
		log:               log.With(zap.String("component", "kafka_publisher")),
		tracer:            otel.Tracer("zord-relay/publisher"),
	}, nil
}

func (p *KafkaPublisher) Publish(ctx context.Context, event *model.OutboxEvent, topic string) error {
	ctx, span := p.tracer.Start(ctx, "kafka.publish",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "kafka"),
			attribute.String("messaging.destination", topic),
			attribute.String("event.id", event.EventID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	defer span.End()

	payload, err := json.Marshal(event)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "event marshal failed")
		return poisonError(fmt.Errorf("marshalling event: %w", err))
	}

	if len(payload) > 1*1024*1024 {
		err := poisonError(fmt.Errorf("event size %d bytes exceeds 1MiB limit", len(payload)))
		span.RecordError(err)
		span.SetStatus(codes.Error, "message too large")
		return err
	}

	headers := p.buildHeaders(ctx, event)

	msg := &sarama.ProducerMessage{
		Topic:   topic,
		Key:     sarama.StringEncoder(event.EventID),
		Value:   sarama.ByteEncoder(payload),
		Headers: headers,
	}

	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "produce failed")
		return fmt.Errorf("kafka delivery failed: %w", err)
	}

	span.SetAttributes(
		attribute.Int64("messaging.kafka.partition", int64(partition)),
		attribute.Int64("messaging.kafka.offset", int64(offset)),
	)
	return nil
}

func (p *KafkaPublisher) PublishDLQItem(ctx context.Context, event *model.DLQItemEvent, topic string) error {
	ctx, span := p.tracer.Start(ctx, "kafka.publish_dlq_item",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "kafka"),
			attribute.String("messaging.destination", topic),
			attribute.String("dlq.id", event.DLQID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	defer span.End()

	var contextMap map[string]interface{}
	var amount interface{}
	var intentID string
	var sourceSystem string

	if len(event.IntentContext) > 0 {
		if err := json.Unmarshal(event.IntentContext, &contextMap); err == nil {
			if amtVal, ok := contextMap["amount"]; ok {
				if amtStr, isStr := amtVal.(string); isStr {
					// Guard: empty string produces json.RawMessage{} (zero bytes)
					// which fails MarshalJSON with "unexpected end of JSON input".
					if len(amtStr) > 0 {
						amount = json.RawMessage(amtStr)
					}
					// else: amount stays nil → marshals as null, safe
				} else {
					amount = amtVal
				}
			}
			if id, ok := contextMap["intent_id"].(string); ok {
				intentID = id
			}
			if sys, ok := contextMap["source_system"].(string); ok {
				sourceSystem = sys
			}
		}
	}

	mappedEvent := map[string]interface{}{
		"event_id":      event.DLQID,
		"tenant_id":     event.TenantID,
		"trace_id":      event.TraceID,
		"occurred_at":   event.CreatedAt,
		"intent_id":     intentID,
		"batch_id":      event.BatchID,
		"source_system": sourceSystem,
		"amount":        amount,
		"reason_code":   event.ReasonCode,
	}

	payload, err := json.Marshal(mappedEvent)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "dlq item marshal failed")
		return poisonError(fmt.Errorf("marshalling dlq item: %w", err))
	}

	if len(payload) > 1*1024*1024 {
		err := poisonError(fmt.Errorf("dlq item size %d bytes exceeds 1MiB limit", len(payload)))
		span.RecordError(err)
		span.SetStatus(codes.Error, "message too large")
		return err
	}

	headers := p.buildDLQHeaders(ctx, event)

	msg := &sarama.ProducerMessage{
		Topic:   topic,
		Key:     sarama.StringEncoder(event.DLQID),
		Value:   sarama.ByteEncoder(payload),
		Headers: headers,
	}

	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "produce failed")
		return fmt.Errorf("kafka delivery failed: %w", err)
	}

	span.SetAttributes(
		attribute.Int64("messaging.kafka.partition", int64(partition)),
		attribute.Int64("messaging.kafka.offset", int64(offset)),
	)
	return nil
}

func (p *KafkaPublisher) PublishBatchCompleted(ctx context.Context, event *model.BatchCanonicalizationCompletedEvent, topic string) error {
	ctx, span := p.tracer.Start(ctx, "kafka.publish_batch_completed",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "kafka"),
			attribute.String("messaging.destination", topic),
			attribute.String("batch.id", event.BatchID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	defer span.End()

	payload, err := json.Marshal(event)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "batch completed event marshal failed")
		return poisonError(fmt.Errorf("marshalling batch completed event: %w", err))
	}

	if len(payload) > 1*1024*1024 {
		err := poisonError(fmt.Errorf("batch completed event size %d bytes exceeds 1MiB limit", len(payload)))
		span.RecordError(err)
		span.SetStatus(codes.Error, "message too large")
		return err
	}

	headers := []sarama.RecordHeader{
		{Key: []byte("tenant_id"), Value: []byte(event.TenantID)},
		{Key: []byte("batch_id"), Value: []byte(event.BatchID)},
		{Key: []byte("event_type"), Value: []byte("batch.canonicalization.completed.v1")},
	}

	otel.GetTextMapPropagator().Inject(ctx, otelHeaderCarrier{headers: &headers})

	msg := &sarama.ProducerMessage{
		Topic:   topic,
		Key:     sarama.StringEncoder(event.BatchID),
		Value:   sarama.ByteEncoder(payload),
		Headers: headers,
	}

	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "produce failed")
		return fmt.Errorf("kafka delivery failed: %w", err)
	}

	span.SetAttributes(
		attribute.Int64("messaging.kafka.partition", int64(partition)),
		attribute.Int64("messaging.kafka.offset", int64(offset)),
	)
	return nil
}

func (p *KafkaPublisher) PublishDLQ(ctx context.Context, msg *model.DLQMessage, dlqType DLQType) error {
	topic := p.dlqPublishFailure
	if dlqType == DLQTypePoison {
		topic = p.dlqPoison
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		p.log.Error("failed to marshal DLQ message",
			zap.String("dlq_type", string(dlqType)),
			zap.Error(err),
		)
		return err
	}

	var key sarama.Encoder
	if msg.Event != nil {
		key = sarama.StringEncoder(msg.Event.EventID)
	}

	producerMsg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   key,
		Value: sarama.ByteEncoder(payload),
		Headers: []sarama.RecordHeader{
			{Key: []byte("dlq_type"), Value: []byte(dlqType)},
			{Key: []byte("reason_code"), Value: []byte(msg.ReasonCode)},
		},
	}

	_, _, err = p.producer.SendMessage(producerMsg)
	if err != nil {
		return fmt.Errorf("DLQ delivery failed: %w", err)
	}

	return nil
}

func (p *KafkaPublisher) Close() error {
	return p.producer.Close()
}

func (p *KafkaPublisher) buildHeaders(ctx context.Context, event *model.OutboxEvent) []sarama.RecordHeader {
	headers := []sarama.RecordHeader{
		{Key: []byte("trace_id"), Value: []byte(event.TraceID)},
		{Key: []byte("tenant_id"), Value: []byte(event.TenantID)},
		{Key: []byte("event_id"), Value: []byte(event.EventID)},
		{Key: []byte("event_type"), Value: []byte(event.EventType)},
		{Key: []byte("envelope_id"), Value: []byte(event.EnvelopeID)},
	}
	if event.SchemaVersion != "" {
		headers = append(headers, sarama.RecordHeader{Key: []byte("schema_version"), Value: []byte(event.SchemaVersion)})
	}

	otel.GetTextMapPropagator().Inject(ctx, otelHeaderCarrier{headers: &headers})

	return headers
}

func (p *KafkaPublisher) buildDLQHeaders(ctx context.Context, event *model.DLQItemEvent) []sarama.RecordHeader {
	headers := []sarama.RecordHeader{
		{Key: []byte("trace_id"), Value: []byte(event.TraceID)},
		{Key: []byte("tenant_id"), Value: []byte(event.TenantID)},
		{Key: []byte("event_id"), Value: []byte(event.DLQID)},
		{Key: []byte("event_type"), Value: []byte("dlq.item.v1")},
		{Key: []byte("envelope_id"), Value: []byte(event.EnvelopeID)},
	}

	otel.GetTextMapPropagator().Inject(ctx, otelHeaderCarrier{headers: &headers})

	return headers
}

type PoisonErr struct{ cause error }

func (e *PoisonErr) Error() string { return e.cause.Error() }
func (e *PoisonErr) Unwrap() error { return e.cause }

func poisonError(err error) *PoisonErr { return &PoisonErr{cause: err} }

func IsPoison(err error) bool {
	if err == nil {
		return false
	}
	_, ok := err.(*PoisonErr)
	return ok
}

func stringsToSlice(s string) []string {
	if s == "" {
		return nil
	}
	parts := []string{}
	// Simple manual split to avoid complex regex
	rawParts := split(s, ",")
	for _, p := range rawParts {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func split(s, sep string) []string {
	res := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if string(s[i]) == sep {
			res = append(res, s[start:i])
			start = i + 1
		}
	}
	res = append(res, s[start:])
	return res
}
