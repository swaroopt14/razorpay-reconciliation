package utils

import "strings"

func ExtractTimePhraseHeuristic(q string) string {
	s := strings.ToLower(strings.TrimSpace(q))
	if s == "" {
		return ""
	}

	// Minimal fallback only (LLM is primary time parser).
	for _, d := range []string{
		"today", "yesterday",
		"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
		"this month", "last month", "this year", "last year",
	} {
		if strings.Contains(s, d) {
			return d
		}
	}

	return ""
}
