package worker

import (
	"context"
	"log"

	"zord-intent-engine/internal/etl"
	"zord-intent-engine/internal/models"
)

// EventSource is the narrow read-only dependency the ETL worker needs — just
// enough to find outbox events that haven't been quality-scored yet. It does
// NOT lease/ack/nack, so it never competes with zord-relay for the same
// PENDING outbox rows. See FetchUnscoredEvents for why that matters.
type EventSource interface {
	FetchUnscoredEvents(ctx context.Context, limit int) ([]models.OutboxEvent, error)
}

// AirflowWorker is called once per Airflow task execution.
// It fetches unscored outbox events and runs ETL quality scoring.
type AirflowWorker struct {
	events    EventSource
	processor *ETLProcessor
}

func NewAirflowWorker(
	events EventSource,
	runRepo *etl.RunRepository,
) *AirflowWorker {
	return &AirflowWorker{
		events:    events,
		processor: NewETLProcessor(runRepo),
	}
}

type RunSummary struct {
	Leased           int
	Accepted         int
	Failed           int
	ParseSuccessRate float64
	BelowThreshold   bool
}

func (w *AirflowWorker) RunOnce(ctx context.Context, limit int) (*RunSummary, error) {
	events, err := w.events.FetchUnscoredEvents(ctx, limit)
	if err != nil {
		return nil, err
	}

	if len(events) == 0 {
		log.Println("[AirflowWorker] no unscored outbox events, nothing to process")
		return &RunSummary{}, nil
	}

	log.Printf("[AirflowWorker] fetched %d unscored events", len(events))

	results := w.processor.ProcessBatch(ctx, events)

	accepted, failed := 0, 0
	for _, r := range results {
		switch r.Status {
		case "ok":
			accepted++
		case "failed":
			failed++
		}
	}

	successRate := 1.0
	if len(events) > 0 {
		successRate = float64(accepted) / float64(len(events))
	}

	return &RunSummary{
		Leased:           len(events),
		Accepted:         accepted,
		Failed:           failed,
		ParseSuccessRate: successRate,
		BelowThreshold:   successRate < etl.ParseSuccessThreshold,
	}, nil
}
