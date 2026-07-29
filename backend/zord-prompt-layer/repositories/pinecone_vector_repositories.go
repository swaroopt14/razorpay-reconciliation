package repositories

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
)

type PineconeVectorRetriever struct {
	gemini         *client.GeminiClient
	pinecone       *client.PineconeClient
	embeddingModel string
	queryTopK      int
}

func NewPineconeVectorRetriever(gemini *client.GeminiClient, pinecone *client.PineconeClient, embeddingModel string, queryTopK int) *PineconeVectorRetriever {
	if queryTopK <= 0 {
		queryTopK = 5
	}
	if strings.TrimSpace(embeddingModel) == "" {
		embeddingModel = "text-embedding-004"
	}

	return &PineconeVectorRetriever{
		gemini:         gemini,
		pinecone:       pinecone,
		embeddingModel: embeddingModel,
		queryTopK:      queryTopK,
	}
}

func (r *PineconeVectorRetriever) RetrieveVector(req dto.QueryRequest, topK int) ([]model.RetrievedChunk, error) {
	if r == nil || r.gemini == nil || r.pinecone == nil || !r.pinecone.Enabled() {
		return nil, nil
	}
	if !req.PlannerNeedsVector {
		return nil, nil
	}

	queryText := buildVectorSearchText(req)
	if strings.TrimSpace(queryText) == "" {
		return nil, nil
	}

	effectiveTopK := r.queryTopK
	if effectiveTopK <= 0 {
		effectiveTopK = topK
	}
	if effectiveTopK <= 0 {
		effectiveTopK = 5
	}

	start := time.Now()
	embedding, err := r.gemini.Embed(queryText, r.embeddingModel)
	if err != nil {
		return nil, fmt.Errorf("embedding failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	matches, err := r.pinecone.Query(ctx, embedding, effectiveTopK, req.TenantID)
	if err != nil {
		return nil, err
	}

	chunks := make([]model.RetrievedChunk, 0, len(matches))
	for _, m := range matches {
		text := metadataString(m.Metadata, "text", "chunk_text", "content", "summary", "business_summary")
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}

		sourceType := metadataString(m.Metadata, "source_type", "source", "kind")
		if sourceType == "" {
			sourceType = "vector_semantic_context"
		}

		chunks = append(chunks, model.RetrievedChunk{
			ChunkID:    "",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			SourceType: sanitizeVectorSourceType(sourceType),
			Text:       text,
			Score:      m.Score,
		})
	}

	log.Printf("[prompt-layer][vector] query done tenant=%s chunks=%d duration_ms=%d", req.TenantID, len(chunks), time.Since(start).Milliseconds())
	return chunks, nil
}

func buildVectorSearchText(req dto.QueryRequest) string {
	parts := []string{
		req.Query,
		req.PlannerBusinessIntent,
		strings.Join(req.PlannerRetrievalTargets, " "),
		strings.Join(req.PlannerReferenceCandidates, " "),
	}

	if req.UIContext != nil {
		parts = append(parts,
			req.UIContext.Scope,
			req.UIContext.SourcePage,
			req.UIContext.SectionTitle,
			req.UIContext.SelectedTitle,
			req.UIContext.SelectedDescription,
			req.UIContext.BatchID,
		)

		for _, metric := range req.UIContext.SelectedMetrics {
			parts = append(parts, metric.Label, metric.Value)
		}
	}

	return strings.Join(parts, "\n")
}

func metadataString(metadata map[string]any, keys ...string) string {
	if metadata == nil {
		return ""
	}

	for _, key := range keys {
		raw, ok := metadata[key]
		if !ok || raw == nil {
			continue
		}

		switch v := raw.(type) {
		case string:
			return strings.TrimSpace(v)
		case float64:
			return fmt.Sprintf("%v", v)
		case bool:
			return fmt.Sprintf("%t", v)
		default:
			return strings.TrimSpace(fmt.Sprintf("%v", v))
		}
	}

	return ""
}

func sanitizeVectorSourceType(sourceType string) string {
	sourceType = strings.ToLower(strings.TrimSpace(sourceType))
	sourceType = strings.ReplaceAll(sourceType, " ", "_")
	sourceType = strings.ReplaceAll(sourceType, "-", "_")
	if sourceType == "" {
		return "vector_semantic_context"
	}
	if !strings.HasPrefix(sourceType, "vector_") {
		return "vector_" + sourceType
	}
	return sourceType
}
