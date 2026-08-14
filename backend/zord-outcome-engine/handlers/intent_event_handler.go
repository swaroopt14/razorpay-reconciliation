package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

func persistDeadLetter(ctx context.Context, eventID, eventType, schemaVersion, tenantID, traceID string, rawPayload []byte, reason string, stage string) error {
	payloadJSON := string(rawPayload)
	if !json.Valid(rawPayload) {
		wrapped, _ := json.Marshal(string(rawPayload))
		payloadJSON = string(wrapped)
	}

	query := `
		INSERT INTO intent_event_dead_letters (
			event_id, event_type, schema_version, tenant_id, trace_id, raw_payload, rejection_reason, rejection_stage
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	toArg := func(s string) interface{} {
		if s == "" {
			return nil
		}
		return s
	}

	_, err := db.DB.ExecContext(ctx, query,
		toArg(eventID), toArg(eventType), toArg(schemaVersion), toArg(tenantID), toArg(traceID), payloadJSON, reason, stage,
	)

	if err != nil {
		log.Printf("intent_event_dead_letters insert failed error=[%v] stage=%s event_id=%s reason=%s", err, stage, eventID, reason)
		return err
	}

	log.Printf("intent_event.dead_lettered event_id=%s reason=%s stage=%s", eventID, reason, stage)
	return nil
}

func HandleIntentEvent(msg []byte) error {
	var event models.IntentOutboxEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		_ = persistDeadLetter(context.Background(), "", "", "", "", "", msg, fmt.Sprintf("json unmarshal failed: %v", err), "ENVELOPE_UNMARSHAL")
		return err
	}

	log.Printf("intent event consumed [event_id=%s event_type=%s trace_id=%s tenant_id=%s schema_version=%s]",
		event.EventID, event.EventType, event.TraceID, event.TenantID, event.SchemaVersion)

	if strings.TrimSpace(event.EventType) != models.EventTypeIntentCreatedV1 {
		_ = persistDeadLetter(context.Background(), event.EventID, event.EventType, event.SchemaVersion, event.TenantID, event.TraceID, msg, fmt.Sprintf("unsupported event_type %q (expected %q)", event.EventType, models.EventTypeIntentCreatedV1), "UNSUPPORTED_VERSION")
		return nil
	}

	if event.SchemaVersion != models.SchemaVersionV1 {
		_ = persistDeadLetter(context.Background(), event.EventID, event.EventType, event.SchemaVersion, event.TenantID, event.TraceID, msg, fmt.Sprintf("unsupported schema_version %q for event_type %q (expected %q)", event.SchemaVersion, event.EventType, models.SchemaVersionV1), "UNSUPPORTED_VERSION")
		return nil
	}

	var payload models.IntentPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		_ = persistDeadLetter(context.Background(), event.EventID, event.EventType, event.SchemaVersion, event.TenantID, event.TraceID, msg, fmt.Sprintf("payload unmarshal failed: %v", err), "PAYLOAD_UNMARSHAL")
		return err
	}
	if payload.TenantID == "" {
		payload.TenantID = event.TenantID
	}

	intent, err := canonicalIntentFromPayload(payload, event.TraceID)
	if err != nil {
		_ = persistDeadLetter(context.Background(), event.EventID, event.EventType, event.SchemaVersion, event.TenantID, event.TraceID, msg, fmt.Sprintf("canonicalization failed: %v", err), "CANONICALIZATION")
		return err
	}
	if err := upsertCanonicalIntent(context.Background(), intent); err != nil {
		_ = persistDeadLetter(context.Background(), event.EventID, event.EventType, event.SchemaVersion, event.TenantID, event.TraceID, msg, fmt.Sprintf("persistence failed: %v", err), "PERSISTENCE")
		return err
	}
	log.Printf("canonical_intents upserted from topic event_id=%s intent_id=%s", event.EventID, payload.IntentID)
	return nil
}

func parseRequiredUUID(raw string, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s: %w", field, err)
	}
	return id, nil
}
