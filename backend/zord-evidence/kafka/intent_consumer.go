package kafka

import (
	"context"
	"encoding/json"
	"log"
	"zord-evidence/models"
)

// StartIntentConsumer starts a consumer for payments.intent.events.v1
func StartIntentConsumer(
	ctx context.Context,
	brokers []string,
	groupID string,
	topic string,
	pg PackGenerator,
) error {
	log.Printf("intent.consumer.start group=%s topic=%s brokers=%v", groupID, topic, brokers)
	return StartConsumer(ctx, brokers, groupID, topic, buildIntentHandler(pg))
}

func buildIntentHandler(pg PackGenerator) MessageHandler {
	return func(ctx context.Context, key string, raw []byte) error {
		var relayEvt models.RelayEvent
		if err := json.Unmarshal(raw, &relayEvt); err != nil {
			log.Printf("intent.consumer.parse_failed key=%s err=%v", key, err)
			return nil
		}

		if relayEvt.TenantID == "" || relayEvt.AggregateID == "" {
			log.Printf("intent.consumer.missing_ids tenant=%s intent=%s", relayEvt.TenantID, relayEvt.AggregateID)
			return nil
		}

		// Carry the originating client_batch_id onto every buffered intent leaf so the
		// generated pack can later be looked up via GET /v1/evidence/packs?client_batch_id=
		// without joining intent-engine. Empty values stay NULL in DB.
		var batchIDPtr *string
		if relayEvt.ClientBatchID != "" {
			b := relayEvt.ClientBatchID
			batchIDPtr = &b
		}

		// Leaf 6: Canonical Intent Hash
		l6 := models.PendingLeafCandidate{
			TenantID:      relayEvt.TenantID,
			IntentID:      &relayEvt.AggregateID,
			ContractID:    &relayEvt.ContractID,
			ClientBatchID: batchIDPtr,
			LeafType:      models.LeafTypeCanonicalIntentHash,
			ItemRef:       relayEvt.AggregateID,
			Hash:          relayEvt.CanonicalHash,
			SchemaVersion: "v1",
			SourceTopic:   "payments.intent.events.v1",

			// 🆕 Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:    relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:        relayEvt.MappingProfileID,
			RequiredFieldsStatus:      relayEvt.RequiredFieldsStatus,
			TokenizationStatus:        relayEvt.TokenizationStatus,
			GovernanceDecision:        relayEvt.GovernanceDecision,

			// 🆕 Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 7: Governance Decision (Directly from Outbox GovernanceHash)
		l7 := models.PendingLeafCandidate{
			TenantID:      relayEvt.TenantID,
			IntentID:      &relayEvt.AggregateID,
			ContractID:    &relayEvt.ContractID,
			ClientBatchID: batchIDPtr,
			LeafType:      models.LeafTypeGovernanceDecision,
			ItemRef:       relayEvt.AggregateID,
			Hash:          relayEvt.GovernanceHash,
			SchemaVersion: "v1",
			SourceTopic:   "payments.intent.events.v1",

			// 🆕 Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:    relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:        relayEvt.MappingProfileID,
			RequiredFieldsStatus:      relayEvt.RequiredFieldsStatus,
			TokenizationStatus:        relayEvt.TokenizationStatus,
			GovernanceDecision:        relayEvt.GovernanceDecision,

			// 🆕 Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		pendingLeaves := []models.PendingLeafCandidate{l6, l7}

		// Pass intent_id, envelope_id and contract_id to link any buffered edge leaves
		return pg.HandleLeafUpdate(ctx, relayEvt.TenantID, relayEvt.EnvelopeID, relayEvt.AggregateID, relayEvt.ContractID, relayEvt.TraceID, pendingLeaves)
	}
}
