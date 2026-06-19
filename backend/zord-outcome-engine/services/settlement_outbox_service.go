package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

// SettlementOutboxService manages the emission of durable events for settlement lifecycle.
type SettlementOutboxService struct{}

// EmitForJob manages the creation of durable outbox events for a job.
// It generates two types of events:
// 1. individual 'created' events for each canonical observation.
// 2. 'batch_ready' events for each unique batch reference found in the file.
func (s *SettlementOutboxService) EmitForJob(
	ctx context.Context,
	jobID string,
	tenantID uuid.UUID,
	observations []models.CanonicalSettlementObservation,
	clientBatchID string,
) error {
	log.Printf("settlement.outbox.start job_id=%s count=%d", jobID, len(observations))
	var lastErr error
	batchCount := 0
	var settlementBatchID string

	if err := db.DB.QueryRowContext(ctx, `
		SELECT settlement_batch_id
		FROM settlement_ingest_runs
		WHERE ingest_run_id = $1 AND tenant_id = $2
		LIMIT 1`,
		jobID, tenantID,
	).Scan(&settlementBatchID); err != nil {
		return fmt.Errorf("outbox batch lookup failed: %w", err)
	}

	// 1. Fetch intent details for enrichment if TraceID is present
	intentLookup := make(map[uuid.UUID]struct {
		TenantID uuid.UUID
		TraceID  uuid.UUID
	})

	var intentIDs []uuid.UUID
	for _, obs := range observations {
		if obs.TraceID != nil {
			intentIDs = append(intentIDs, *obs.TraceID)
		}
	}

	if len(intentIDs) > 0 {
		rows, err := db.DB.QueryContext(ctx, `
			SELECT intent_id, tenant_id, trace_id 
			FROM canonical_intents 
			WHERE intent_id = ANY($1)`,
			pq.Array(intentIDs),
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var iid, tid, trid uuid.UUID
				if err := rows.Scan(&iid, &tid, &trid); err == nil {
					intentLookup[iid] = struct {
						TenantID uuid.UUID
						TraceID  uuid.UUID
					}{TenantID: tid, TraceID: trid}
				}
			}
		} else {
			log.Printf("settlement.outbox.intent_lookup_failed err=%v", err)
		}
	}

	// ── EVENT TYPE 1: Observation Created ──────────────────────────────────
	// These events are used to notify systems that a new settled item is available.
	for _, obs := range observations {
		eventID := uuid.New()
		eventTenantID := tenantID
		eventTraceID := uuid.Nil

		if obs.TraceID != nil {
			if info, ok := intentLookup[*obs.TraceID]; ok {
				eventTenantID = info.TenantID
				eventTraceID = info.TraceID
			}
		}

		payload := map[string]interface{}{
			"event_id":             eventID.String(),
			"tenant_id":            eventTenantID.String(),
			"trace_id":             eventTraceID,
			"occurred_at":          time.Now().UTC().Format(time.RFC3339),
			"settlement_id":        obs.SettlementObservationID,
			"batch_id":             obs.ClientBatchID,
			"source_type":          obs.SourceType,
			"source_strength":      obs.SourceStrength,
			"source_system_id":     obs.SourceSystemID,
			"parse_confidence":     obs.ParseConfidence,
			"settled_amount_minor": obs.SettledAmount,
			"currency":             obs.CurrencyCode,
			"settlement_date":      obs.ValueDate,
			"utr":                  obs.BankReference,
			"rrn":                  "null",
			"bank_ref":             obs.BankReference,
			"provider_ref":         obs.ProviderReference,
			"client_ref":           obs.ClientReferenceCandidate,
			"carrier_richness":     obs.CarrierRichnessScore,
			"attachment_readiness": obs.AttachmentReadinessScore,
			"status_observation":   obs.SettlementStatus,
			"ingest_run_id":        obs.IngestRunID,
			"mapping_confidence":   obs.MappingConfidence,
			"bank_id":              obs.BankID,
			"source_system":        obs.SourceSystem,
			"corridor_id":          obs.CorridorID,
		}

		if err := s.insertEvent(ctx, eventID, eventTenantID, eventTraceID, jobID, settlementBatchID, "settlement_observation", obs.SettlementObservationID, "canonical.settlement.created", payload, obs.BankID, &obs.SourceSystem, &obs.CorridorID); err != nil {
			lastErr = err
		}
	}

	// 2. Emit one event for the entire client batch: canonical.settlement.batch_ready
	payload := map[string]interface{}{
		"tenant_id":       tenantID,
		"client_batch_id": clientBatchID,
		"row_count":       len(observations),
		"event":           "batch_ready",
	}

	if err := s.insertEvent(ctx, uuid.New(), tenantID, uuid.Nil, jobID, settlementBatchID, "settlement_observation", uuid.New(), "canonical.settlement.batch_ready", payload, nil, nil, nil); err != nil {
		lastErr = err
	}
	batchCount++

	log.Printf("settlement.outbox.emitted job_id=%s observation_events=%d batch_events=%d", jobID, len(observations), batchCount)
	return lastErr
}

func (s *SettlementOutboxService) insertEvent(
	ctx context.Context,
	eventID uuid.UUID,
	tenantID uuid.UUID,
	traceID uuid.UUID,
	jobID string,
	settlementBatchID string,
	family string,
	entityID uuid.UUID,
	eventType string,
	payload interface{},
	bankID *string,
	sourceSystem *string,
	corridorID *string,
) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("settlement.outbox.marshal_failed type=%s err=%v", eventType, err)
		return err
	}

	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, envelope_id,
			aggregate_type, aggregate_id,
			event_type, payload,
			status, retry_count, created_at,
			bank_id, source_system, corridor_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		eventID, tenantID, traceID, jobID,
		family, entityID,
		eventType, payloadJSON,
		"PENDING", 0, time.Now().UTC(),
		bankID, sourceSystem, corridorID,
	)
	if err != nil {
		log.Printf("settlement.outbox.insert_failed type=%s err=%v", eventType, err)
		return fmt.Errorf("outbox insert failed: %w", err)
	}

	return nil
}
