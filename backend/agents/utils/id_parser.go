// Add ID parser utility
// If frontend doesn’t pass intent_id / trace_id, backend can still detect them from user query text
package utils

import "regexp"

var (
	intentRe = regexp.MustCompile(`(?i)\bINT[-_A-Za-z0-9]+\b`)
	traceRe  = regexp.MustCompile(`(?i)\bTRC[-_A-Za-z0-9]+\b`)
)

func ExtractIntentID(q string) string {
	m := intentRe.FindString(q)
	return m
}

func ExtractTraceID(q string) string {
	m := traceRe.FindString(q)
	return m
}
