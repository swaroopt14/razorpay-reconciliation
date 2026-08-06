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
func (i *VectorIndexer) upsertEventVectors(ctx context.Context, event VectorIndexRequestEvent) error {
	start := time.Now()

	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	chunks, err := i.liveRetriever.BuildVectorIndexChunks(ctx, event)
	if err != nil {
		return err
	}

	chunks = sanitizeVectorIndexChunks(tenantID, chunks)
	if len(chunks) == 0 {
		log.Printf("[prompt-layer][vector-index] event indexed no chunks tenant=%s entity=%s id=%s", tenantID, event.EntityType, event.EntityID)
		return nil
	}

	vectors, err := i.embedEventChunks(ctx, event, chunks)
	if err != nil {
		return err
	}

	upserted, err := i.pinecone.Upsert(ctx, vectors)
	if err != nil {
		return err
	}

	log.Printf(
		"[prompt-layer][vector-index] event upserted tenant=%s source=%s entity=%s id=%s chunks=%d upserted=%d duration_ms=%d",
		tenantID,
		event.SourceService,
		event.EntityType,
		event.EntityID,
		len(chunks),
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

func (i *VectorIndexer) embedEventChunks(ctx context.Context, event VectorIndexRequestEvent, chunks []model.RetrievedChunk) ([]client.PineconeVector, error) {
	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	entityType := strings.ToLower(strings.TrimSpace(event.EntityType))
	entityID := strings.TrimSpace(event.EntityID)

	vectors := make([]client.PineconeVector, 0, len(chunks))

	for _, chunk := range chunks {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		text := buildIndexDocumentText(chunk)
		if text == "" {
			continue
		}

		values, err := i.gemini.Embed(text, i.embeddingModel, i.embeddingDimension)
		if err != nil {
			return nil, err
		}

		vectors = append(vectors, client.PineconeVector{
			ID:     stableEventVectorID(event, chunk.SourceType, text),
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
				"text":              text,
				"indexed_at":        time.Now().UTC().Format(time.RFC3339),
			},
		})
	}

	return vectors, nil
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

func stableEventVectorID(event VectorIndexRequestEvent, sourceType, text string) string {
	raw := strings.Join([]string{
		strings.ToLower(strings.TrimSpace(event.TenantID)),
		strings.ToLower(strings.TrimSpace(event.EntityType)),
		strings.TrimSpace(event.EntityID),
		strings.ToLower(strings.TrimSpace(sourceType)),
		strings.TrimSpace(event.ContentVersion),
		strings.TrimSpace(text),
	}, "|")

	sum := sha256.Sum256([]byte(raw))
	return "zord_" + hex.EncodeToString(sum[:])
}
