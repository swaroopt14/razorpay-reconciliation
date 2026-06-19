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

type DLQWorker struct {
	svcCfg    config.ServiceConfig
	relayCfg  config.RelayConfig
	dlqClient *client.DLQClient
	pub       publisher.Publisher
	sema      *semaphore.Weighted
	log       *zap.Logger
}

func NewDLQWorker(
	svcCfg config.ServiceConfig,
	relayCfg config.RelayConfig,
	pub publisher.Publisher,
	log *zap.Logger,
) *DLQWorker {
	workerLog := log.With(zap.String("service_dlq", svcCfg.Name))

	dlqClient := client.NewDLQClient(
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

	return &DLQWorker{
		svcCfg:    svcCfg,
		relayCfg:  relayCfg,
		dlqClient: dlqClient,
		pub:       pub,
		sema:      semaphore.NewWeighted(concurrency),
		log:       workerLog,
	}
}

func (w *DLQWorker) Run(ctx context.Context) {
	w.log.Info("DLQ worker started")
	metrics.WorkerUp.WithLabelValues(w.svcCfg.Name).Set(1)
	defer func() {
		metrics.WorkerUp.WithLabelValues(w.svcCfg.Name).Set(0)
		w.log.Info("DLQ worker stopped")
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
		metrics.PollCycleTotal.WithLabelValues(w.svcCfg.Name).Inc()

		if processed == 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(pollInterval):
			}
		}
	}
}

func (w *DLQWorker) runCycle(ctx context.Context) int {
	ctx, span := tracing.Tracer().Start(ctx, "dlq_worker.poll_cycle",
		trace.WithAttributes(attribute.String("service", w.svcCfg.Name)),
	)
	defer span.End()

	log := w.log

	// --- Lease ---
	leaseResp, err := w.dlqClient.Lease(ctx, w.relayCfg.LeaseLimit, w.relayCfg.LeaseTTLSeconds)
	if err != nil {
		log.Error("dlq lease call failed", zap.Error(err))
		metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		return 0
	}

	if len(leaseResp.Events) == 0 {
		metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name, "empty").Inc()
		metrics.BacklogGauge.WithLabelValues(w.svcCfg.Name).Set(0)
		return 0
	}

	metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name, "success").Inc()
	metrics.LeaseBatchSize.WithLabelValues(w.svcCfg.Name).Observe(float64(len(leaseResp.Events)))
	metrics.BacklogGauge.WithLabelValues(w.svcCfg.Name).Set(float64(len(leaseResp.Events)))
	metrics.InFlightPublishes.WithLabelValues(w.svcCfg.Name).Add(float64(len(leaseResp.Events)))
	defer metrics.InFlightPublishes.WithLabelValues(w.svcCfg.Name).Sub(float64(len(leaseResp.Events)))

	log.Info("leased dlq batch",
		zap.Int("count", len(leaseResp.Events)),
		zap.String("lease_id", leaseResp.LeaseID),
	)

	// --- Publish ---
	var (
		toAck  []string
		toNack []string
	)

	topic := w.svcCfg.DefaultTopic

	for i := range leaseResp.Events {
		evt := &leaseResp.Events[i]

		err := w.pub.PublishDLQItem(ctx, evt, topic)
		if err == nil {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name, topic, "success").Inc()
			log.Info("dlq event published successfully", zap.String("topic", topic), zap.String("dlq_id", evt.DLQID))
			toAck = append(toAck, evt.DLQID)
		} else {
			metrics.PublishTotal.WithLabelValues(w.svcCfg.Name, topic, "error").Inc()
			log.Error("failed to publish dlq event", zap.String("dlq_id", evt.DLQID), zap.Error(err))
			toNack = append(toNack, evt.DLQID)
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

func (w *DLQWorker) ack(ctx context.Context, leaseID string, dlqIDs []string) {
	updated, err := w.dlqClient.Ack(ctx, leaseID, dlqIDs)
	if err != nil {
		w.log.Error("dlq ack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(dlqIDs)),
			zap.Error(err),
		)
		metrics.AckTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		return
	}
	metrics.AckTotal.WithLabelValues(w.svcCfg.Name, "success").Inc()
	w.log.Info("acked dlq events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *DLQWorker) nack(ctx context.Context, leaseID string, dlqIDs []string) {
	updated, err := w.dlqClient.Nack(ctx, leaseID, dlqIDs)
	if err != nil {
		w.log.Error("dlq nack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(dlqIDs)),
			zap.Error(err),
		)
		metrics.NackTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		return
	}
	metrics.NackTotal.WithLabelValues(w.svcCfg.Name, "success").Inc()
	w.log.Info("nacked dlq events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *DLQWorker) Name() string {
	return w.svcCfg.Name
}
