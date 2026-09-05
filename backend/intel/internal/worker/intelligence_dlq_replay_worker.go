package worker

// intelligence_dlq_replay_worker.go
//
// INTEL-07: replays intelligence_dlq_local_receipts rows to
// cfg.TopicIntelligenceDLQ. kafka/consumer.go writes a receipt to that table
// (instead of publishing to Kafka directly) the moment an inbound event
// permanently fails, so a Kafka broker outage can no longer block message
// consumption — this worker is what eventually gets those failure records
// onto the real DLQ topic once Kafka is reachable again.
//
// WHY A SEPARATE WORKER INSTEAD OF REUSING OutboxWorker?
// OutboxWorker's job is delivering actuation decisions with a bounded
// 5-attempt backoff before dead-lettering. This worker has no such terminal
// state — a receipt is retried every tick, forever, until it succeeds, since
// the record must eventually reach the DLQ topic (there is nowhere further
// for it to go). Different retry semantics, same "read → publish → mark"
// shape as outbox_worker.go's deliver().
import (
	"context"
	"fmt"
	"time"

	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	kafkapkg "github.com/zord/zord-intelligence/kafka"
)

// IntelligenceDLQReplayWorker replays locally-stored inbound DLQ receipts to
// Kafka and raises a stall alert when the oldest unreplayed receipt has been
// waiting past cfg.IntelligenceDLQReplayStallThresholdSeconds.
type IntelligenceDLQReplayWorker struct {
	repo     *persistence.IntelligenceDLQLocalRepo
	producer *kafkapkg.Producer
	cfg      *config.Config
}

// NewIntelligenceDLQReplayWorker creates an IntelligenceDLQReplayWorker.
func NewIntelligenceDLQReplayWorker(
	repo *persistence.IntelligenceDLQLocalRepo,
	producer *kafkapkg.Producer,
	cfg *config.Config,
) *IntelligenceDLQReplayWorker {
	return &IntelligenceDLQReplayWorker{repo: repo, producer: producer, cfg: cfg}
}

// Start runs the replay loop until ctx is cancelled.
// Call this in a goroutine from main.go:
//
//	go intelDLQReplayWorker.Start(ctx)
func (w *IntelligenceDLQReplayWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	logger.Info("intelligence_dlq_replay_worker: started (interval=5s)")

	w.runOnce(ctx)

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			logger.Info("intelligence_dlq_replay_worker: shutting down")
			return
		}
	}
}

// runOnce fetches pending receipts, attempts to replay each to Kafka, and
// checks whether the oldest pending receipt has crossed the stall threshold.
func (w *IntelligenceDLQReplayWorker) runOnce(ctx context.Context) {
	w.checkStall(ctx)

	receipts, err := w.repo.FetchPending(ctx, 50)
	if err != nil {
		logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: fetch error: %v", err))
		return
	}
	if len(receipts) == 0 {
		return
	}

	logger.Info(fmt.Sprintf("intelligence_dlq_replay_worker: replaying %d receipts", len(receipts)))

	for _, r := range receipts {
		w.replay(ctx, r)
	}
}

// replay publishes one receipt's record to cfg.TopicIntelligenceDLQ and
// marks it replayed on success. On failure it just logs and leaves the row
// pending — the next tick retries. No attempt cap: unlike outbound actuation
// delivery, there is no valid terminal "give up" state for an inbound DLQ
// record.
func (w *IntelligenceDLQReplayWorker) replay(ctx context.Context, r models.LocalDLQReceipt) {
	if err := w.producer.Publish(ctx, w.cfg.TopicIntelligenceDLQ, r.Record.TenantID, r.Record); err != nil {
		logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: publish failed id=%d source_topic=%s offset=%d attempt=%d: %v",
			r.ID, r.Record.SourceTopic, r.Record.Offset, r.Attempts+1, err))
		if merr := w.repo.MarkReplayFailed(ctx, r.ID, err.Error()); merr != nil {
			logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: mark_replay_failed error id=%d: %v", r.ID, merr))
		}
		return
	}

	if err := w.repo.MarkReplayed(ctx, r.ID); err != nil {
		logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: mark_replayed error id=%d: %v", r.ID, err))
		return
	}

	logger.Info(fmt.Sprintf("intelligence_dlq_replay_worker: replayed id=%d source_topic=%s offset=%d",
		r.ID, r.Record.SourceTopic, r.Record.Offset))
}

// checkStall logs a CRITICAL alert once per tick while the oldest pending
// receipt has been waiting longer than the configured threshold — the
// operator-facing signal that INTEL-07's acceptance criteria call for
// ("alert partition stall"), distinct from the per-receipt error logs above.
func (w *IntelligenceDLQReplayWorker) checkStall(ctx context.Context) {
	age, count, ok, err := w.repo.OldestPendingAge(ctx)
	if err != nil {
		logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: stall check error: %v", err))
		return
	}
	if !ok {
		return
	}
	threshold := time.Duration(w.cfg.IntelligenceDLQReplayStallThresholdSeconds) * time.Second
	if age >= threshold {
		logger.Error(fmt.Sprintf("intelligence_dlq_replay_worker: CRITICAL dlq replay stall — %d receipt(s) pending, oldest waiting %s (threshold %s)",
			count, age.Round(time.Second), threshold))
	}
}
