package handlers

import "math"

type ambiguityMixSegment struct {
	Name string  `json:"name"`
	Pct  float64 `json:"pct"`
}

func roundPct(rate float64) float64 {
	return math.Round(rate*1000) / 10
}

func buildAmbiguityMixSegments(
	providerRefMissingRate float64,
	ambiguityRate float64,
	lowConfidenceRate float64,
	avgAttachmentConfidence float64,
) ([]ambiguityMixSegment, float64) {
	missing := roundPct(providerRefMissingRate * 100)
	ambiguous := roundPct(ambiguityRate * 100)
	lowConf := roundPct(lowConfidenceRate * 100)
	if lowConfidenceRate <= 0 {
		derived := roundPct((1-avgAttachmentConfidence)*100) - ambiguous
		if derived < 0 {
			derived = 0
		}
		lowConf = derived
	}
	highConf := 100 - missing - ambiguous - lowConf
	if highConf < 0 {
		highConf = 0
	}

	segments := make([]ambiguityMixSegment, 0, 4)
	if highConf > 0 {
		segments = append(segments, ambiguityMixSegment{Name: "High Confidence", Pct: highConf})
	}
	if lowConf > 0 {
		segments = append(segments, ambiguityMixSegment{Name: "Low Confidence", Pct: lowConf})
	}
	if ambiguous > 0 {
		segments = append(segments, ambiguityMixSegment{Name: "Ambiguous", Pct: ambiguous})
	}
	if missing > 0 {
		segments = append(segments, ambiguityMixSegment{Name: "Missing Refs", Pct: missing})
	}

	clearingPct := roundPct(avgAttachmentConfidence * 100)
	return segments, clearingPct
}
