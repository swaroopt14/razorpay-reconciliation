package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
	"zord-relay/kafka"
	"zord-relay/logger"
	"zord-relay/model"

	"go.uber.org/zap"
)

// RelayLoopConfig holds tuning parameters for the Kafka relay loop.
type RelayLoopConfig struct {
	WorkerCount            int
	BatchSize              int
	PollInterval           time.Duration
	DispatchEventsTopic    string
	PublishFailureDLQTopic string
	PoisonEventDLQTopic    string
	MaxPublishAttempts     int // default 20
}

// RelayLoop reads PENDING events from relay_outbox and publishes them to Kafka.
// It is completely independent of the dispatch loop — Kafka downtime does not
// block dispatching. Events accumulate in relay_outbox and drain when Kafka recovers.
//
// Two DLQ paths:
//   - Publish failure DLQ: Kafka unreachable, timeout, broker errors.
//     The original event is still in relay_outbox as PENDING for retry.
//   - Poison event DLQ: payload too large, invalid JSON, schema mismatch.
//     The event is moved to DLQ and marked PUBLISHED so it is not retried.
type RelayLoop struct {
	outboxRepo      *RelayOutboxRepo
	failureRepo     *PublishFailureRepo
	producer        *kafka.Producer
	cfg             *RelayLoopConfig
}

func NewRelayLoop(outboxRepo *RelayOutboxRepo, failureRepo *PublishFailureRepo, producer *kafka.Producer, cfg *RelayLoopConfig) *RelayLoop {
	if cfg.MaxPublishAttempts <= 0 {
		cfg.MaxPublishAttempts = 20
	}
	return &RelayLoop{outboxRepo: outboxRepo, failureRepo: failureRepo, producer: producer, cfg: cfg}
}

// Start launches cfg.WorkerCount relay workers.
// Each worker independently polls relay_outbox using FOR UPDATE SKIP LOCKED,
// so they never process the same row twice.
func (r *RelayLoop) Start(ctx context.Context, wg *sync.WaitGroup) {
	for i := 0; i < r.cfg.WorkerCount; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			r.worker(ctx, workerID)
		}(i)
	}
}

func (r *RelayLoop) worker(ctx context.Context, workerID int) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		events, err := r.outboxRepo.ListPendingForPublish(ctx, r.cfg.BatchSize)
		if err != nil {
			logger.Logger.Error("relay_loop: list pending failed",
				zap.Int("worker_id", workerID),
				zap.Error(err),
			)
			r.sleep(ctx, r.cfg.PollInterval)
			continue
		}

		if len(events) == 0 {
			r.sleep(ctx, r.cfg.PollInterval)
			continue
		}

		for _, e := range events {
			log := logger.Logger.With(
				zap.Int("worker_id", workerID),
				zap.String("event_id", e.EventID),
				zap.String("event_type", e.EventType),
				zap.String("dispatch_id", e.DispatchID),
				zap.String("trace_id", e.TraceID),
				zap.String("tenant_id", e.TenantID),
			)

			headers := map[string]string{
				"event_id":    e.EventID,
				"event_type":  e.EventType,
				"dispatch_id": e.DispatchID,
				"trace_id":    e.TraceID,
				"tenant_id":   e.TenantID,
				"intent_id":   e.IntentID,
			}

			// Kafka key = dispatch_id for ordered delivery per dispatch.
			err := r.producer.Publish(r.cfg.DispatchEventsTopic, e.DispatchID, e.Payload, headers)
			if err != nil {
				poison := isPoisonError(err)
				dlqTopic := r.cfg.PublishFailureDLQTopic
				if poison {
					dlqTopic = r.cfg.PoisonEventDLQTopic
				}

				dlqPayload := buildDLQPayload(e.EventID, e.EventType, e.TenantID, e.IntentID, e.TraceID, e.Payload, err, poison)
				dlqHeaders := map[string]string{
					"event_id":     e.EventID,
					"trace_id":     e.TraceID,
					"tenant_id":    e.TenantID,
					"reason_code":  dlqPayload.ReasonCode,
					"dlq_category": dlqCategory(poison),
				}

				dlqErr := r.producer.Publish(dlqTopic, e.EventID, dlqPayload, dlqHeaders)
				if dlqErr != nil {
					log.Error("relay_loop: DLQ publish also failed",
						zap.String("dlq_topic", dlqTopic),
						zap.Error(dlqErr),
					)
					// Leave as PENDING — will be retried on next poll.
					continue
				}

				log.Error("relay_loop: publish failed, sent to DLQ",
					zap.String("dlq_topic", dlqTopic),
					zap.Bool("poison", poison),
					zap.Error(err),
				)

				// Check if this is a poison event - write to failure ledger and mark FAILED
				if poison {
					terminalAck := r.recordFailureAndMarkTerminal(ctx, e, poison, dlqTopic, err, headers)
					if terminalAck {
						publishedIDs := []string{e.EventID}
						if err := r.outboxRepo.MarkPublished(ctx, publishedIDs); err != nil {
							logger.Logger.Error("relay_loop: mark published failed",
								zap.Int("worker_id", workerID),
								zap.Int("count", len(publishedIDs)),
								zap.Error(err),
							)
						}
					}
				}
				// Non-poison (Kafka transient) events stay PENDING for retry.
				continue
			}

			// Success - mark as published
			publishedIDs := []string{e.EventID}
			if err := r.outboxRepo.MarkPublished(ctx, publishedIDs); err != nil {
				logger.Logger.Error("relay_loop: mark published failed",
					zap.Int("worker_id", workerID),
					zap.Int("count", len(publishedIDs)),
					zap.Error(err),
				)
			}
			log.Info("relay_loop: published",
				zap.String("topic", r.cfg.DispatchEventsTopic),
			)
		}
	}
}

// recordFailureAndMarkTerminal writes a durable failure record and marks the outbox event as FAILED
func (r *RelayLoop) recordFailureAndMarkTerminal(ctx context.Context, e model.RelayOutboxRow, poison bool, dlqTopic string, cause error, headers map[string]string) bool {
	if r.failureRepo == nil {
		logger.Logger.Error("CRITICAL: no publish-failure repo configured — cannot durably record failure",
			zap.String("event_id", e.EventID),
		)
		return false
	}

	// Build headers for the failure record
	headerBytes, _ := json.Marshal(headers)

	replayStatus := ReplayStatusPending
	failureClass := "KAFKA_PUBLISH_FAILED"
	if poison {
		replayStatus = ReplayStatusQuarantined
		failureClass = classifyError(cause)
	}

	sum := sha256.Sum256(e.Payload)
	payloadHash := hex.EncodeToString(sum[:])

	err := r.failureRepo.Record(ctx, PublishFailureRecord{
		SourceEventID:    e.EventID,
		SourceService:    "zord-relay",
		Topic:            "",
		DestinationTopic: r.cfg.DispatchEventsTopic,
		PayloadHash:      payloadHash,
		MessageKey:       e.DispatchID,
		MessageValue:     e.Payload,
		HeadersJSON:      headerBytes,
		AttemptCount:     e.RetryCount + 1,
		FailureClass:     failureClass,
		LastError:        cause.Error(),
		FailureSource:    FailureSourceRelayOutbox,
		PublishKind:      "generic",
		TenantID:         e.TenantID,
		TraceID:          e.TraceID,
		ReplayStatus:     replayStatus,
	})
	if err != nil {
		logger.Logger.Error("CRITICAL: failed to durably persist publish failure record",
			zap.String("event_id", e.EventID),
			zap.Error(err),
		)
		return false
	}

	// Mark the outbox event as FAILED
	if err := r.outboxRepo.MarkFailed(ctx, e.EventID); err != nil {
		logger.Logger.Error("relay_loop: mark failed failed",
			zap.String("event_id", e.EventID),
			zap.Error(err),
		)
		return false
	}

	return true
}

// dlqEnvelope is the payload written to the DLQ topic.
type dlqEnvelope struct {
	EventID       string          `json:"event_id"`
	EventType     string          `json:"event_type"`
	TenantID      string          `json:"tenant_id"`
	IntentID      string          `json:"intent_id"`
	TraceID       string          `json:"trace_id"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	Error         string          `json:"error"`
	ReasonCode    string          `json:"reason_code"`
	DLQCategory   string          `json:"dlq_category"`
	LastAttemptAt time.Time       `json:"last_attempt_at"`
}

func buildDLQPayload(
	eventID, eventType, tenantID, intentID, traceID string,
	payload json.RawMessage,
	err error,
	poison bool,
) dlqEnvelope {
	env := dlqEnvelope{
		EventID:       eventID,
		EventType:     eventType,
		TenantID:      tenantID,
		IntentID:      intentID,
		TraceID:       traceID,
		Error:         err.Error(),
		ReasonCode:    classifyError(err),
		DLQCategory:   dlqCategory(poison),
		LastAttemptAt: time.Now().UTC(),
	}
	// For poison events that are too large, omit the payload from DLQ
	// to avoid the DLQ message also being too large.
	if !isTooLargeError(err) {
		env.Payload = payload
	}
	return env
}

func classifyError(err error) string {
	if isTooLargeError(err) {
		return "POISON_TOO_LARGE"
	}
	if isJSONError(err) {
		return "POISON_INVALID_JSON"
	}
	return "KAFKA_PUBLISH_FAILED"
}

func dlqCategory(poison bool) string {
	if poison {
		return "poison_event"
	}
	return "publish_failure"
}

func isPoisonError(err error) bool {
	return isJSONError(err) || isTooLargeError(err)
}

func isJSONError(err error) bool {
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnsupportedTypeError
	if errors.As(err, &syntaxErr) || errors.As(err, &typeErr) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "invalid character")
}

func isTooLargeError(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "message size") ||
		strings.Contains(msg, "too large") ||
		strings.Contains(msg, "record is too large")
}

func (r *RelayLoop) sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}
