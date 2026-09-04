package worker

import (
	"context"
	"log"

	"github.com/google/uuid"

	"zord-intent-engine/internal/etl"
	"zord-intent-engine/internal/models"
)

// ETLProcessor runs the post-canonicalization ETL pipeline for a batch
// of already-processed OutboxEvents. Decrypt has already happened.
// This is Stage 6–12 of the Zord ETL doc for the intent side.
type ETLProcessor struct {
	runRepo *etl.RunRepository
}

func NewETLProcessor(runRepo *etl.RunRepository) *ETLProcessor {
	return &ETLProcessor{runRepo: runRepo}
}

type EventResult struct {
	OutboxEventID string
	EnvelopeID    string
	RunID         uuid.UUID
	QualityScore  float64
	Status        string // "ok" | "failed"
	Error         string
}

// ProcessBatch runs ETL scoring and run tracking for each leased OutboxEvent.
func (p *ETLProcessor) ProcessBatch(ctx context.Context, events []models.OutboxEvent) []EventResult {
	results := make([]EventResult, 0, len(events))
	for _, ev := range events {
		results = append(results, p.processOne(ctx, ev))
	}
	return results
}

func (p *ETLProcessor) processOne(ctx context.Context, ev models.OutboxEvent) EventResult {
	tenantID, _ := uuid.Parse(ev.TenantID)
	envelopeID, _ := uuid.Parse(ev.EnvelopeID)

	// Step 1: Create ETL ingest run for this event
	run := etl.ETLIngestRun{
		TenantID:         tenantID,
		EnvelopeID:       envelopeID,
		OutboxEventID:    ev.EventID,
		BatchID:          ev.BatchID,
		ArtifactFamily:   "PAYOUT_INTENT",
		SourceSystem:     ev.SourceSystem,
		MappingProfileID: ev.MappingProfileID,
		ParserVersion:    "v1",
		RunGeneration:    1,
	}

	// Set IntentID if available
	if ev.IntentID != "" {
		if id, err := uuid.Parse(ev.IntentID); err == nil {
			run.IntentID = &id
		}
	}

	runID, err := p.runRepo.CreateRun(ctx, run)
	if err != nil {
		log.Printf("[ETLProcessor] CreateRun failed envelope=%s: %v", ev.EnvelopeID, err)
		return EventResult{OutboxEventID: ev.EventID, EnvelopeID: ev.EnvelopeID, Status: "failed", Error: err.Error()}
	}

	// Step 2: Quality gate — scores the already-canonical event
	// This is Stage 7+8 of ETL doc. No re-processing, no decryption.
	qr := etl.ScoreEvent(ev)
	qr.RunID = runID
	qr.TenantID = tenantID

	// Step 3: Persist quality result
	if saveErr := p.runRepo.SaveQualityResult(ctx, qr); saveErr != nil {
		log.Printf("[ETLProcessor] SaveQualityResult failed run=%s: %v", runID, saveErr)
	}

	// Step 4: Complete or fail the run based on quality gate
	if qr.Status == "FAIL" {
		_ = p.runRepo.FailRun(ctx, runID, "QUALITY_GATE_FAILED")
		return EventResult{
			OutboxEventID: ev.EventID,
			EnvelopeID:    ev.EnvelopeID,
			RunID:         runID,
			QualityScore:  qr.QualityScore,
			Status:        "failed",
			Error:         "quality gate FAIL",
		}
	}

	_ = p.runRepo.CompleteRun(ctx, runID, qr)

	log.Printf("[ETLProcessor] ETL run completed run_id=%s envelope=%s quality=%.2f status=%s",
		runID, ev.EnvelopeID, qr.QualityScore, qr.Status)

	return EventResult{
		OutboxEventID: ev.EventID,
		EnvelopeID:    ev.EnvelopeID,
		RunID:         runID,
		QualityScore:  qr.QualityScore,
		Status:        "ok",
	}
}
