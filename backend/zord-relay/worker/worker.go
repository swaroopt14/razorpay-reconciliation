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
	"zord-relay/model"
	"zord-relay/publisher"
	"zord-relay/tracing"
)

// Worker owns the poll loop for a single upstream service.
// It leases events → publishes to Kafka → acks or nacks, in a tight loop.
// Backpressure is handled via a weighted semaphore: if Kafka is saturated,
// no new leases are taken until in-flight publishes complete.
type Worker struct {
	svcCfg     config.ServiceConfig
	relayCfg   config.RelayConfig
	outbox     *client.OutboxClient
	proc       *processor
	sema       *semaphore.Weighted
	log        *zap.Logger
}

// NewWorker constructs a Worker for one upstream service.
func NewWorker(
	svcCfg config.ServiceConfig,
	relayCfg config.RelayConfig,
	pub publisher.Publisher,
	log *zap.Logger,
) *Worker {
	workerLog := log.With(zap.String("service", svcCfg.Name))

	outboxClient := client.NewOutboxClient(
		svcCfg.Name,
		svcCfg.BaseURL,
		svcCfg.AuthToken,
		relayCfg.InstanceID,
		svcCfg.HTTPTimeout,
		workerLog,
	)

	proc := newProcessor(pub, svcCfg, relayCfg.InstanceID, workerLog)

	concurrency := int64(relayCfg.MaxPublishConcurrency)
	if concurrency <= 0 {
		concurrency = 10
	}

	return &Worker{
		svcCfg:   svcCfg,
		relayCfg: relayCfg,
		outbox:   outboxClient,
		proc:     proc,
		sema:     semaphore.NewWeighted(concurrency),
		log:      workerLog,
	}
}

// Run starts the poll loop. It blocks until ctx is cancelled.
// Designed to run in its own goroutine (one per service).
func (w *Worker) Run(ctx context.Context) {
	w.log.Info("worker started")
	metrics.WorkerUp.WithLabelValues(w.svcCfg.Name).Set(1)
	defer func() {
		metrics.WorkerUp.WithLabelValues(w.svcCfg.Name).Set(0)
		w.log.Info("worker stopped")
	}()

	pollInterval := w.relayCfg.PollInterval
	if pollInterval <= 0 {
		pollInterval = 2 * time.Second
	}

	for {
		if ctx.Err() != nil {
			return
		}

		// Acquire semaphore BEFORE leasing — this is the backpressure gate.
		// If all concurrency slots are occupied (Kafka is slow), we block here
		// rather than leasing more work we can't process.
		if err := w.sema.Acquire(ctx, 1); err != nil {
			// ctx cancelled
			return
		}

		processed := w.runCycle(ctx)

		w.sema.Release(1)
		metrics.PollCycleTotal.WithLabelValues(w.svcCfg.Name).Inc()

		if processed == 0 {
			// Empty batch — back off to avoid hammering the upstream service.
			select {
			case <-ctx.Done():
				return
			case <-time.After(pollInterval):
			}
		}
		// Non-empty batch: loop immediately to drain the backlog faster.
	}
}

// runCycle executes one full lease → publish → ack/nack cycle.
// Returns the number of events processed (0 = empty batch).
func (w *Worker) runCycle(ctx context.Context) int {
	ctx, span := tracing.Tracer().Start(ctx, "worker.poll_cycle",
		trace.WithAttributes(attribute.String("service", w.svcCfg.Name)),
	)
	defer span.End()

	log := w.log

	// --- Lease ---
	leaseResp, err := w.outbox.Lease(ctx, w.relayCfg.LeaseLimit, w.relayCfg.LeaseTTLSeconds)
	if err != nil {
		log.Error("lease call failed", zap.Error(err))
		metrics.LeaseTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		// Back off organically; the caller's empty-batch sleep handles pacing.
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

	log.Info("leased batch",
		zap.Int("count", len(leaseResp.Events)),
		zap.String("lease_id", leaseResp.LeaseID),
	)

	// --- Publish ---
	var (
		toAck   []string
		toNack  []string
	)

	for i := range leaseResp.Events {
		evt := &leaseResp.Events[i]
		result := w.proc.process(ctx, evt)

		switch {
		case result.success:
			toAck = append(toAck, result.eventID)
		case result.isPoison:
			// Poison events: ack them out of the outbox so they don't
			// re-enter the lease cycle. They are already on the poison DLQ.
			toAck = append(toAck, result.eventID)
			log.Warn("poison event acked from outbox and routed to DLQ",
				zap.String("event_id", result.eventID),
			)
		default:
			// Transient Kafka failure after max retries → nack.
			toNack = append(toNack, result.eventID)
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

func (w *Worker) ack(ctx context.Context, leaseID string, eventIDs []string) {
	updated, err := w.outbox.Ack(ctx, leaseID, eventIDs)
	if err != nil {
		w.log.Error("ack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(eventIDs)),
			zap.Error(err),
		)
		metrics.AckTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		return
	}
	metrics.AckTotal.WithLabelValues(w.svcCfg.Name, "success").Inc()
	w.log.Info("acked events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *Worker) nack(ctx context.Context, leaseID string, eventIDs []string) {
	req := model.NackRequest{
		LeaseID:       leaseID,
		EventIDs:      eventIDs,
		FailureReason: "kafka_publish_failure",
	}
	updated, err := w.outbox.Nack(ctx, req)
	if err != nil {
		w.log.Error("nack call failed",
			zap.String("lease_id", leaseID),
			zap.Int("count", len(eventIDs)),
			zap.Error(err),
		)
		metrics.NackTotal.WithLabelValues(w.svcCfg.Name, "error").Inc()
		return
	}
	metrics.NackTotal.WithLabelValues(w.svcCfg.Name, "success").Inc()
	w.log.Info("nacked events", zap.Int64("updated", updated), zap.String("lease_id", leaseID))
}

func (w *Worker) Name() string {
	return w.svcCfg.Name
}
