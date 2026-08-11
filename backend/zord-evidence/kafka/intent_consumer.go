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
) (*ConsumerHandle, error) {
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

		// Map schema_version/event_version from the upstream envelope rather
		// than hardcoding them — no fallback, just log if missing so gaps in
		// upstream instrumentation are visible instead of silently masked.
		sv := relayEvt.SchemaVersion
		if sv == "" {
			log.Printf("intent.consumer.missing_schema_version key=%s intent=%s event_id=%s", key, relayEvt.AggregateID, relayEvt.EventID)
		}
		ev := relayEvt.EventVersion
		if ev == "" {
			log.Printf("intent.consumer.missing_event_version key=%s intent=%s event_id=%s", key, relayEvt.AggregateID, relayEvt.EventID)
		}
		if relayEvt.TraceID == "" {
			log.Printf("intent.consumer.missing_trace_id key=%s intent=%s event_id=%s", key, relayEvt.AggregateID, relayEvt.EventID)
		}

		// Carry the originating client_batch_id onto every buffered intent leaf so the
		// generated pack can later be looked up via GET /v1/evidence/packs?client_batch_id=
		// without joining intent-engine. Empty values stay NULL in DB.
		var batchIDPtr *string
		if relayEvt.ClientBatchID != "" {
			b := relayEvt.ClientBatchID
			batchIDPtr = &b
		}

		// Carry artifact identity (relayed from zord-edge via zord-intent-engine)
		// onto every buffered intent leaf so the sealed pack can record exactly
		// which source artifact/version it was built from. Nil-guarded so empty
		// values stay NULL in DB rather than storing empty-string placeholders.
		var artifactIDPtr, artifactVersionIDPtr *string
		if relayEvt.ArtifactID != "" {
			a := relayEvt.ArtifactID
			artifactIDPtr = &a
		}
		if relayEvt.ArtifactVersionID != "" {
			v := relayEvt.ArtifactVersionID
			artifactVersionIDPtr = &v
		}

		// Leaf 6: Canonical Intent Hash
		l6 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeCanonicalIntentHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.CanonicalHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 7: Governance Decision (Directly from Outbox GovernanceHash)
		l7 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeGovernanceDecision,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.GovernanceHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 9: Raw Row Evidence Leaf Hash
		l9 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeRawRowEvidenceLeafHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.RawRowEvidenceLeafHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 10: Canonical Row Evidence Leaf Hash
		l10 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeCanonicalRowEvidenceLeafHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.CanonicalRowEvidenceLeafHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 11: Mapping Profile Hash
		l11 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeMappingProfileHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.MappingProfileHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 12: Business Idempotency Hash
		l12 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeBusinessIdempotencyHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.BusinessIdempotencyKey,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		// Leaf 13: Tokenized Data Hash
		l13 := models.PendingLeafCandidate{
			TenantID:          relayEvt.TenantID,
			IntentID:          &relayEvt.AggregateID,
			ContractID:        &relayEvt.ContractID,
			ClientBatchID:     batchIDPtr,
			ArtifactID:        artifactIDPtr,
			ArtifactVersionID: artifactVersionIDPtr,
			LeafType:          models.LeafTypeTokenizedDataHash,
			ItemRef:           relayEvt.AggregateID,
			Hash:              relayEvt.TokenizedDataHash,
			SchemaVersion:     sv,
			EventVersion:      ev,
			SourceTopic:       "payments.intent.events.v1",
			SourceEventID:     relayEvt.EventID,
			TraceID:           relayEvt.TraceID,

			// Traceability & Status Fields
			PaymentInstructionReceived: relayEvt.PaymentInstructionReceived,
			CanonicalIntentCreated:     relayEvt.CanonicalIntentCreated,
			MappingProfileUsed:         relayEvt.MappingProfileID,
			RequiredFieldsStatus:       relayEvt.RequiredFieldsStatus,
			TokenizationStatus:         relayEvt.TokenizationStatus,
			GovernanceDecision:         relayEvt.GovernanceDecision,

			// Intent financial identity
			ClientPayoutRef: relayEvt.ClientPayoutRef,
			Amount:          relayEvt.Amount,
			Currency:        relayEvt.Currency,
		}

		pendingLeaves := []models.PendingLeafCandidate{l6, l7, l9, l10, l11, l12, l13}

		// Pass intent_id, envelope_id and contract_id to link any buffered edge leaves
		return pg.HandleLeafUpdate(ctx, relayEvt.TenantID, relayEvt.EnvelopeID, relayEvt.AggregateID, relayEvt.ContractID, relayEvt.TraceID, pendingLeaves)
	}
}
