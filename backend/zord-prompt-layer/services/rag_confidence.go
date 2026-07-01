package services

import (
	"math"
	"strings"
	"zord-prompt-layer/model"
)

func calibrateConfidence(out AnswerWithConfidence, chunks []model.RetrievedChunk) (string, float64) {
	// Retrieval-backed factors
	evidenceCountFactor := clampByCount(len(chunks), 3) // full score at >=3 chunks
	sourceDiversityFactor := sourceDiversity(chunks)    // 0..1

	// LLM signals (already clamped in llm_service)
	base := 0.45*out.ConfidenceScore +
		0.20*out.EvidenceCoverage +
		0.20*out.ScopeAdherence +
		0.10*(1.0-out.ContradictionRisk) +
		0.05*(1.0-out.Ambiguity)

	// Mild objective calibration so score isn't purely self-reported by LLM
	calibrated := base * (0.80 + 0.20*evidenceCountFactor)
	calibrated = calibrated * (0.85 + 0.15*sourceDiversityFactor)
	calibrated = clamp01(calibrated)

	return confidenceLabel(calibrated), calibrated
}

func confidenceLabel(score float64) string {
	if score >= 0.75 {
		return "high"
	}
	if score >= 0.45 {
		return "medium"
	}
	return "low"
}

func clampByCount(n, fullAt int) float64 {
	if fullAt <= 0 {
		return 1
	}
	v := float64(n) / float64(fullAt)
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceDiversity(chunks []model.RetrievedChunk) float64 {
	if len(chunks) == 0 {
		return 0
	}
	seen := map[string]struct{}{}
	for _, c := range chunks {
		group := sourceGroup(c.SourceType)
		if group != "" {
			seen[group] = struct{}{}
		}
	}
	v := float64(len(seen)) / 6.0 // edge, intent, relay, intelligence, evidence
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceGroup(sourceType string) string {
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
		return ""
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
