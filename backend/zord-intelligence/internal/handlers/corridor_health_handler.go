package handlers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

type CorridorHealthHandler struct {
	projectionRepo *persistence.ProjectionRepo
}

func NewCorridorHealthHandler(repo *persistence.ProjectionRepo) *CorridorHealthHandler {
	return &CorridorHealthHandler{projectionRepo: repo}
}

func (h *CorridorHealthHandler) HandleCorridorHealthTick(
	ctx context.Context,
	e models.CorridorHealthTickEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := h.projectionRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleCorridorHealthTick IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	tickAt := e.TickAt.UTC()
	if tickAt.IsZero() {
		tickAt = time.Now().UTC()
	}

	windowStart := tickAt.Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)
	key := fmt.Sprintf("corridor.health_status.%s", e.CorridorID)

	value := struct {
		LastTick time.Time `json:"last_tick"`
		Status   string    `json:"status"`
	}{
		LastTick: tickAt,
		Status:   "OK",
	}

	if err := h.projectionRepo.UpsertWithValue(ctx, e.TenantID, key, windowStart, windowEnd, value); err != nil {
		return err
	}

	if err := h.projectionRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleCorridorHealthTick MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

type KafkaIngestionHandler struct {
	*services.ProjectionService
	corridorHealthHandler *CorridorHealthHandler
	slaTimerHandler       *SLATimerHandler
}

func NewKafkaIngestionHandler(
	projectionService *services.ProjectionService,
	corridorHealthHandler *CorridorHealthHandler,
	slaTimerHandler *SLATimerHandler,
) *KafkaIngestionHandler {
	return &KafkaIngestionHandler{
		ProjectionService:     projectionService,
		corridorHealthHandler: corridorHealthHandler,
		slaTimerHandler:       slaTimerHandler,
	}
}

func (h *KafkaIngestionHandler) HandleCorridorHealthTick(
	ctx context.Context,
	e models.CorridorHealthTickEvent,
) error {
	if h.corridorHealthHandler == nil {
		return nil
	}
	return h.corridorHealthHandler.HandleCorridorHealthTick(ctx, e)
}

func (h *KafkaIngestionHandler) HandleSLATimerTick(
	ctx context.Context,
	e models.SLATimerTickEvent,
) error {
	if h.slaTimerHandler == nil {
		return nil
	}
	return h.slaTimerHandler.HandleSLATimerTick(ctx, e)
}

// =============================================================================
// Grade A stub handlers — Phase 2
// =============================================================================
//
// WHAT IS A STUB?
// A stub is a method that has the correct signature but does minimal work.
// We need stubs here because:
//
//   1. kafka/consumer.go's EventHandler interface NOW requires these 5 methods.
//   2. KafkaIngestionHandler embeds *services.ProjectionService, which means
//      it inherits all methods of ProjectionService.
//   3. We are adding the 5 new methods to ProjectionService in this Phase 2
//      step so the interface is satisfied.
//
// These stubs simply delegate to the embedded ProjectionService.
// The actual computation logic (leakage formulas, ambiguity scoring, etc.)
// is added to ProjectionService in Phase 4.
//
// WHY DELEGATE INSTEAD OF COMPUTING HERE?
// KafkaIngestionHandler is in the "handlers" package — it should only route
// events, not compute business logic. Business logic belongs in "services".
// This separation is called "separation of concerns" — a core design principle.
// =============================================================================

// HandleSettlementCreated delegates to ProjectionService.
// ProjectionService.HandleSettlementCreated stub logs the event and marks
// it as processed (idempotency). Full leakage logic added in Phase 4.
func (h *KafkaIngestionHandler) HandleSettlementCreated(
	ctx context.Context,
	e models.CanonicalSettlementCreatedEvent,
) error {
	return h.ProjectionService.HandleSettlementCreated(ctx, e)
}

// HandleAttachmentDecision delegates to ProjectionService.
// This is the most important new event for leakage and ambiguity intelligence.
func (h *KafkaIngestionHandler) HandleAttachmentDecision(
	ctx context.Context,
	e models.AttachmentDecisionCreatedEvent,
) error {
	return h.ProjectionService.HandleAttachmentDecision(ctx, e)
}

// HandleVarianceRecord delegates to ProjectionService.
// Variance records are the direct source of leakage amount data.
func (h *KafkaIngestionHandler) HandleVarianceRecord(
	ctx context.Context,
	e models.VarianceRecordCreatedEvent,
) error {
	return h.ProjectionService.HandleVarianceRecord(ctx, e)
}

// HandleBatchSummaryUpdated delegates to ProjectionService.
// Batch summaries feed batch_contracts table and Pattern intelligence.
func (h *KafkaIngestionHandler) HandleBatchSummaryUpdated(
	ctx context.Context,
	e models.BatchSummaryUpdatedEvent,
) error {
	return h.ProjectionService.HandleBatchSummaryUpdated(ctx, e)
}

// HandleGovernanceDecision delegates to ProjectionService.
// Governance decisions feed the defensibility score calculation.
func (h *KafkaIngestionHandler) HandleGovernanceDecision(
	ctx context.Context,
	e models.GovernanceDecisionCreatedEvent,
) error {
	return h.ProjectionService.HandleGovernanceDecision(ctx, e)
}
