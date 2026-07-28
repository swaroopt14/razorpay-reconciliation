package worker

import (
	"context"
	"errors"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/metrics"
	"zord-relay/model"
	"zord-relay/publisher"
	"zord-relay/retry"
	"zord-relay/tracing"
)

// processorResult is the outcome of processing a single event.
type processorResult struct {
	eventID  string
	success  bool
	isPoison bool
	err      error
}

// processor handles a single event: validates, publishes with retry, routes to DLQ.
type processor struct {
	pub          publisher.Publisher
	retryPolicy  retry.Policy
	defaultTopic string
	topicMap     map[string]string
	serviceName  string
	instanceID   string
	log          *zap.Logger
}

func newProcessor(
	pub publisher.Publisher,
	svcCfg config.ServiceConfig,
	instanceID string,
	log *zap.Logger,
) *processor {
	maxAttempts, baseDelay, maxDelay := svcCfg.RetryConfig()
	return &processor{
		pub: pub,
		retryPolicy: retry.Policy{
			MaxAttempts: maxAttempts,
			BaseDelay:   baseDelay,
			MaxDelay:    maxDelay,
			Multiplier:  2.0,
		},
		defaultTopic: svcCfg.DefaultTopic,
		topicMap:     svcCfg.TopicMap,
		serviceName:  svcCfg.Name,
		instanceID:   instanceID,
		log:          log.With(zap.String("component", "processor")),
	}
}

// process publishes one event, retrying on transient Kafka errors.
// Poison events skip retry and go directly to the poison DLQ.
// Returns a processorResult indicating success or failure type.
func (p *processor) process(ctx context.Context, event *model.OutboxEvent) processorResult {
	ctx, span := tracing.Tracer().Start(ctx, "processor.process",
		trace.WithAttributes(
			attribute.String("event.id", event.EventID),
			attribute.String("event.type", event.EventType),
			attribute.String("tenant.id", event.TenantID),
			attribute.String("service", p.serviceName),
		),
	)
	defer span.End()

	log := p.log.With(
		zap.String("event_id", event.EventID),
		zap.String("event_type", event.EventType),
		zap.String("tenant_id", event.TenantID),
		zap.String("trace_id", event.TraceID),
	)

	// Step 1 — validate the event before touching Kafka.
	if err := validateEvent(event); err != nil {
		log.Warn("poison event detected during validation", zap.Error(err))
		p.routeToPoisonDLQ(ctx, event, err, model.ReasonCodeMissingRequiredField, 1)
		return processorResult{eventID: event.EventID, isPoison: true, err: err}
	}

	topic := event.Topic
	if topic == "" {
		if t, ok := p.topicMap[event.EventType]; ok {
			topic = t
		} else {
			topic = p.defaultTopic
		}
	}

	firstAttemptAt := time.Now()
	var lastErr error
	var attemptCount int

	retryErr := p.retryPolicy.Do(ctx,
		func(ctx context.Context, attempt retry.Attempt) error {
			attemptCount = attempt.Number
			err := p.pub.Publish(ctx, event, topic)
			if err == nil {
				return nil
			}

			// Poison errors must not be retried.
			if publisher.IsPoison(err) {
				return &stopRetryError{cause: err, isPoison: true}
			}

			metrics.RetryTotal.WithLabelValues(p.serviceName).Inc()
			lastErr = err

			log.Warn("kafka publish failed, will retry",
				zap.Int("attempt", attempt.Number),
				zap.Int("max_attempts", p.retryPolicy.MaxAttempts),
				zap.Error(err),
			)
			return err
		},
		func(attempt retry.Attempt, delay time.Duration) {
			log.Info("retry backoff",
				zap.Int("attempt", attempt.Number),
				zap.Duration("backoff", delay),
				zap.Error(attempt.LastError),
			)
		},
	)

	if retryErr == nil {
		metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "success").Inc()
		log.Info("event published successfully", zap.String("topic", topic), zap.Int("attempts", attemptCount))
		return processorResult{eventID: event.EventID, success: true}
	}

	// Distinguish poison vs exhausted retries.
	var stopErr *stopRetryError
	if errors.As(retryErr, &stopErr) && stopErr.isPoison {
		reasonCode := model.ReasonCodeInvalidPayload
		if errors.Is(stopErr.cause, errMessageTooLarge) {
			reasonCode = model.ReasonCodeMessageTooLarge
		}
		p.routeToPoisonDLQ(ctx, event, stopErr.cause, reasonCode, attemptCount)
		return processorResult{eventID: event.EventID, isPoison: true, err: stopErr.cause}
	}

	// Kafka exhausted — publish-failure DLQ.
	metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "error").Inc()
	p.routeToPublishFailureDLQ(ctx, event, lastErr, attemptCount, firstAttemptAt)

	return processorResult{eventID: event.EventID, success: false, err: lastErr}
}

// processEdge is the edge-event equivalent of process(): validates, publishes
// with retry, and routes to DLQ on failure — same flow, but typed to
// model.EdgeOutboxEvent instead of the shared generic OutboxEvent.
func (p *processor) processEdge(ctx context.Context, event *model.EdgeOutboxEvent) processorResult {
	ctx, span := tracing.Tracer().Start(ctx, "processor.process_edge",
		trace.WithAttributes(
			attribute.String("event.id", event.EventID),
			attribute.String("event.type", event.EventType),
			attribute.String("tenant.id", event.TenantID),
			attribute.String("service", p.serviceName),
		),
	)
	defer span.End()

	log := p.log.With(
		zap.String("event_id", event.EventID),
		zap.String("event_type", event.EventType),
		zap.String("tenant_id", event.TenantID),
		zap.String("trace_id", event.TraceID),
	)

	if err := validateEdgeEvent(event); err != nil {
		log.Warn("poison edge event detected during validation", zap.Error(err))
		p.routeEdgeToPoisonDLQ(ctx, event, err, model.ReasonCodeMissingRequiredField, 1)
		return processorResult{eventID: event.EventID, isPoison: true, err: err}
	}

	topic := event.Topic
	if topic == "" {
		if t, ok := p.topicMap[event.EventType]; ok {
			topic = t
		} else {
			topic = p.defaultTopic
		}
	}

	firstAttemptAt := time.Now()
	var lastErr error
	var attemptCount int

	retryErr := p.retryPolicy.Do(ctx,
		func(ctx context.Context, attempt retry.Attempt) error {
			attemptCount = attempt.Number
			err := p.pub.PublishEdgeEvent(ctx, event, topic)
			if err == nil {
				return nil
			}

			if publisher.IsPoison(err) {
				return &stopRetryError{cause: err, isPoison: true}
			}

			metrics.RetryTotal.WithLabelValues(p.serviceName).Inc()
			lastErr = err

			log.Warn("kafka publish failed, will retry",
				zap.Int("attempt", attempt.Number),
				zap.Int("max_attempts", p.retryPolicy.MaxAttempts),
				zap.Error(err),
			)
			return err
		},
		func(attempt retry.Attempt, delay time.Duration) {
			log.Info("retry backoff",
				zap.Int("attempt", attempt.Number),
				zap.Duration("backoff", delay),
				zap.Error(attempt.LastError),
			)
		},
	)

	if retryErr == nil {
		metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "success").Inc()
		log.Info("edge event published",
			zap.String("event_type", event.EventType),
			zap.String("event_id", event.EventID),
			zap.String("topic", topic),
			zap.Int("attempts", attemptCount),
		)
		return processorResult{eventID: event.EventID, success: true}
	}

	var stopErr *stopRetryError
	if errors.As(retryErr, &stopErr) && stopErr.isPoison {
		reasonCode := model.ReasonCodeInvalidPayload
		if errors.Is(stopErr.cause, errMessageTooLarge) {
			reasonCode = model.ReasonCodeMessageTooLarge
		}
		p.routeEdgeToPoisonDLQ(ctx, event, stopErr.cause, reasonCode, attemptCount)
		return processorResult{eventID: event.EventID, isPoison: true, err: stopErr.cause}
	}

	metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "error").Inc()
	p.routeEdgeToPublishFailureDLQ(ctx, event, lastErr, attemptCount, firstAttemptAt)

	return processorResult{eventID: event.EventID, success: false, err: lastErr}
}

func (p *processor) routeEdgeToPoisonDLQ(
	ctx context.Context,
	event *model.EdgeOutboxEvent,
	cause error,
	reasonCode string,
	attempts int,
) {
	msg := &model.DLQMessage{
		EdgeEvent:       event,
		EventID:         event.EventID,
		Error:           cause.Error(),
		ReasonCode:      reasonCode,
		ServiceName:     p.serviceName,
		AttemptsCount:   attempts,
		LastAttemptAt:   time.Now(),
		FirstAttemptAt:  time.Now(),
		RelayInstanceID: p.instanceID,
	}
	if err := p.pub.PublishDLQ(ctx, msg, publisher.DLQTypePoison); err != nil {
		p.log.Error("CRITICAL: failed to publish edge event to poison DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePoison)).Inc()
	p.log.Error("edge event routed to poison DLQ",
		zap.String("event_id", event.EventID),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)
}

func (p *processor) routeEdgeToPublishFailureDLQ(
	ctx context.Context,
	event *model.EdgeOutboxEvent,
	cause error,
	attempts int,
	firstAttemptAt time.Time,
) {
	reasonCode := model.ReasonCodeKafkaMaxRetries
	if cause != nil && isKafkaTimeout(cause) {
		reasonCode = model.ReasonCodeKafkaTimeout
	}

	msg := &model.DLQMessage{
		EdgeEvent:       event,
		EventID:         event.EventID,
		Error:           cause.Error(),
		ReasonCode:      reasonCode,
		ServiceName:     p.serviceName,
		AttemptsCount:   attempts,
		LastAttemptAt:   time.Now(),
		FirstAttemptAt:  firstAttemptAt,
		RelayInstanceID: p.instanceID,
	}
	if err := p.pub.PublishDLQ(ctx, msg, publisher.DLQTypePublishFailure); err != nil {
		p.log.Error("CRITICAL: failed to publish edge event to publish-failure DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePublishFailure)).Inc()
	p.log.Error("edge event routed to publish-failure DLQ after max retries",
		zap.String("event_id", event.EventID),
		zap.Int("attempts", attempts),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)
}

// validateEdgeEvent performs the same structural validation as validateEvent,
// scoped to model.EdgeOutboxEvent's fields.
func validateEdgeEvent(e *model.EdgeOutboxEvent) error {
	if e.EventID == "" {
		return errMissingField("event_id")
	}
	if e.TenantID == "" {
		return errMissingField("tenant_id")
	}
	if e.EventType == "" {
		return errMissingField("event_type")
	}
	if len(e.Payload) == 0 || string(e.Payload) == "null" {
		return errMissingField("payload")
	}
	return nil
}

func (p *processor) routeToPoisonDLQ(
	ctx context.Context,
	event *model.OutboxEvent,
	cause error,
	reasonCode string,
	attempts int,
) {
	msg := &model.DLQMessage{
		Event:           event,
		EventID:         event.EventID,
		Error:           cause.Error(),
		ReasonCode:      reasonCode,
		ServiceName:     p.serviceName,
		AttemptsCount:   attempts,
		LastAttemptAt:   time.Now(),
		FirstAttemptAt:  time.Now(),
		RelayInstanceID: p.instanceID,
	}
	if err := p.pub.PublishDLQ(ctx, msg, publisher.DLQTypePoison); err != nil {
		p.log.Error("CRITICAL: failed to publish to poison DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePoison)).Inc()
	p.log.Error("event routed to poison DLQ",
		zap.String("event_id", event.EventID),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)
}

func (p *processor) routeToPublishFailureDLQ(
	ctx context.Context,
	event *model.OutboxEvent,
	cause error,
	attempts int,
	firstAttemptAt time.Time,
) {
	reasonCode := model.ReasonCodeKafkaMaxRetries
	if cause != nil && isKafkaTimeout(cause) {
		reasonCode = model.ReasonCodeKafkaTimeout
	}

	msg := &model.DLQMessage{
		Event:           event,
		EventID:         event.EventID,
		Error:           cause.Error(),
		ReasonCode:      reasonCode,
		ServiceName:     p.serviceName,
		AttemptsCount:   attempts,
		LastAttemptAt:   time.Now(),
		FirstAttemptAt:  firstAttemptAt,
		RelayInstanceID: p.instanceID,
	}
	if err := p.pub.PublishDLQ(ctx, msg, publisher.DLQTypePublishFailure); err != nil {
		p.log.Error("CRITICAL: failed to publish to publish-failure DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePublishFailure)).Inc()
	p.log.Error("event routed to publish-failure DLQ after max retries",
		zap.String("event_id", event.EventID),
		zap.Int("attempts", attempts),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)
}

// validateEvent performs lightweight structural validation before publish.
func validateEvent(e *model.OutboxEvent) error {
	if e.EventID == "" {
		return errMissingField("event_id")
	}
	if e.TenantID == "" {
		return errMissingField("tenant_id")
	}
	if e.EventType == "" {
		return errMissingField("event_type")
	}
	if len(e.Payload) == 0 || string(e.Payload) == "null" {
		return errMissingField("payload")
	}
	return nil
}

// --- sentinel errors ---

var errMessageTooLarge = errors.New("message too large")

type missingFieldError struct{ field string }

func (e *missingFieldError) Error() string { return "missing required field: " + e.field }

func errMissingField(field string) error { return &missingFieldError{field: field} }

// stopRetryError wraps a non-retryable error to break out of the retry loop.
type stopRetryError struct {
	cause    error
	isPoison bool
}

func (e *stopRetryError) Error() string { return e.cause.Error() }
func (e *stopRetryError) Unwrap() error { return e.cause }

func isKafkaTimeout(err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, context.DeadlineExceeded)
}
