package repositories

import (
	"sort"
	"strings"
	"zord-prompt-layer/model"
)

func rankAndTrimBalanced(chunks []model.RetrievedChunk, topK int) []model.RetrievedChunk {
	if topK <= 0 || len(chunks) <= topK {
		return chunks
	}
	pinned := make([]model.RetrievedChunk, 0, 2)
	remaining := make([]model.RetrievedChunk, 0, len(chunks))

	for _, c := range chunks {
		if strings.EqualFold(strings.TrimSpace(c.SourceType), "evidence_batch_exact_counts") {
			pinned = append(pinned, c)
			continue
		}
		remaining = append(remaining, c)
	}

	if len(pinned) > 0 {
		if len(pinned) >= topK {
			sort.SliceStable(pinned, func(i, j int) bool { return pinned[i].Score > pinned[j].Score })
			return pinned[:topK]
		}

		trimmedRemaining := rankAndTrimBalanced(remaining, topK-len(pinned))
		return append(pinned, trimmedRemaining...)
	}

	buckets := map[string][]model.RetrievedChunk{}
	for _, c := range chunks {
		k := sourceServiceBucket(c.SourceType)
		buckets[k] = append(buckets[k], c)
	}

	keys := make([]string, 0, len(buckets))
	for k := range buckets {
		sort.SliceStable(buckets[k], func(i, j int) bool { return buckets[k][i].Score > buckets[k][j].Score })
		keys = append(keys, k)
	}
	sort.SliceStable(keys, func(i, j int) bool {
		return buckets[keys[i]][0].Score > buckets[keys[j]][0].Score
	})

	out := make([]model.RetrievedChunk, 0, topK)
	for len(out) < topK {
		added := false
		for _, k := range keys {
			if len(buckets[k]) == 0 {
				continue
			}
			out = append(out, buckets[k][0])
			buckets[k] = buckets[k][1:]
			added = true
			if len(out) == topK {
				break
			}
		}
		if !added {
			break
		}
	}
	return out
}

func sourceServiceBucket(sourceType string) string {
	s := strings.ToLower(strings.TrimSpace(sourceType))
	switch {
	case strings.HasPrefix(s, "edge_"):
		return "edge"
	case strings.HasPrefix(s, "intent_"):
		return "intent"
	case strings.HasPrefix(s, "relay_"):
		return "relay"
	case strings.HasPrefix(s, "intelligence_"):
		return "intelligence"
	case strings.HasPrefix(s, "evidence_"):
		return "evidence"
	case strings.HasPrefix(s, "outcome_"):
		return "outcome"
	default:
		return s
	}
}
