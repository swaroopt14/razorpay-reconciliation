package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/metrics"
	"zord-relay/model"
	"zord-relay/publisher"
	"zord-relay/retry"
	"zord-relay/services"
	"zord-relay/tracing"
)

// processorResult is the outcome of processing a single event.
type processorResult struct {
	eventID     string
	success     bool
	isPoison    bool
	terminalAck bool // durable ledger committed; upstream may ACK
	err         error
}

// processor handles a single event: validates, publishes with retry, routes to DLQ.
type processor struct {
	pub         publisher.Publisher
	retryPolicy retry.Policy
	guard       *RouteGuard
	serviceName string
	instanceID  string
	log         *zap.Logger

	// failureRepo durably persists exhausted publish attempts (P0 6.1.3).
	// A poison event's upstream lease is only acknowledged once a record has
	// been committed here — never on the strength of a DLQ Kafka publish alone.
	failureRepo *services.PublishFailureRepo

	// hashVerifier re-computes SHA-256(payload) and compares it to the
	// upstream payload_hash field. Only populated for IsIntent workers;
	// nil for all other worker types (edge, generic, DLQ, batch).
	// When non-nil, verification runs inside processIntent() before publish.
	hashVerifier services.PayloadHashVerifier
}

func newProcessor(
	pub publisher.Publisher,
	svcCfg config.ServiceConfig,
	instanceID string,
	log *zap.Logger,
	failureRepo *services.PublishFailureRepo,
	hashVerifier services.PayloadHashVerifier,
	guard *RouteGuard,
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
		guard:        guard,
		serviceName:  svcCfg.Name,
		instanceID:   instanceID,
		log:          log.With(zap.String("component", "processor")),
		failureRepo:  failureRepo,
		hashVerifier: hashVerifier,
	}
}

// recordDurableFailure persists a durable failure record for an exhausted
// publish attempt (P0 6.1.3: source_event_id, source_service, topic,
// destination_topic, payload_hash, attempt_count, failure_class, last_error,
// replay_status). Returns true only if the record is durably committed —
// callers must not acknowledge the upstream lease for a poison event unless
// this returns true. A best-effort DLQ Kafka publish is not sufficient proof
// of durability: Kafka may be unreachable when the failure occurs.
func (p *processor) recordDurableFailureFromMessage(
	ctx context.Context,
	eventID, sourceTopic, destinationTopic string,
	messageKey string,
	messageValue []byte,
	headers []sarama.RecordHeader,
	attempts int,
	failureClass string,
	cause error,
	kind string,
	tenantID, traceID string,
	replayStatus string,
) bool {
	if p.failureRepo == nil {
		p.log.Error("CRITICAL: no publish-failure repo configured — cannot durably record failure, withholding upstream ack",
			zap.String("event_id", eventID),
			zap.String("failure_class", failureClass),
		)
		return false
	}

	sum := sha256.Sum256(messageValue)
	payloadHash := hex.EncodeToString(sum[:])

	headerBytes, _ := json.Marshal(headers)

	err := p.failureRepo.Record(ctx, services.PublishFailureRecord{
		SourceEventID:    eventID,
		SourceService:    p.serviceName,
		Topic:            sourceTopic,
		DestinationTopic: destinationTopic,
		PayloadHash:      payloadHash,
		MessageKey:       messageKey,
		MessageValue:     messageValue,
		HeadersJSON:      headerBytes,
		AttemptCount:     attempts,
		FailureClass:     failureClass,
		LastError:        cause.Error(),
		FailureSource:    services.FailureSourceUpstreamOutbox,
		PublishKind:      kind,
		TenantID:         tenantID,
		TraceID:          traceID,
		ReplayStatus:     replayStatus,
	})
	if err != nil {
		metrics.PublishFailurePersistErrorTotal.WithLabelValues(p.serviceName).Inc()
		p.log.Error("CRITICAL: failed to durably persist publish failure record — withholding upstream ack",
			zap.String("event_id", eventID),
			zap.String("failure_class", failureClass),
			zap.Error(err),
		)
		return false
	}

	metrics.PublishFailureRecordedTotal.WithLabelValues(p.serviceName, failureClass).Inc()
	return true
}

func (p *processor) recordDurableFailure(
	ctx context.Context,
	eventID, sourceTopic, destinationTopic string,
	payload []byte,
	attempts int,
	failureClass string,
	cause error,
) bool {
	// LEGACY implementation - only used if we haven't refactored the caller yet.
	// For full replayability, we should call recordDurableFailureFromMessage.
	return p.recordDurableFailureFromMessage(ctx, eventID, sourceTopic, destinationTopic, eventID, payload, nil, attempts, failureClass, cause, "generic", "", "", services.ReplayStatusPending)
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

	topic := event.Topic
	if topic == "" {
		key := RouteKey{
			SourceService: event.Source,
			EventType:     event.EventType,
			EventVersion:  "", // generic OutboxEvent has no event_version
			SchemaVersion: event.SchemaVersion,
		}
		t, err := p.guard.Route(key)
		if err != nil {
			p.log.Error("unknown event route — routing to poison DLQ",
				zap.String("event_type", event.EventType),
				zap.String("source_service", event.Source),
				zap.Error(err),
			)
			if dlqErr := p.routeToPoisonDLQ(ctx, event, err, model.ReasonCodeUnknownRoute, 1, p.guard.DefaultTopic); dlqErr != nil {
				return processorResult{eventID: event.EventID, success: false, isPoison: false, err: dlqErr}
			}
			return processorResult{eventID: event.EventID, isPoison: true, err: err}
		}
		topic = t
	}

	// Step 1 — validate the event before touching Kafka.
	if err := validateEvent(event); err != nil {
		log.Warn("poison event detected during validation", zap.Error(err))
		terminalAck := false
		if dlqErr := p.routeToPoisonDLQ(ctx, event, err, model.ReasonCodeMissingRequiredField, 1, topic); dlqErr == nil {
			// Durable record succeeded in routeToPoisonDLQ (which calls recordDurableFailureFromMessage)
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: err}
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
		terminalAck := false
		if err := p.routeToPoisonDLQ(ctx, event, stopErr.cause, reasonCode, attemptCount, topic); err == nil {
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: stopErr.cause}
	}

	// Kafka exhausted — publish-failure DLQ.
	metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "error").Inc()
	terminalAck := p.routeToPublishFailureDLQ(ctx, event, lastErr, attemptCount, firstAttemptAt, topic)

	return processorResult{eventID: event.EventID, success: false, terminalAck: terminalAck, err: lastErr}
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

	topic := event.Topic
	if topic == "" {
		key := RouteKey{
			SourceService: event.SourceSystem,
			EventType:     event.EventType,
			EventVersion:  "", // EdgeOutboxEvent has no event_version
			SchemaVersion: "", // EdgeOutboxEvent has no schema_version
		}
		t, err := p.guard.Route(key)
		if err != nil {
			p.log.Error("unknown event route — routing to poison DLQ",
				zap.String("event_type", event.EventType),
				zap.String("source_system", event.SourceSystem),
				zap.Error(err),
			)
			if dlqErr := p.routeEdgeToPoisonDLQ(ctx, event, err, model.ReasonCodeUnknownRoute, 1, p.guard.DefaultTopic); dlqErr != nil {
				return processorResult{eventID: event.EventID, success: false, isPoison: false, err: dlqErr}
			}
			return processorResult{eventID: event.EventID, isPoison: true, err: err}
		}
		topic = t
	}

	if err := validateEdgeEvent(event); err != nil {
		log.Warn("poison edge event detected during validation", zap.Error(err))
		terminalAck := false
		if dlqErr := p.routeEdgeToPoisonDLQ(ctx, event, err, model.ReasonCodeMissingRequiredField, 1, topic); dlqErr == nil {
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: err}
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
		terminalAck := false
		if err := p.routeEdgeToPoisonDLQ(ctx, event, stopErr.cause, reasonCode, attemptCount, topic); err == nil {
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: stopErr.cause}
	}

	metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "error").Inc()
	terminalAck := p.routeEdgeToPublishFailureDLQ(ctx, event, lastErr, attemptCount, firstAttemptAt, topic)

	return processorResult{eventID: event.EventID, success: false, terminalAck: terminalAck, err: lastErr}
}

func (p *processor) routeEdgeToPoisonDLQ(
	ctx context.Context,
	event *model.EdgeOutboxEvent,
	cause error,
	reasonCode string,
	attempts int,
	destinationTopic string,
) error {
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

	// Always write ledger for poison
	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildEdgeHeaders(ctx, event)
		if p.recordDurableFailureFromMessage(ctx, event.EventID, event.Topic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "edge", event.TenantID, event.TraceID, services.ReplayStatusQuarantined) {
			return nil
		}
	}

	return errors.New("failed to durably record poison event")
}

func (p *processor) routeEdgeToPublishFailureDLQ(
	ctx context.Context,
	event *model.EdgeOutboxEvent,
	cause error,
	attempts int,
	firstAttemptAt time.Time,
	destinationTopic string,
) bool {
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

	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildEdgeHeaders(ctx, event)
		return p.recordDurableFailureFromMessage(ctx, event.EventID, event.Topic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "edge", event.TenantID, event.TraceID, services.ReplayStatusPending)
	}
	return false
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

// processIntent is the intent-event equivalent of process(): validates,
// publishes with retry, and routes to DLQ on failure — same flow, but typed
// to model.IntentOutboxEvent instead of the shared generic OutboxEvent.
func (p *processor) processIntent(ctx context.Context, event *model.IntentOutboxEvent) processorResult {
	ctx, span := tracing.Tracer().Start(ctx, "processor.process_intent",
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

	topic := ""
	key := RouteKey{
		SourceService: event.SourceService,
		EventType:     event.EventType,
		EventVersion:  event.EventVersion,
		SchemaVersion: event.SchemaVersion,
	}
	t, err := p.guard.Route(key)
	if err != nil {
		p.log.Error("unknown event route — routing to poison DLQ",
			zap.String("event_type", event.EventType),
			zap.String("source_service", event.SourceService),
			zap.String("event_version", event.EventVersion),
			zap.String("schema_version", event.SchemaVersion),
			zap.Error(err),
		)
		if dlqErr := p.routeIntentToPoisonDLQ(ctx, event, err, model.ReasonCodeUnknownRoute, 1, p.guard.DefaultTopic); dlqErr != nil {
			return processorResult{eventID: event.EventID, success: false, isPoison: false, err: dlqErr}
		}
		return processorResult{eventID: event.EventID, isPoison: true, err: err}
	}
	topic = t

	if err := validateIntentEvent(event); err != nil {
		log.Warn("poison intent event detected during validation", zap.Error(err))
		terminalAck := false
		if dlqErr := p.routeIntentToPoisonDLQ(ctx, event, err, model.ReasonCodeMissingRequiredField, 1, topic); dlqErr == nil {
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: err}
	}

	// ── Payload hash verification (intent-engine only) ─────────────────────
	// Recomputes SHA-256(payload bytes) and compares to event.PayloadHash.
	// Must run BEFORE publish so altered envelopes never reach downstream.
	//
	// DecisionNack   → return retryable failure; upstream will re-lease the
	//                  event on the next cycle (conflict row persisted in DB).
	// DecisionAckPermanent → max conflict retries exceeded; route to poison
	//                  DLQ and ack it out so the outbox is unblocked.
	if p.hashVerifier != nil {
		vr, verifyErr := p.hashVerifier.VerifyPayload(
			ctx,
			p.serviceName,
			event.EventID,
			event.EventType,
			event.LeaseID,
			event.Payload,
			event.PayloadHash,
		)
		if verifyErr != nil {
			// Verifier itself errored (e.g. DB down). Do NOT publish.
			// Return retryable so the upstream lease is NACKed and retried.
			log.Error("intent payload hash verifier error — withholding publish",
				zap.String("event_id", event.EventID),
				zap.Error(verifyErr),
			)
			return processorResult{eventID: event.EventID, success: false, err: verifyErr}
		}
		if !vr.OK {
			if vr.Decision == services.DecisionAckPermanent {
				// Exhausted retries — route to poison DLQ and ack out.
				hashErr := services.ErrHashMismatch
				log.Error("intent payload hash MISMATCH (permanent) — routing to poison DLQ",
					zap.String("event_id", event.EventID),
					zap.String("expected_hash", vr.ExpectedHash),
					zap.String("computed_hash", vr.ComputedHash),
					zap.Int("conflict_count", vr.ConflictCount),
				)
				terminalAck := false
				if dlqErr := p.routeIntentToPoisonDLQ(ctx, event, hashErr, model.ReasonCodePayloadHashMismatch, vr.ConflictCount, topic); dlqErr == nil {
					terminalAck = true
				}
				return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: hashErr}
			}
			// DecisionNack — NACK so upstream re-leases; conflict row is in DB.
			log.Error("intent payload hash MISMATCH — withholding publish, NACKing upstream lease",
				zap.String("event_id", event.EventID),
				zap.String("expected_hash", vr.ExpectedHash),
				zap.String("computed_hash", vr.ComputedHash),
				zap.Int("conflict_count", vr.ConflictCount),
			)
			return processorResult{eventID: event.EventID, success: false, err: services.ErrHashMismatch}
		}
	}

	firstAttemptAt := time.Now()
	var lastErr error
	var attemptCount int

	retryErr := p.retryPolicy.Do(ctx,
		func(ctx context.Context, attempt retry.Attempt) error {
			attemptCount = attempt.Number
			err := p.pub.PublishIntentEvent(ctx, event, topic)
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
		log.Info("intent event published",
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
		terminalAck := false
		if err := p.routeIntentToPoisonDLQ(ctx, event, stopErr.cause, reasonCode, attemptCount, topic); err == nil {
			terminalAck = true
		}
		return processorResult{eventID: event.EventID, isPoison: true, terminalAck: terminalAck, err: stopErr.cause}
	}

	metrics.PublishTotal.WithLabelValues(p.serviceName, topic, "error").Inc()
	terminalAck := p.routeIntentToPublishFailureDLQ(ctx, event, lastErr, attemptCount, firstAttemptAt, topic)

	return processorResult{eventID: event.EventID, success: false, terminalAck: terminalAck, err: lastErr}
}

// intentEventTopic is always "" — IntentOutboxEvent carries no per-event
// topic field (routing is entirely topic-map/default-topic driven).
const intentEventTopic = ""

func (p *processor) routeIntentToPoisonDLQ(
	ctx context.Context,
	event *model.IntentOutboxEvent,
	cause error,
	reasonCode string,
	attempts int,
	destinationTopic string,
) error {
	msg := &model.DLQMessage{
		IntentEvent:     event,
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
		p.log.Error("CRITICAL: failed to publish intent event to poison DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePoison)).Inc()
	p.log.Error("intent event routed to poison DLQ",
		zap.String("event_id", event.EventID),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)

	// Always write ledger for poison
	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildIntentHeaders(ctx, event)
		if p.recordDurableFailureFromMessage(ctx, event.EventID, intentEventTopic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "intent", event.TenantID, event.TraceID, services.ReplayStatusQuarantined) {
			return nil
		}
	}

	return errors.New("failed to durably record poison intent event")
}

func (p *processor) routeIntentToPublishFailureDLQ(
	ctx context.Context,
	event *model.IntentOutboxEvent,
	cause error,
	attempts int,
	firstAttemptAt time.Time,
	destinationTopic string,
) bool {
	reasonCode := model.ReasonCodeKafkaMaxRetries
	if cause != nil && isKafkaTimeout(cause) {
		reasonCode = model.ReasonCodeKafkaTimeout
	}

	msg := &model.DLQMessage{
		IntentEvent:     event,
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
		p.log.Error("CRITICAL: failed to publish intent event to publish-failure DLQ",
			zap.String("event_id", event.EventID),
			zap.Error(err),
		)
	}
	metrics.DLQTotal.WithLabelValues(p.serviceName, string(publisher.DLQTypePublishFailure)).Inc()
	p.log.Error("intent event routed to publish-failure DLQ after max retries",
		zap.String("event_id", event.EventID),
		zap.Int("attempts", attempts),
		zap.String("reason_code", reasonCode),
		zap.Error(cause),
	)

	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildIntentHeaders(ctx, event)
		return p.recordDurableFailureFromMessage(ctx, event.EventID, intentEventTopic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "intent", event.TenantID, event.TraceID, services.ReplayStatusPending)
	}
	return false
}

// validateIntentEvent validates the structural and envelope-metadata
// requirements for intent-engine events before they are published to Kafka.
//
// Required fields:
//   - event_id, tenant_id, event_type, payload — basic structural fields
//   - trace_id     — cross-service traceability; must be present so downstream
//     services can correlate intent events in distributed traces
//   - schema_version — required for consumer schema compatibility checks;
//     must be present so downstream services can reject stale
//     message formats rather than silently misinterpret them
//
// Payload hash verification (SHA-256 recompute) is done separately in
// processIntent() via hashVerifier so the conflict repo can be called with
// the full context (event_id, lease_id, service_name).
func validateIntentEvent(e *model.IntentOutboxEvent) error {
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
	if e.TraceID == "" {
		return errMissingField("trace_id")
	}
	if e.SchemaVersion == "" {
		return errMissingField("schema_version")
	}
	return nil
}

func (p *processor) routeToPoisonDLQ(
	ctx context.Context,
	event *model.OutboxEvent,
	cause error,
	reasonCode string,
	attempts int,
	destinationTopic string,
) error {
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

	// Always write ledger for poison
	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildHeaders(ctx, event)
		if p.recordDurableFailureFromMessage(ctx, event.EventID, event.Topic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "generic", event.TenantID, event.TraceID, services.ReplayStatusQuarantined) {
			return nil
		}
	}

	return errors.New("failed to durably record poison event")
}

func (p *processor) routeToPublishFailureDLQ(
	ctx context.Context,
	event *model.OutboxEvent,
	cause error,
	attempts int,
	firstAttemptAt time.Time,
	destinationTopic string,
) bool {
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

	if kPub, ok := p.pub.(*publisher.KafkaPublisher); ok {
		val, _ := json.Marshal(event)
		headers := kPub.BuildHeaders(ctx, event)
		return p.recordDurableFailureFromMessage(ctx, event.EventID, event.Topic, destinationTopic, event.EventID, val, headers, attempts, reasonCode, cause, "generic", event.TenantID, event.TraceID, services.ReplayStatusPending)
	}
	return false
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
