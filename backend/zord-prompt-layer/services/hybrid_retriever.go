package services

import (
	"log"
	"strings"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

type VectorRetriever interface {
	RetrieveVector(req dto.QueryRequest, topK int) ([]model.RetrievedChunk, error)
}

type HybridEvidenceRetriever struct {
	primary EvidenceRetriever
	vector  VectorRetriever
}

func NewHybridEvidenceRetriever(primary EvidenceRetriever, vector VectorRetriever) *HybridEvidenceRetriever {
	return &HybridEvidenceRetriever{
		primary: primary,
		vector:  vector,
	}
}

func (r *HybridEvidenceRetriever) Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	if r == nil || r.primary == nil {
		return nil, nil
	}

	primaryChunks, err := r.primary.Retrieve(req, intentID, traceID, topK, scope)
	if err != nil {
		return nil, err
	}

	if r.vector == nil {
		log.Printf("[prompt-layer][vector] skipped tenant=%s reason=not_configured", req.TenantID)
		return primaryChunks, nil
	}
	if !req.PlannerNeedsVector {
		log.Printf("[prompt-layer][vector] skipped tenant=%s reason=planner_not_required sql_chunks=%d", req.TenantID, len(primaryChunks))
		return primaryChunks, nil
	}

	vectorChunks, err := r.vector.RetrieveVector(req, topK)
	if err != nil {
		log.Printf("[prompt-layer][vector] retrieval failed tenant=%s sql_fallback=true err=%v", req.TenantID, err)
		return primaryChunks, nil
	}

	if len(vectorChunks) == 0 {
		log.Printf("[prompt-layer][vector] no matches tenant=%s sql_chunks=%d", req.TenantID, len(primaryChunks))
		return primaryChunks, nil
	}

	merged := mergeRetrievedChunks(primaryChunks, vectorChunks)
	log.Printf("[prompt-layer][vector] merged tenant=%s sql_chunks=%d vector_chunks=%d total=%d", req.TenantID, len(primaryChunks), len(vectorChunks), len(merged))
	return merged, nil
}

func mergeRetrievedChunks(primary []model.RetrievedChunk, secondary []model.RetrievedChunk) []model.RetrievedChunk {
	out := make([]model.RetrievedChunk, 0, len(primary)+len(secondary))
	seen := map[string]struct{}{}

	for _, c := range primary {
		key := retrievedChunkKey(c)
		if key != "" {
			seen[key] = struct{}{}
		}
		out = append(out, c)
	}

	for _, c := range secondary {
		key := retrievedChunkKey(c)
		if key != "" {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
		}
		out = append(out, c)
	}

	return out
}

func retrievedChunkKey(c model.RetrievedChunk) string {
	source := strings.TrimSpace(c.SourceType)
	text := strings.TrimSpace(c.Text)

	if source == "" && text == "" {
		return ""
	}

	if len(text) > 160 {
		text = text[:160]
	}

	return strings.ToLower(source + "|" + text)
}
