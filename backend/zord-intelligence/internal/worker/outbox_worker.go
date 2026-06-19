package worker

// outbox_worker.go
//
// The outbox worker delivers pending actuation events to Kafka.
// It runs in the background, waking up every 5 seconds.
//
// PHASE 5 ADDITIONS:
//
// 1. EXPIRY SWEEP
//    On every tick, BEFORE fetching outbox entries, the worker calls
//    actionRepo.MarkExpiredContracts() to transition PENDING_APPROVAL
//    contracts whose expires_at has passed to EXPIRED status.
//    This prevents stale approval requests from lingering indefinitely.
//
// 2. APPROVED CONTRACT DELIVERY GATE
//    The outbox table is joined with action_contracts so that entries
//    for PENDING_APPROVAL contracts are skipped by the FetchPending query.
//    Only entries whose contract has contract_status IN ('ACTIVE', 'APPROVED')
//    are fetched. This is enforced at the SQL level in outbox_repo.FetchPending.
//
// 3. BATCH_PATCH_REQUEST and OPS_WEBHOOK routing
//    Two new event type cases added to topicForEventType.
//
// WHY OUTBOX PATTERN?
//    When ZPI creates an ActionContract that needs to trigger another service,
//    it writes to actuation_outbox in the SAME DB transaction as the contract.
//    This worker reads those entries and delivers them to Kafka.
//    If delivery fails, it retries with exponential backoff.
//    Guaranteed delivery, zero message loss.

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	kafkapkg "github.com/zord/zord-intelligence/kafka"
)

// OutboxWorker delivers pending actuation events to Kafka and
// sweeps expired approval windows on every tick.
type OutboxWorker struct {
	outboxRepo *persistence.OutboxRepo
	actionRepo *persistence.ActionContractRepo // PHASE 5: for expiry sweep
	projRepo   *persistence.ProjectionRepo    // for RCA fragment TTL cleanup
	producer   *kafkapkg.Producer
	cfg        *config.Config
}

// NewOutboxWorker creates an OutboxWorker with its dependencies.
//
// PHASE 5: actionRepo is now required for the expiry sweep.
func NewOutboxWorker(
	outboxRepo *persistence.OutboxRepo,
	actionRepo *persistence.ActionContractRepo,
	producer *kafkapkg.Producer,
	cfg *config.Config,
	projRepo *persistence.ProjectionRepo,
) *OutboxWorker {
	return &OutboxWorker{
		outboxRepo: outboxRepo,
		actionRepo: actionRepo,
		projRepo:   projRepo,
		producer:   producer,
		cfg:        cfg,
	}
}

// Start runs the outbox delivery loop until ctx is cancelled.
// Call this in a goroutine from main.go:
//
//	go outboxWorker.Start(ctx)
func (w *OutboxWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	logger.Info("outbox_worker: started (interval=5s)")

	// Run once immediately before the first tick so startup isn't delayed.
	w.runOnce(ctx)

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			logger.Info("outbox_worker: shutting down")
			return
		}
	}
}

// runOnce performs one complete outbox cycle:
//   1. Sweep expired PENDING_APPROVAL contracts → EXPIRED (PHASE 5)
//   2. Fetch ready outbox entries and deliver them to Kafka
func (w *OutboxWorker) runOnce(ctx context.Context) {
	// Clean up stale RCA fragment rows older than 10 minutes.
	// Fragments are temporary per-intent accumulation rows created while a
	// batch's events are arriving. They must not accumulate indefinitely.
	// 10 minutes is comfortably longer than any batch processing window.
	if _, err := w.projRepo.CleanupStaleRCAFragments(ctx, 10*time.Minute); err != nil {
		logger.Error(fmt.Sprintf("outbox_worker: rca fragment cleanup error: %v", err))
	}

	// PHASE 5: Expire stale approval windows FIRST.
	// We do this before fetching deliverable entries so that any entries
	// whose contract just expired are cleanly excluded from delivery.
	if expired, err := w.actionRepo.MarkExpiredContracts(ctx); err != nil {
		logger.Error(fmt.Sprintf("outbox_worker: expiry sweep error: %v", err))
	} else if expired > 0 {
		logger.Info(fmt.Sprintf("outbox_worker: expired %d stale approval contracts", expired))
	}

	// Fetch up to 50 entries ready for delivery.
	// FetchPending only returns entries for ACTIVE or APPROVED contracts
	// (the SQL join enforces this — see outbox_repo.go).
	entries, err := w.outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		logger.Error(fmt.Sprintf("outbox_worker: fetch error: %v", err))
		return
	}

	logger.Info(fmt.Sprintf("outbox_worker: pending_depth=%d", len(entries)))

	if len(entries) == 0 {
		return
	}

	logger.Info(fmt.Sprintf("outbox_worker: processing %d entries", len(entries)))

	// Bounded goroutine pool: at most 10 concurrent Kafka publishes.
	// Parallel delivery removes the sequential Kafka-RTT bottleneck (~20ms × 50 entries = 1s saved per tick).
	// WaitGroup ensures all deliveries complete before the next tick starts.
	const deliveryPoolSize = 10
	sem := make(chan struct{}, deliveryPoolSize)
	var wg sync.WaitGroup
	for _, entry := range entries {
		e := entry // capture loop variable before goroutine launch
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			w.deliver(ctx, e)
		}()
	}
	wg.Wait()
}

// deliver sends one outbox entry to the correct Kafka topic.
func (w *OutboxWorker) deliver(ctx context.Context, entry models.ActuationOutbox) {
	topic, err := w.topicForEventType(entry.EventType)
	if err != nil {
		logger.Error(fmt.Sprintf("outbox_worker: unknown event_type=%s for event=%s — marking failed",
			entry.EventType, entry.EventID))
		_ = w.outboxRepo.MarkFailed(ctx, entry.EventID)
		return
	}

	// Key = entry.ActionID ensures ordering: all events for the same action
	// go to the same Kafka partition.
	publishErr := w.producer.Publish(ctx, topic, entry.ActionID, entry.Payload)
	if publishErr != nil {
		logger.Error(fmt.Sprintf("outbox_worker: publish failed event=%s topic=%s attempt=%d: %v",
			entry.EventID, topic, entry.Attempts+1, publishErr))
		if err := w.outboxRepo.MarkFailed(ctx, entry.EventID); err != nil {
			logger.Error(fmt.Sprintf("outbox_worker: mark_failed error event=%s: %v", entry.EventID, err))
		}
		return
	}

	// Delivery succeeded — mark as SENT.
	// ON CONFLICT DO NOTHING in MarkSent means a retry after a crash is harmless.
	if err := w.outboxRepo.MarkSent(ctx, entry.EventID); err != nil {
		logger.Error(fmt.Sprintf("outbox_worker: mark_sent error event=%s: %v", entry.EventID, err))
	}

	logger.Info(fmt.Sprintf("outbox_worker: delivered event=%s action=%s topic=%s",
		entry.EventID, entry.ActionID, topic))
}

// topicForEventType maps an event type to the correct Kafka output topic.
//
// ROUTING LOGIC:
//   TopicActuationRetry      → Service 4 (retry a payout)
//   TopicActuationEvidence   → Service 6 (generate/regenerate evidence pack)
//   TopicActuationBatchPatch → client-facing API (batch patch request)
//   TopicActuationAlert      → notification service (ops alerts, advisories)
//
// PHASE 5: Added BATCH_PATCH_REQUEST and OPS_WEBHOOK cases.
//
// HOW TO ADD A NEW EVENT TYPE:
//   1. Add the Decision constant to internal/models/policy.go
//   2. Add the Kafka topic field to config/config.go (if a new topic is needed)
//   3. Add a case here mapping decision → topic
//   4. Add the topic to requiredTopics in cmd/main.go
func (w *OutboxWorker) topicForEventType(eventType string) (string, error) {
	switch eventType {

	// ── RETRY → Service 4 ─────────────────────────────────────────────────
	case string(models.DecisionRetry):
		return w.cfg.TopicActuationRetry, nil

	// ── EVIDENCE → Service 6 ─────────────────────────────────────────────
	case string(models.DecisionGenerateEvidence),
		string(models.DecisionRegenerateEvidence):
		// REGENERATE_EVIDENCE is a more targeted rebuild of an existing pack.
		// Both go to the same Service 6 topic; Service 6 distinguishes via payload.
		return w.cfg.TopicActuationEvidence, nil

	// ── BATCH PATCH → client-facing API ──────────────────────────────────
	case string(models.DecisionRequestSourcePatch):
		// A structured request to the tenant's source system ops team.
		// The client-facing API service reads this and routes to the tenant webhook.
		return w.cfg.TopicActuationBatchPatch, nil

	// ── PHASE 5: OPS_WEBHOOK → tenant-configured webhook ─────────────────
	// OPS_WEBHOOK is a generic outbox event type for tenant-configured webhooks.
	// It routes to the batch patch topic because that topic is consumed by the
	// client-facing API service which handles all tenant-directed notifications.
	// In a future phase this will get its own dedicated topic.
	case "OPS_WEBHOOK",
		"BATCH_PATCH_REQUEST":
		return w.cfg.TopicActuationBatchPatch, nil

	// ── ALERT → notification service ─────────────────────────────────────
	// All ops-facing advisory and alerting decisions route here.
	// The notification service reads this and routes to Slack / email / PagerDuty.
	case string(models.DecisionEscalate),
		string(models.DecisionNotify),
		string(models.DecisionOpenOpsIncident),
		string(models.DecisionHold),
		string(models.DecisionAllow),
		string(models.DecisionAdvisoryRecommendation),
		string(models.DecisionReviewAmbiguousBatch),
		string(models.DecisionPrepareAndSignRecommended),
		string(models.DecisionDispatchModeRecommended),
		string(models.DecisionRequestStrongerCarrierContract):
		return w.cfg.TopicActuationAlert, nil
	}

	return "", fmt.Errorf("no topic configured for event_type=%s", eventType)
}
