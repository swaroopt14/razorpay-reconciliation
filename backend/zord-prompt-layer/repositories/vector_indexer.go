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
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

type VectorIndexer struct {
	liveRetriever  *LiveSQLRetriever
	gemini         *client.GeminiClient
	pinecone       *client.PineconeClient
	embeddingModel string
	interval       time.Duration
	batchSize      int
	timeout        time.Duration
}

func NewVectorIndexer(
	liveRetriever *LiveSQLRetriever,
	gemini *client.GeminiClient,
	pinecone *client.PineconeClient,
	embeddingModel string,
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
		embeddingModel = "text-embedding-004"
	}

	return &VectorIndexer{
		liveRetriever:  liveRetriever,
		gemini:         gemini,
		pinecone:       pinecone,
		embeddingModel: embeddingModel,
		interval:       time.Duration(intervalSeconds) * time.Second,
		batchSize:      batchSize,
		timeout:        time.Duration(timeoutSeconds) * time.Second,
	}
}

func (i *VectorIndexer) Start(ctx context.Context) {
	if i == nil || i.liveRetriever == nil || i.gemini == nil || i.pinecone == nil || !i.pinecone.Enabled() {
		log.Printf("[prompt-layer][vector-index] not configured; scheduled indexing disabled")
		return
	}

	go func() {
		log.Printf("[prompt-layer][vector-index] scheduler started interval=%s batch_size=%d timeout=%s", i.interval, i.batchSize, i.timeout)

		i.runSafely(ctx)

		ticker := time.NewTicker(i.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Printf("[prompt-layer][vector-index] scheduler stopped")
				return
			case <-ticker.C:
				i.runSafely(ctx)
			}
		}
	}()
}

func (i *VectorIndexer) runSafely(parent context.Context) {
	ctx, cancel := context.WithTimeout(parent, i.timeout)
	defer cancel()

	if err := i.IndexOnce(ctx); err != nil {
		log.Printf("[prompt-layer][vector-index] run failed err=%v", err)
	}
}

func (i *VectorIndexer) IndexOnce(ctx context.Context) error {
	start := time.Now()

	tenants, err := i.liveRetriever.ListVectorIndexTenantIDs(ctx, i.batchSize)
	if err != nil {
		return err
	}

	if len(tenants) == 0 {
		log.Printf("[prompt-layer][vector-index] no tenants found")
		return nil
	}

	totalChunks := 0
	totalUpserted := 0

	for _, tenantID := range tenants {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		chunks, err := i.safeTenantChunks(ctx, tenantID)
		if err != nil {
			log.Printf("[prompt-layer][vector-index] tenant retrieval failed tenant=%s err=%v", tenantID, err)
			continue
		}

		if len(chunks) == 0 {
			log.Printf("[prompt-layer][vector-index] no safe chunks tenant=%s", tenantID)
			continue
		}

		vectors, err := i.embedChunks(ctx, tenantID, chunks)
		if err != nil {
			log.Printf("[prompt-layer][vector-index] embedding failed tenant=%s err=%v", tenantID, err)
			continue
		}

		upserted, err := i.pinecone.Upsert(ctx, vectors)
		if err != nil {
			log.Printf("[prompt-layer][vector-index] upsert failed tenant=%s err=%v", tenantID, err)
			continue
		}

		totalChunks += len(chunks)
		totalUpserted += upserted

		log.Printf("[prompt-layer][vector-index] tenant indexed tenant=%s chunks=%d upserted=%d", tenantID, len(chunks), upserted)
	}

	log.Printf("[prompt-layer][vector-index] run complete tenants=%d chunks=%d upserted=%d duration_ms=%d", len(tenants), totalChunks, totalUpserted, time.Since(start).Milliseconds())
	return nil
}

func (i *VectorIndexer) safeTenantChunks(ctx context.Context, tenantID string) ([]model.RetrievedChunk, error) {
	req := dto.QueryRequest{
		TenantID: tenantID,
		Query:    "tenant-wide operational audit covering payment instructions, settlement outcomes, unmatched value, short-settled value, proof readiness, failures, duplicate protection, RCA signals, and next actions",
		TopK:     i.batchSize,
	}

	chunks, err := i.liveRetriever.Retrieve(req, "", "", i.batchSize, utils.QueryScope{})
	if err != nil {
		return nil, err
	}

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

	return safe, nil
}

func (i *VectorIndexer) embedChunks(ctx context.Context, tenantID string, chunks []model.RetrievedChunk) ([]client.PineconeVector, error) {
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

		values, err := i.gemini.Embed(text, i.embeddingModel)
		if err != nil {
			return nil, err
		}

		vectors = append(vectors, client.PineconeVector{
			ID:     stableVectorID(tenantID, chunk.SourceType, text),
			Values: values,
			Metadata: map[string]any{
				"tenant_id":   tenantID,
				"source_type": chunk.SourceType,
				"text":        text,
				"indexed_at":  time.Now().UTC().Format(time.RFC3339),
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

func stableVectorID(tenantID, sourceType, text string) string {
	raw := strings.Join([]string{
		strings.ToLower(strings.TrimSpace(tenantID)),
		strings.ToLower(strings.TrimSpace(sourceType)),
		strings.TrimSpace(text),
	}, "|")

	sum := sha256.Sum256([]byte(raw))
	return "zord_" + hex.EncodeToString(sum[:])
}
