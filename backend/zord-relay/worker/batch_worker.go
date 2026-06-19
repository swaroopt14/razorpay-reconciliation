package worker

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"

	"zord-relay/client"
	"zord-relay/config"
	"zord-relay/metrics"
	"zord-relay/publisher"
	"zord-relay/tracing"
)

type BatchWorker struct {
	svcCfg      config.ServiceConfig
	relayCfg    config.RelayConfig
	batchClient *client.BatchClient
	pub         publisher.Publisher
	sema        *semaphore.Weighted
	log         *zap.Logger
}

func NewBatchWorker(
	svcCfg config.ServiceConfig,
	relayCfg config.RelayConfig,
	pub publisher.Publisher,
	log *zap.Logger,
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

		err := w.pub.PublishBatchCompleted(ctx, evt, topic)
		if err == nil {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name+"-batch", topic, "success").Inc()
			log.Info("batch completed event published successfully", zap.String("topic", topic), zap.String("batch_id", evt.BatchID))
			toAck = append(toAck, evt.BatchID)
		} else {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name+"-batch", topic, "error").Inc()
			log.Error("failed to publish batch completed event", zap.String("batch_id", evt.BatchID), zap.Error(err))
			toNack = append(toNack, evt.BatchID)
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
