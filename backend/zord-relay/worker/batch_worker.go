package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"

	"zord-relay/client"
	"zord-relay/config"
	"zord-relay/metrics"
	"zord-relay/model"
	"zord-relay/publisher"
	"zord-relay/retry"
	"zord-relay/services"
	"zord-relay/tracing"
)

const (
	batchMaxPublishAttempts = 20
)

type BatchWorker struct {
	svcCfg      config.ServiceConfig
	relayCfg    config.RelayConfig
	batchClient *client.BatchClient
	pub         publisher.Publisher
	sema        *semaphore.Weighted
	log         *zap.Logger

	// failureRepo durably persists exhausted publish attempts
	failureRepo *services.PublishFailureRepo
}

func NewBatchWorker(
	svcCfg config.ServiceConfig,
	relayCfg config.RelayConfig,
	pub publisher.Publisher,
	log *zap.Logger,
	failureRepo *services.PublishFailureRepo,
) *BatchWorker {
	workerLog := log.With(zap.String("service_batch", svcCfg.Name))

	batchClient := client.NewBatchClient(
		svcCfg.Name,
		svcCfg.BaseURL,
		svcCfg.AuthToken,
		relayCfg.InstanceID,
		svcCfg.HTTPTimeout,
		workerLog,
	)

	concurrency := int64(relayCfg.MaxPublishConcurrency)
	if concurrency <= 0 {
		concurrency = 10
	}

	return &BatchWorker{
		svcCfg:      svcCfg,
		relayCfg:    relayCfg,
		batchClient: batchClient,
		pub:         pub,
		sema:        semaphore.NewWeighted(concurrency),
		log:         workerLog,
		failureRepo: failureRepo,
	}
}

func (w *BatchWorker) Run(ctx context.Context) {
	w.log.Info("Batch worker started")
	metrics.WorkerUp.WithLabelValues(w.svcCfg.Name + "-batch").Set(1)
	defer func() {
		metrics.WorkerUp.WithLabelValues(w.svcCfg.Name + "-batch").Set(0)
		w.log.Info("Batch worker stopped")
	}()

	pollInterval := w.relayCfg.PollInterval
	if pollInterval <= 0 {
		pollInterval = 2 * time.Second
	}

	for {
		if ctx.Err() != nil {
			return
		}

		if err := w.sema.Acquire(ctx, 1); err != nil {
			return
		}

		processed := w.runCycle(ctx)

		w.sema.Release(1)
		metrics.PollCycleTotal.WithLabelValues(w.svcCfg.Name + "-batch").Inc()

		if processed == 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(pollInterval):
			}
		}
	}
}

func (w *BatchWorker) runCycle(ctx context.Context) int {
	ctx, span := tracing.Tracer().Start(ctx, "batch_worker.poll_cycle",
		trace.WithAttributes(attribute.String("service", w.svcCfg.Name)),
	)
	defer span.End()

	log := w.log

	// --- Lease ---
	leaseResp, err := w.batchClient.Lease(ctx, w.relayCfg.LeaseLimit, w.relayCfg.LeaseTTLSeconds)
	if err != nil {
		log.Error("batch lease call failed", zap.Error(err))
		metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name+"-batch", "error").Inc()
		return 0
	}

	if len(leaseResp.Events) == 0 {
		metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name+"-batch", "empty").Inc()
		metrics.BacklogGauge.WithLabelValues(w.svcCfg.Name + "-batch").Set(0)
		return 0
	}

	metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name+"-batch", "success").Inc()
	metrics.LeaseBatchSize.WithLabelValues(w.svcCfg.Name + "-batch").Observe(float64(len(leaseResp.Events)))
	metrics.BacklogGauge.WithLabelValues(w.svcCfg.Name + "-batch").Set(float64(len(leaseResp.Events)))
	metrics.InFlightPublishes.WithLabelValues(w.svcCfg.Name + "-batch").Add(float64(len(leaseResp.Events)))
	defer metrics.InFlightPublishes.WithLabelValues(w.svcCfg.Name + "-batch").Sub(float64(len(leaseResp.Events)))

	log.Info("leased batch completed events",
		zap.Int("count", len(leaseResp.Events)),
		zap.String("lease_id", leaseResp.LeaseID),
	)

	// --- Publish ---
	var (
		toAck  []string
		toNack []string
	)

	topic := "batch.canonicalization.completed"

	for i := range leaseResp.Events {
		evt := &leaseResp.Events[i]

		err := w.publishWithRetry(ctx, evt, topic, leaseResp.LeaseID)
		if err == nil {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name+"-batch", topic, "success").Inc()
			log.Info("batch completed event published successfully", zap.String("topic", topic), zap.String("batch_id", evt.BatchID))
			toAck = append(toAck, evt.BatchID)
		} else {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name+"-batch", topic, "error").Inc()
			log.Error("failed to publish batch completed event after max retries", zap.String("batch_id", evt.BatchID), zap.Error(err))

			// Durable record of the failure
			terminalAck := false
			if w.failureRepo != nil {
				if kPub, ok := w.pub.(*publisher.KafkaPublisher); ok {
					val, _ := json.Marshal(evt)
					headers := kPub.BuildHeaders(ctx, nil)
					// For batch events, we don't have direct access to headers builder
					// Just build simple headers
					terminalAck = w.recordBatchFailure(ctx, evt, topic, val, headers, batchMaxPublishAttempts, err)
				}
			}

			if terminalAck {
				toAck = append(toAck, evt.BatchID)
				w.log.Warn("exhausted batch publish failure acked from outbox after durable ledger record",
					zap.String("batch_id", evt.BatchID),
				)
			} else {
				toNack = append(toNack, evt.BatchID)
			}
		}
	}

	// --- Ack ---
	if len(toAck) > 0 {
		w.ack(ctx, leaseResp.LeaseID, toAck)
	}

	// --- Nack ---
	if len(toNack) > 0 {
		w.nack(ctx, leaseResp.LeaseID, toNack)
	}

	return len(leaseResp.Events)
}

func (w *BatchWorker) publishWithRetry(ctx context.Context, evt *model.BatchCanonicalizationCompletedEvent, topic string, leaseID string) error {
	retryPolicy := retry.Policy{
		MaxAttempts: batchMaxPublishAttempts,
		BaseDelay:   100 * time.Millisecond,
		MaxDelay:    30 * time.Second,
		Multiplier:  2.0,
	}

	return retryPolicy.Do(ctx,
		func(ctx context.Context, attempt retry.Attempt) error {
			err := w.pub.PublishBatchCompleted(ctx, evt, topic)
			if err == nil {
				return nil
			}

			if publisher.IsPoison(err) {
				return &stopRetryError{cause: err, isPoison: true}
			}

			metrics.RetryTotal.WithLabelValues(w.svcCfg.Name + "-batch").Inc()

			w.log.Warn("kafka publish failed, will retry",
				zap.Int("attempt", attempt.Number),
				zap.Int("max_attempts", batchMaxPublishAttempts),
				zap.String("batch_id", evt.BatchID),
				zap.Error(err),
			)
			return err
		},
		func(attempt retry.Attempt, delay time.Duration) {
			w.log.Info("retry backoff",
				zap.Int("attempt", attempt.Number),
				zap.Duration("backoff", delay),
				zap.Error(attempt.LastError),
			)
		},
	)
}

func (w *BatchWorker) recordBatchFailure(ctx context.Context, evt *model.BatchCanonicalizationCompletedEvent, topic string, messageValue []byte, headers []sarama.RecordHeader, attempts int, cause error) bool {
	if w.failureRepo == nil {
		w.log.Error("CRITICAL: no publish-failure repo configured — cannot durably record failure, withholding upstream ack",
			zap.String("batch_id", evt.BatchID),
		)
		return false
	}

	sum := sha256.Sum256(messageValue)
	payloadHash := hex.EncodeToString(sum[:])

	headerBytes, _ := json.Marshal(headers)

	err := w.failureRepo.Record(ctx, services.PublishFailureRecord{
		SourceEventID:    evt.BatchID,
		SourceService:    w.svcCfg.Name + "-batch",
		Topic:            "",
		DestinationTopic: topic,
		PayloadHash:      payloadHash,
		MessageKey:       evt.BatchID,
		MessageValue:     messageValue,
		HeadersJSON:      headerBytes,
		AttemptCount:     attempts,
		FailureClass:     model.ReasonCodeKafkaMaxRetries,
		LastError:        cause.Error(),
		FailureSource:    services.FailureSourceBatch,
		PublishKind:      "batch",
		TenantID:         evt.TenantID,
		TraceID:          "",
		ReplayStatus:     services.ReplayStatusPending,
	})
	if err != nil {
		metrics.PublishFailurePersistErrorTotal.WithLabelValues(w.svcCfg.Name + "-batch").Inc()
		w.log.Error("CRITICAL: failed to durably persist publish failure record — withholding upstream ack",
			zap.String("batch_id", evt.BatchID),
			zap.Error(err),
		)
		return false
	}

	metrics.PublishFailureRecordedTotal.WithLabelValues(w.svcCfg.Name+"-batch", model.ReasonCodeKafkaMaxRetries).Inc()
	return true
}

func (w *BatchWorker) ack(ctx context.Context, leaseID string, batchIDs []string) {
	updated, err := w.batchClient.Ack(ctx, leaseID, batchIDs)
	if err != nil {
		w.log.Error("batch ack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(batchIDs)),
			zap.Error(err),
		)
		metrics.AckTotal.WithLabelValues(w.svcCfg.Name+"-batch", "error").Inc()
		return
	}
	metrics.AckTotal.WithLabelValues(w.svcCfg.Name+"-batch", "success").Inc()
	w.log.Info("acked batch events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *BatchWorker) nack(ctx context.Context, leaseID string, batchIDs []string) {
	updated, err := w.batchClient.Nack(ctx, leaseID, batchIDs)
	if err != nil {
		w.log.Error("batch nack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(batchIDs)),
			zap.Error(err),
		)
		metrics.NackTotal.WithLabelValues(w.svcCfg.Name+"-batch", "error").Inc()
		return
	}
	metrics.NackTotal.WithLabelValues(w.svcCfg.Name+"-batch", "success").Inc()
	w.log.Info("nacked batch events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *BatchWorker) Name() string {
	return w.svcCfg.Name + "-batch"
}
