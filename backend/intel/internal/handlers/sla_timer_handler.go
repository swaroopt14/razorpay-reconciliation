package handlers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

type SLATimerHandler struct {
	projectionRepo *persistence.ProjectionRepo
}

func NewSLATimerHandler(repo *persistence.ProjectionRepo) *SLATimerHandler {
	return &SLATimerHandler{projectionRepo: repo}
}

func (h *SLATimerHandler) HandleSLATimerTick(
	ctx context.Context,
	e models.SLATimerTickEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := h.projectionRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleSLATimerTick IsProcessed event_id=%s: %w", e.EventID, err)
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
	key := fmt.Sprintf("corridor.sla_tick.%s", e.CorridorID)

	value := struct {
		LastTick time.Time `json:"last_tick"`
	}{
		LastTick: tickAt,
	}

	if err := h.projectionRepo.UpsertWithValue(ctx, e.TenantID, key, windowStart, windowEnd, value); err != nil {
		return err
	}

	if err := h.projectionRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleSLATimerTick MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}
