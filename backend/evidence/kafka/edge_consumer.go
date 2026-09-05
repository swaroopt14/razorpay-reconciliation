package kafka

import (
	"context"
	"encoding/json"
	"log"
	"zord-evidence/models"
)

// StartEdgeConsumer starts a consumer for payments.ledger.events.v1
func StartEdgeConsumer(
	ctx context.Context,
	brokers []string,
	groupID string,
	topic string,
	pg PackGenerator,
) (*ConsumerHandle, error) {
	log.Printf("edge.consumer.start group=%s topic=%s brokers=%v", groupID, topic, brokers)
	return StartConsumer(ctx, brokers, groupID, topic, buildEdgeHandler(pg))
}

func buildEdgeHandler(pg PackGenerator) MessageHandler {
	topic := "payments.ledger.events.v1"
	return func(ctx context.Context, key string, raw []byte) error {
		var relayEvt models.RelayEvent
		if err := json.Unmarshal(raw, &relayEvt); err != nil {
			log.Printf("edge.consumer.parse_failed key=%s err=%v", key, err)
			pg.RecordMalformedEvent(ctx, "", topic, key, "", "JSON parse failed: "+err.Error())
			return nil
		}

		if relayEvt.TenantID == "" || relayEvt.EnvelopeID == "" || len(relayEvt.EnvelopeHash) == 0 {
			reason := "missing required fields"
			log.Printf("edge.consumer.missing_data tenant=%s env=%s hash_len=%d", relayEvt.TenantID, relayEvt.EnvelopeID, len(relayEvt.EnvelopeHash))
			pg.RecordMalformedEvent(ctx, relayEvt.TenantID, topic, relayEvt.EventID, relayEvt.TraceID, reason)
			return nil
		}

		// Map schema_version/event_version from the upstream envelope rather
		// than hardcoding them — no fallback, just log if missing so gaps in
		// upstream instrumentation are visible instead of silently masked.
		sv := relayEvt.SchemaVersion
		if sv == "" {
			log.Printf("edge.consumer.missing_schema_version key=%s envelope=%s event_id=%s", key, relayEvt.EnvelopeID, relayEvt.EventID)
		}
		ev := relayEvt.EventVersion
		if ev == "" {
			log.Printf("edge.consumer.missing_event_version key=%s envelope=%s event_id=%s", key, relayEvt.EnvelopeID, relayEvt.EventID)
		}
		if relayEvt.TraceID == "" {
			log.Printf("edge.consumer.missing_trace_id key=%s envelope=%s event_id=%s", key, relayEvt.EnvelopeID, relayEvt.EventID)
		}

		pendingLeaves := []models.PendingLeafCandidate{
			{
				TenantID:      relayEvt.TenantID,
				EnvelopeID:    &relayEvt.EnvelopeID,
				LeafType:      models.LeafTypeEnvelopeHash,
				ItemRef:       relayEvt.EnvelopeID,
				Hash:          relayEvt.EnvelopeHash,
				SchemaVersion: sv,
				EventVersion:  ev,
				SourceTopic:   "payments.ledger.events.v1",
				SourceEventID: relayEvt.EventID,
				TraceID:       relayEvt.TraceID,
			},
		}

		if relayEvt.FileContentHash != "" {
			pendingLeaves = append(pendingLeaves, models.PendingLeafCandidate{
				TenantID:      relayEvt.TenantID,
				EnvelopeID:    &relayEvt.EnvelopeID,
				ClientBatchID: &relayEvt.ClientBatchID,
				LeafType:      models.LeafTypeFileContentHash,
				ItemRef:       relayEvt.ClientBatchID,
				Hash:          relayEvt.FileContentHash,
				SchemaVersion: sv,
				EventVersion:  ev,
				SourceTopic:   "payments.ledger.events.v1",
				SourceEventID: relayEvt.EventID,
				TraceID:       relayEvt.TraceID,
			})
		}

		// Buffering by envelope_id
		return pg.HandleLeafUpdate(ctx, relayEvt.TenantID, relayEvt.EnvelopeID, "", relayEvt.ContractID, relayEvt.TraceID, pendingLeaves)
	}
}
