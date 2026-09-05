package repositories

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"zord-prompt-layer/client"
	"zord-prompt-layer/model"
)

type VectorIndexer struct {
	liveRetriever      *LiveSQLRetriever
	gemini             *client.GeminiClient
	pinecone           *client.PineconeClient
	state              VectorIndexStateRepository
	pineconeNamespace  string
	embeddingModel     string
	embeddingDimension int
	interval           time.Duration
	batchSize          int
	timeout            time.Duration
}

func NewVectorIndexer(
	liveRetriever *LiveSQLRetriever,
	gemini *client.GeminiClient,
	pinecone *client.PineconeClient,
	state VectorIndexStateRepository,
	pineconeNamespace string,
	embeddingModel string,
	embeddingDimension int,
	intervalSeconds int,
	batchSize int,
	timeoutSeconds int,
) *VectorIndexer {
	if intervalSeconds <= 0 {
		intervalSeconds = 300
	}
	if batchSize <= 0 {
		batchSize = 50
	}
	if timeoutSeconds <= 0 {
		timeoutSeconds = 60
	}
	if strings.TrimSpace(embeddingModel) == "" {
		embeddingModel = "gemini-embedding-001"
	}
	if embeddingDimension <= 0 {
		embeddingDimension = 768
	}
	return &VectorIndexer{
		liveRetriever:      liveRetriever,
		gemini:             gemini,
		pinecone:           pinecone,
		state:              state,
		pineconeNamespace:  strings.TrimSpace(pineconeNamespace),
		embeddingModel:     embeddingModel,
		embeddingDimension: embeddingDimension,
		interval:           time.Duration(intervalSeconds) * time.Second,
		batchSize:          batchSize,
		timeout:            time.Duration(timeoutSeconds) * time.Second,
	}
}

func (i *VectorIndexer) HandleVectorIndexRequest(ctx context.Context, event VectorIndexRequestEvent) error {
	if i == nil || i.liveRetriever == nil || i.gemini == nil || i.pinecone == nil || !i.pinecone.Enabled() {
		return fmt.Errorf("vector indexer not configured")
	}

	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	if tenantID == "" || !uuidRegex.MatchString(tenantID) {
		return fmt.Errorf("invalid tenant_id")
	}

	operation := strings.TrimSpace(event.Operation)
	switch operation {
	case VectorIndexOperationDelete:
		return i.deleteEventVectors(ctx, event)

	case VectorIndexOperationUpsert:
		return i.upsertEventVectors(ctx, event)

	default:
		return fmt.Errorf("unsupported vector index operation=%q", operation)
	}
}
func (i *VectorIndexer) RetryDueRateLimited(ctx context.Context, limit int) {
	if i == nil || i.state == nil || !i.state.Enabled() {
		return
	}

	items, err := i.state.ListDueRateLimited(ctx, limit)
	if err != nil {
		log.Printf("[prompt-layer][vector-index] retry list failed err=%v", err)
		return
	}

	for _, item := range items {
		event := VectorIndexRequestEvent{
			EventID:        item.LastEventID,
			EventType:      VectorIndexEventRequested,
			SourceService:  item.SourceService,
			TenantID:       item.TenantID,
			EntityType:     item.EntityType,
			EntityID:       item.EntityID,
			Operation:      VectorIndexOperationUpsert,
			ContentVersion: item.ContentVersion,
			OccurredAt:     time.Now().UTC(),
		}

		if err := i.HandleVectorIndexRequest(ctx, event); err != nil {
			log.Printf("[prompt-layer][vector-index] deferred retry failed tenant=%s entity=%s id=%s err=%v", item.TenantID, item.EntityType, item.EntityID, err)
			continue
		}

		log.Printf("[prompt-layer][vector-index] deferred retry ok tenant=%s entity=%s id=%s", item.TenantID, item.EntityType, item.EntityID)
	}
}
func (i *VectorIndexer) upsertEventVectors(ctx context.Context, event VectorIndexRequestEvent) error {
	start := time.Now()

	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	chunks, err := i.liveRetriever.BuildVectorIndexChunks(ctx, event)
	if err != nil {
		return err
	}

	chunks = sanitizeVectorIndexChunks(tenantID, chunks)
	chunks = compactVectorEventChunks(event, chunks)
	if len(chunks) == 0 {
		log.Printf("[prompt-layer][vector-index] event indexed no chunks tenant=%s entity=%s id=%s", tenantID, event.EntityType, event.EntityID)
		return nil
	}

	vectors, states, skipped, err := i.embedChangedEventChunks(ctx, event, chunks)
	if err != nil {
		return err
	}

	if len(vectors) == 0 {
		log.Printf(
			"[prompt-layer][vector-index] event skipped unchanged tenant=%s source=%s entity=%s id=%s chunks=%d skipped=%d duration_ms=%d",
			tenantID,
			event.SourceService,
			event.EntityType,
			event.EntityID,
			len(chunks),
			skipped,
			time.Since(start).Milliseconds(),
		)
		return nil
	}

	upserted, err := i.pinecone.Upsert(ctx, vectors)
	if err != nil {
		if isRateLimitError(err) {
			for _, state := range states {
				_ = i.markVectorStateRateLimited(ctx, state, err)
			}
			return VectorIndexDeferredError{
				Reason: "pinecone rate limited",
				Cause:  err,
			}
		}

		for _, state := range states {
			_ = i.markVectorStateFailed(ctx, state, err)
		}
		return err
	}

	for _, state := range states {
		if err := i.markVectorStateUpserted(ctx, state); err != nil {
			log.Printf("[prompt-layer][vector-index] state save failed tenant=%s entity=%s id=%s vector=%s err=%v", state.TenantID, state.EntityType, state.EntityID, state.VectorID, err)
		}
	}

	log.Printf(
		"[prompt-layer][vector-index] event upserted tenant=%s source=%s entity=%s id=%s chunks=%d changed=%d skipped=%d upserted=%d duration_ms=%d",
		tenantID,
		event.SourceService,
		event.EntityType,
		event.EntityID,
		len(chunks),
		len(vectors),
		skipped,
		upserted,
		time.Since(start).Milliseconds(),
	)

	return nil
}

func (i *VectorIndexer) deleteEventVectors(ctx context.Context, event VectorIndexRequestEvent) error {
	start := time.Now()

	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	entityType := strings.ToLower(strings.TrimSpace(event.EntityType))
	entityID := strings.TrimSpace(event.EntityID)

	filter := map[string]any{
		"tenant_id": map[string]any{
			"$eq": tenantID,
		},
		"entity_type": map[string]any{
			"$eq": entityType,
		},
		"entity_id": map[string]any{
			"$eq": entityID,
		},
	}

	if err := i.pinecone.DeleteByFilter(ctx, filter); err != nil {
		return err
	}

	if i.state != nil && i.state.Enabled() {
		if err := i.state.DeleteForEntity(ctx, tenantID, entityType, entityID); err != nil {
			log.Printf("[prompt-layer][vector-index] state delete failed tenant=%s entity=%s id=%s err=%v", tenantID, entityType, entityID, err)
		}
	}

	log.Printf(
		"[prompt-layer][vector-index] event deleted tenant=%s source=%s entity=%s id=%s duration_ms=%d",
		tenantID,
		event.SourceService,
		event.EntityType,
		event.EntityID,
		time.Since(start).Milliseconds(),
	)

	return nil
}

func sanitizeVectorIndexChunks(tenantID string, chunks []model.RetrievedChunk) []model.RetrievedChunk {
	safe := make([]model.RetrievedChunk, 0, len(chunks))

	for _, chunk := range chunks {
		text := strings.TrimSpace(chunk.Text)
		if text == "" {
			continue
		}

		chunk.ChunkID = ""
		chunk.RecordID = ""
		chunk.IntentID = ""
		chunk.TraceID = ""
		chunk.TenantID = tenantID
		chunk.Text = text

		safe = append(safe, chunk)
	}

	return safe
}
func compactVectorEventChunks(event VectorIndexRequestEvent, chunks []model.RetrievedChunk) []model.RetrievedChunk {
	safeParts := make([]string, 0, len(chunks))
	sourceTypes := make([]string, 0, len(chunks))
	seenSource := map[string]bool{}

	for _, chunk := range chunks {
		text := strings.TrimSpace(chunk.Text)
		if text == "" {
			continue
		}

		source := strings.TrimSpace(chunk.SourceType)
		if source != "" && !seenSource[source] {
			seenSource[source] = true
			sourceTypes = append(sourceTypes, source)
		}

		if source != "" {
			safeParts = append(safeParts, fmt.Sprintf("[%s] %s", source, text))
		} else {
			safeParts = append(safeParts, text)
		}
	}

	if len(safeParts) == 0 {
		return []model.RetrievedChunk{}
	}

	sourceType := strings.ToLower(strings.TrimSpace(event.EntityType))
	if sourceType == "" {
		sourceType = "vector_event_summary"
	}

	return []model.RetrievedChunk{{
		SourceType: sourceType,
		Score:      1.0,
		Text: strings.Join(nonEmptyParts([]string{
			"Business vector summary",
			"Source service: " + safeOptional(event.SourceService),
			"Entity type: " + safeOptional(event.EntityType),
			"Entity reference: " + safeOptional(event.EntityID),
			"Batch reference: " + safeOptional(event.BatchID),
			"Included source sections: " + safeOptional(strings.Join(sourceTypes, ", ")),
			strings.Join(safeParts, " | "),
		}), " . "),
	}}
}
func (i *VectorIndexer) embedChangedEventChunks(ctx context.Context, event VectorIndexRequestEvent, chunks []model.RetrievedChunk) ([]client.PineconeVector, []VectorIndexState, int, error) {
	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	entityType := strings.ToLower(strings.TrimSpace(event.EntityType))
	entityID := strings.TrimSpace(event.EntityID)

	vectors := make([]client.PineconeVector, 0, len(chunks))
	states := make([]VectorIndexState, 0, len(chunks))
	skipped := 0

	for chunkIndex, chunk := range chunks {
		select {
		case <-ctx.Done():
			return nil, nil, skipped, ctx.Err()
		default:
		}

		text := buildIndexDocumentText(chunk)
		if text == "" {
			continue
		}

		vectorID := stableEventVectorID(event, chunk.SourceType, chunkIndex)
		contentHash := stableEventContentHash(event, chunk.SourceType, text, i.embeddingModel, i.embeddingDimension)

		state := VectorIndexState{
			VectorID:           vectorID,
			TenantID:           tenantID,
			SourceService:      strings.TrimSpace(event.SourceService),
			EntityType:         entityType,
			EntityID:           entityID,
			SourceType:         strings.TrimSpace(chunk.SourceType),
			ContentHash:        contentHash,
			ContentVersion:     strings.TrimSpace(event.ContentVersion),
			PineconeNamespace:  i.pineconeNamespace,
			EmbeddingModel:     strings.TrimSpace(i.embeddingModel),
			EmbeddingDimension: i.embeddingDimension,
			LastEventID:        strings.TrimSpace(event.EventID),
			Status:             "indexed",
		}

		if i.state != nil && i.state.Enabled() {
			existing, found, err := i.state.Get(ctx, vectorID)
			if err != nil {
				log.Printf("[prompt-layer][vector-index] state lookup failed tenant=%s entity=%s id=%s vector=%s err=%v", tenantID, entityType, entityID, vectorID, err)
			}

			if found &&
				existing.ContentHash == contentHash &&
				existing.EmbeddingModel == i.embeddingModel &&
				existing.EmbeddingDimension == i.embeddingDimension &&
				existing.Status == "indexed" {
				skipped++
				log.Printf("[prompt-layer][vector-index] chunk skipped unchanged tenant=%s entity=%s id=%s vector=%s", tenantID, entityType, entityID, vectorID)
				continue
			}

			log.Printf("[prompt-layer][vector-index] chunk changed embedding tenant=%s entity=%s id=%s vector=%s found=%t", tenantID, entityType, entityID, vectorID, found)
		}

		values, err := i.gemini.Embed(text, i.embeddingModel, i.embeddingDimension)
		if err != nil {
			if isRateLimitError(err) {
				_ = i.markVectorStateRateLimited(ctx, state, err)
				return nil, nil, skipped, VectorIndexDeferredError{
					Reason:      "embedding provider rate limited",
					NextRetryAt: state.NextRetryAt,
					Cause:       err,
				}
			}

			_ = i.markVectorStateFailed(ctx, state, err)
			return nil, nil, skipped, err
		}

		vectors = append(vectors, client.PineconeVector{
			ID:     vectorID,
			Values: values,
			Metadata: map[string]any{
				"tenant_id":         tenantID,
				"source_type":       chunk.SourceType,
				"source_service":    strings.TrimSpace(event.SourceService),
				"source_event_type": strings.TrimSpace(event.SourceEventType),
				"entity_type":       entityType,
				"entity_id":         entityID,
				"batch_id":          strings.TrimSpace(event.BatchID),
				"content_version":   strings.TrimSpace(event.ContentVersion),
				"content_hash":      contentHash,
				"text":              text,
				"indexed_at":        time.Now().UTC().Format(time.RFC3339),
			},
		})
		states = append(states, state)
	}

	return vectors, states, skipped, nil
}

func buildIndexDocumentText(chunk model.RetrievedChunk) string {
	source := strings.TrimSpace(chunk.SourceType)
	text := strings.TrimSpace(chunk.Text)

	if text == "" {
		return ""
	}

	if source == "" {
		return text
	}

	return fmt.Sprintf("Source: %s\n%s", source, text)
}

func stableEventVectorID(event VectorIndexRequestEvent, sourceType string, chunkIndex int) string {
	raw := strings.Join([]string{
		strings.ToLower(strings.TrimSpace(event.TenantID)),
		strings.ToLower(strings.TrimSpace(event.SourceService)),
		strings.ToLower(strings.TrimSpace(event.EntityType)),
		strings.TrimSpace(event.EntityID),
		strings.ToLower(strings.TrimSpace(sourceType)),
		strings.TrimSpace(event.ContentVersion),
		fmt.Sprintf("%d", chunkIndex),
	}, "|")

	sum := sha256.Sum256([]byte(raw))
	return "zord_" + hex.EncodeToString(sum[:])
}

func stableEventContentHash(event VectorIndexRequestEvent, sourceType, text, embeddingModel string, embeddingDimension int) string {
	raw := strings.Join([]string{
		strings.ToLower(strings.TrimSpace(event.SourceService)),
		strings.ToLower(strings.TrimSpace(event.EntityType)),
		strings.TrimSpace(event.EntityID),
		strings.ToLower(strings.TrimSpace(sourceType)),
		strings.TrimSpace(event.ContentVersion),
		strings.TrimSpace(embeddingModel),
		fmt.Sprintf("%d", embeddingDimension),
		strings.TrimSpace(text),
	}, "|")

	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (i *VectorIndexer) markVectorStateUpserted(ctx context.Context, state VectorIndexState) error {
	if i == nil || i.state == nil || !i.state.Enabled() {
		return nil
	}
	return i.state.MarkUpserted(ctx, state)
}

func (i *VectorIndexer) markVectorStateFailed(ctx context.Context, state VectorIndexState, cause error) error {
	if i == nil || i.state == nil || !i.state.Enabled() {
		return nil
	}
	return i.state.MarkFailed(ctx, state, cause)
}
func (i *VectorIndexer) markVectorStateRateLimited(ctx context.Context, state VectorIndexState, cause error) error {
	if i == nil || i.state == nil || !i.state.Enabled() {
		return nil
	}

	nextRetryAt := time.Now().UTC().Add(extractRetryDelay(cause))
	return i.state.MarkRateLimited(ctx, state, cause, nextRetryAt)
}

func extractRetryDelay(err error) time.Duration {
	if err == nil {
		return 5 * time.Minute
	}

	msg := err.Error()

	if idx := strings.Index(msg, `"retryDelay"`); idx >= 0 {
		tail := msg[idx:]
		if strings.Contains(tail, `"57s"`) {
			return 57 * time.Second
		}
		if strings.Contains(tail, `"32s"`) {
			return 32 * time.Second
		}
	}

	return 5 * time.Minute
}

func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}

	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "status=429") ||
		strings.Contains(msg, "resource_exhausted") ||
		strings.Contains(msg, "quota exceeded") ||
		strings.Contains(msg, "rate limit")
}
