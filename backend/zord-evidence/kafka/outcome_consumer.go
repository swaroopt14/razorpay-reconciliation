package kafka

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 6 — OUTCOME CONSUMER
//
// Consumes payments.outcome.events.v1 (published by zord-relay after polling
// zord-outcome-engine's outcome_outbox table).
//
// Supported event types:
//   outcome.leaf_bundle.created — carries all 4 Merkle leaf candidates for one
//                                 attached intent/observation pair.
//
// On receipt the consumer validates the bundle and immediately calls
// EvidenceService.GeneratePack() — no buffering required because the emitter
// guarantees all 4 leaves arrive in a single event.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"zord-evidence/models"
	"zord-evidence/utils"
)

// PackGenerator is the narrow interface this consumer requires from the
// evidence service.  *services.EvidenceService satisfies it automatically.
// Defined here (in the kafka package) to avoid a circular import:
//
//	kafka → services → kafka  (would be circular)
//	kafka → models            (safe: models has no kafka dependency)
type PackGenerator interface {
	GeneratePack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error)
	HandleLeafUpdate(ctx context.Context, tenantID, envelopeID, intentID, contractID, traceID string, newLeaves []models.PendingLeafCandidate) error
	HandleBatchLeafUpdate(ctx context.Context, tenantID, batchID string, newLeaves []models.PendingLeafCandidate, isFinal bool) error
}

// OutcomeEventType constants understood by this consumer.
const (
	EventOutcomeLeafBundle = "outcome.leaf_bundle.created"
	EventBatchUpdated      = "attachment.batch.updated"
	EventFileUploaded      = "settlement.file.uploaded"
	EventBatchCanonical    = "settlement.batch.canonicalized"
)

// leafCandidateWire is the on-wire representation of one Merkle leaf inside
// an outcome.leaf_bundle.created payload.  Must match the emitter's struct.
type leafCandidateWire struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash"`
	SchemaVersion string `json:"schema_version"`
}

// leafBundleEvent is the full parsed payload of an outcome.leaf_bundle.created
// Kafka message.
type leafBundleEvent struct {
	EventType               string              `json:"event_type"`
	TenantID                string              `json:"tenant_id"`
	IntentID                string              `json:"intent_id"`
	SettlementObservationID string              `json:"settlement_observation_id"`
	AttachmentJobID         string              `json:"attachment_job_id"`
	DecisionType            string              `json:"decision_type"`
	Leaves                  []leafCandidateWire `json:"leaves"`
}

// StartOutcomeConsumer starts a dedicated Kafka consumer group for
// outcome leaf bundles and routes events to the evidence service.
// It can listen to multiple topics to handle environment-specific overrides.
func StartOutcomeConsumer(
	ctx context.Context,
	brokers []string,
	groupID string,
	topics []string,
	pg PackGenerator,
) (*ConsumerHandle, error) {
	log.Printf("outcome.consumer.start group=%s topics=%v brokers=%v", groupID, topics, brokers)
	// buildOutcomeHandler returns a MessageHandler (func(ctx, key, []byte) error)
	// which is exactly what StartConsumerForTopics expects.
	return StartConsumerForTopics(ctx, brokers, groupID, topics, buildOutcomeHandler(pg))
}

// buildOutcomeHandler returns the MessageHandler func used by StartConsumer.
func buildOutcomeHandler(pg PackGenerator) MessageHandler {
	return func(ctx context.Context, key string, raw []byte) error {
		log.Printf("evidence.kafka.message_received key=%s raw_len=%d", key, len(raw))

		// Peek at event_type before full unmarshal to support future extensibility.
		var peek struct {
			EventType string `json:"event_type"`
		}
		if err := json.Unmarshal(raw, &peek); err != nil {
			log.Printf("outcome.consumer.peek_failed key=%s err=%v raw=%s", key, err, string(raw))
			return nil // non-retryable parse error
		}

		log.Printf("evidence.kafka.routing event_type=%s key=%s", peek.EventType, key)

		switch peek.EventType {
		case EventOutcomeLeafBundle:
			return handleLeafBundle(ctx, raw, pg)
		case EventBatchUpdated:
			log.Printf("evidence.kafka.match_batch_updated key=%s", key)
			return handleBatchUpdated(ctx, raw, pg)
		case EventFileUploaded:
			return handleFileUploaded(ctx, raw, pg)
		case EventBatchCanonical:
			return handleBatchCanonical(ctx, raw, pg)
		default:
			log.Printf("outcome.consumer.unknown_event_type type=%s key=%s — skipping", peek.EventType, key)
			return nil
		}
	}
}

// handleLeafBundle processes one outcome.leaf_bundle.created event.
func handleLeafBundle(ctx context.Context, raw []byte, pg PackGenerator) error {
	var relayEvt models.RelayEvent
	if err := json.Unmarshal(raw, &relayEvt); err != nil {
		log.Printf("outcome.consumer.relay_parse_failed err=%v — skipping", err)
		return nil
	}

	var evt leafBundleEvent
	if err := json.Unmarshal(relayEvt.Payload, &evt); err != nil {
		log.Printf("outcome.consumer.payload_parse_failed err=%v — skipping", err)
		return nil
	}

	// Use RelayEvent IDs as fallback if payload is missing them
	tenantID := evt.TenantID
	if tenantID == "" {
		tenantID = relayEvt.TenantID
	}
	intentID := evt.IntentID
	if intentID == "" {
		intentID = relayEvt.AggregateID
	}

	if tenantID == "" || intentID == "" {
		log.Printf("outcome.consumer.missing_ids tenant=%q intent=%q — skipping", tenantID, intentID)
		return nil
	}

	log.Printf("outcome.consumer.leaf_bundle_received tenant=%s intent=%s obs=%s leaves=%d",
		tenantID, intentID, evt.SettlementObservationID, len(evt.Leaves))

	// Map wire leaves → pending leaf models.
	contractID := relayEvt.ContractID
	batchID := relayEvt.ClientBatchID
	pendingLeaves := make([]models.PendingLeafCandidate, 0, len(evt.Leaves))
	for _, l := range evt.Leaves {
		sv := l.SchemaVersion
		if sv == "" {
			sv = "v1"
		}
		pendingLeaves = append(pendingLeaves, models.PendingLeafCandidate{
			TenantID:      tenantID,
			IntentID:      &intentID,
			ContractID:    &contractID,
			ClientBatchID: &batchID,
			LeafType:      l.Type,
			ItemRef:       l.Ref,
			Hash:          l.Hash,
			SchemaVersion: sv,
			SourceTopic:   "payments.outcome.events.v1",

			// 🆕 Settlement Metadata
			SettlementRecordReceived:   relayEvt.SettlementRecordReceived,
			CanonicalSettlementCreated: relayEvt.CanonicalSettlementCreated,
			BankReference:              relayEvt.BankReference,
			ClientReference:            relayEvt.ClientReference,
			AttachmentDecision:        relayEvt.AttachmentDecision,
			MatchConfidence:           relayEvt.MatchConfidence,
			ValueDateCheck:            relayEvt.ValueDateCheck,
			AmountMatch:               relayEvt.AmountMatch,
		})
	}

	if len(pendingLeaves) == 0 {
		log.Printf("outcome.consumer.empty_leaves intent=%s — skipping", intentID)
		return nil
	}

	// Use HandleLeafUpdate to buffer and check for pack readiness.
	err := pg.HandleLeafUpdate(ctx, tenantID, relayEvt.EnvelopeID, intentID, contractID, relayEvt.TraceID, pendingLeaves)
	if err != nil {
		log.Printf("outcome.consumer.handle_leaf_update_failed tenant=%s intent=%s err=%v", tenantID, intentID, err)
		return err
	}

	log.Printf("outcome.consumer.leaves_processed tenant=%s intent=%s leaves=%d",
		tenantID, intentID, len(pendingLeaves))
	return nil
}

func handleBatchUpdated(ctx context.Context, raw []byte, pg PackGenerator) error {
	log.Printf("evidence.kafka.handle_batch_updated starting")
	var relayEvt models.RelayEvent
	if err := json.Unmarshal(raw, &relayEvt); err != nil {
		log.Printf("evidence.kafka.handle_batch_updated unmarshal_relay_failed err=%v", err)
		return nil
	}

	// Assume the payload has the batch summary details
	var payload map[string]interface{}
	if err := json.Unmarshal(relayEvt.Payload, &payload); err != nil {
		log.Printf("evidence.kafka.handle_batch_updated unmarshal_payload_failed err=%v", err)
		return nil
	}

	payloadBytes, _ := json.Marshal(payload)
	log.Printf("evidence.kafka.handle_batch_updated FULL_PAYLOAD: %s", string(payloadBytes))

	batchID, ok := payload["batch_id"].(string)
	if !ok || batchID == "" {
		batchID = relayEvt.AggregateID
		log.Printf("evidence.kafka.handle_batch_updated fallback_to_aggregate_id id=%s", batchID)
	}
	if batchID == "" {
		log.Printf("evidence.kafka.handle_batch_updated missing_batch_id — skipping")
		return nil
	}

	log.Printf("evidence.kafka.handle_batch_updated processing batch=%s tenant=%s", batchID, relayEvt.TenantID)

	// Compute distinct hashes for different leaf types to ensure granularity
	// 1. Attachment Summary Hash
	attachmentData := fmt.Sprintf("attachment:%v:%v:%v", payload["total_count"], payload["success_count"], payload["ambiguity_score"])
	attachmentHash := utils.SHA256Hex(attachmentData)

	// 2. Variance Summary Hash
	varianceData := fmt.Sprintf("variance:%v", payload["total_variance_minor"])
	varianceHash := utils.SHA256Hex(varianceData)

	// 3. Canonical Batch Metadata Hash
	batchMetadata := fmt.Sprintf("batch:%s:%v:%v", batchID, payload["source_reference"], payload["corridor_id"])
	batchHash := utils.SHA256Hex(batchMetadata)

	// 4. Raw Settlement File Hash (Specifically mapped to the file_sha256 from outcome-engine as requested)
	rawSettlementHash, _ := payload["file_sha256"].(string)
	// Strip "sha256:" prefix if present in the source string from outcome-engine
	if len(rawSettlementHash) > 7 && rawSettlementHash[:7] == "sha256:" {
		rawSettlementHash = rawSettlementHash[7:]
	}

	log.Printf("evidence.kafka.handle_batch_updated RAW_SETTLEMENT_FILE source_val=%q final_hash=%q", payload["file_sha256"], rawSettlementHash)

	// 5. File Content Hash (Matches the raw file content hash from edge)
	fileHash := relayEvt.FileContentHash

	// 6. Check finality before processing
	jobStatus, _ := payload["job_status"].(string)
	if jobStatus != "COMPLETED" {
		log.Printf("evidence.kafka.handle_batch_updated batch=%s job_status=%s — buffering leaves but skipping generation", batchID, jobStatus)
	}

	leaves := []models.PendingLeafCandidate{
		{
			TenantID:      relayEvt.TenantID,
			ClientBatchID:       &batchID,
			LeafType:      models.LeafTypeBatchAttachmentSummary,
			ItemRef:       batchID,
			Hash:          attachmentHash,
			SchemaVersion: "v1",
			SourceTopic:   "batch.summary.updated",
		},
		{
			TenantID:      relayEvt.TenantID,
			ClientBatchID:       &batchID,
			LeafType:      models.LeafTypeBatchVarianceSummary,
			ItemRef:       batchID,
			Hash:          varianceHash,
			SchemaVersion: "v1",
			SourceTopic:   "batch.summary.updated",
		},
		{
			TenantID:      relayEvt.TenantID,
			ClientBatchID:       &batchID,
			LeafType:      models.LeafTypeCanonicalBatch,
			ItemRef:       batchID,
			Hash:          batchHash,
			SchemaVersion: "v1",
			SourceTopic:   "batch.summary.updated",
		},
		{
			TenantID:      relayEvt.TenantID,
			ClientBatchID: &batchID,
			LeafType:      models.LeafTypeRawSettlementFile,
			ItemRef:       batchID,
			Hash:          rawSettlementHash,
			SchemaVersion: "v1",
			SourceTopic:   "batch.summary.updated",
		},
		{
			TenantID:      relayEvt.TenantID,
			ClientBatchID: &batchID,
			LeafType:      models.LeafTypeFileContentHash,
			ItemRef:       batchID,
			Hash:          fileHash,
			SchemaVersion: "v1",
			SourceTopic:   "batch.summary.updated",
		},
	}

	// Use HandleBatchLeafUpdate for batch-level packs
	return pg.HandleBatchLeafUpdate(ctx, relayEvt.TenantID, batchID, leaves, jobStatus == "COMPLETED")
}

func handleFileUploaded(ctx context.Context, raw []byte, pg PackGenerator) error {
	var relayEvt models.RelayEvent
	if err := json.Unmarshal(raw, &relayEvt); err != nil {
		return nil
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(relayEvt.Payload, &payload); err != nil {
		return nil
	}

	batchID, ok := payload["batch_id"].(string)
	if !ok || batchID == "" {
		batchID = relayEvt.AggregateID
	}
	if batchID == "" {
		return nil
	}

	var hash string
	if h, ok := payload["file_hash"].(string); ok {
		hash = h
	}

	leaves := []models.PendingLeafCandidate{{
		TenantID:      relayEvt.TenantID,
		ClientBatchID: &batchID,
		LeafType:      models.LeafTypeRawSettlementFile,
		ItemRef:       batchID,
		Hash:          hash,
		SchemaVersion: "v1",
		SourceTopic:   "payments.outcome.events.v1",
	}}
	return pg.HandleBatchLeafUpdate(ctx, relayEvt.TenantID, batchID, leaves, false)
}

func handleBatchCanonical(ctx context.Context, raw []byte, pg PackGenerator) error {
	var relayEvt models.RelayEvent
	if err := json.Unmarshal(raw, &relayEvt); err != nil {
		return nil
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(relayEvt.Payload, &payload); err != nil {
		return nil
	}

	batchID, ok := payload["batch_id"].(string)
	if !ok || batchID == "" {
		batchID = relayEvt.AggregateID
	}
	if batchID == "" {
		return nil
	}

	var hash string
	if payloadBytes, err := json.Marshal(payload); err == nil {
		hash = utils.SHA256Hex(string(payloadBytes))
	}

	leaves := []models.PendingLeafCandidate{{
		TenantID:      relayEvt.TenantID,
		ClientBatchID: &batchID,
		LeafType:      models.LeafTypeCanonicalBatch,
		ItemRef:       batchID,
		Hash:          hash,
		SchemaVersion: "v1",
		SourceTopic:   "payments.outcome.events.v1",
	}}
	return pg.HandleBatchLeafUpdate(ctx, relayEvt.TenantID, batchID, leaves, false)
}
