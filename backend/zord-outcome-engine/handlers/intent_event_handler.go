package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

func HandleIntentEvent(msg []byte) error {
	var event models.IntentOutboxEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		return err
	}

	log.Printf("intent event consumed [event_id=%s event_type=%s trace_id=%s tenant_id=%s]",
		event.EventID, event.EventType, event.TraceID, event.TenantID)

	if !isIntentEvent(event.EventType) {
		return nil
	}

	var payload models.IntentPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return err
	}
	if payload.TenantID == "" {
		payload.TenantID = event.TenantID
	}

	intent, err := canonicalIntentFromPayload(payload)
	if err != nil {
		return err
	}
	if err := upsertCanonicalIntent(context.Background(), intent); err != nil {
		return err
	}
	log.Printf("canonical_intents upserted from topic event_id=%s intent_id=%s", event.EventID, payload.IntentID)
	return nil
}

func isIntentEvent(eventType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(eventType))
	return strings.HasPrefix(normalized, "intent.")
}

func parseRequiredUUID(raw string, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s: %w", field, err)
	}
	return id, nil
}
