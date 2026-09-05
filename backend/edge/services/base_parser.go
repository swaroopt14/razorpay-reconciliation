package services

import (
	"fmt"
	"strings"

	"github.com/shopspring/decimal"
)

// baseParser provides common utilities for static parsers.
type baseParser struct{}

// get returns the trimmed cell value for a given column index.
func (p *baseParser) get(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

// parseAmount parses a monetary string with arbitrary precision using decimal arithmetic.
// It rejects ambiguous inputs that mix European and US-style separators (e.g. "1.000,50")
// to prevent silent precision errors. Valid inputs: "1234.56", "1,234.56", "-99.9", "100".
func (p *baseParser) parseAmount(raw string) (decimal.Decimal, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return decimal.Zero, fmt.Errorf("amount is empty")
	}

	// Remove leading currency symbols (₹, $, €, £, ¥) and trailing whitespace
	trimmed = strings.TrimSpace(strings.TrimLeft(trimmed, "₹$€£¥"))

	dotCount := strings.Count(trimmed, ".")
	commaCount := strings.Count(trimmed, ",")

	// Reject ambiguous separator combinations:
	// e.g. "1.000,50" (European style) or multiple dots "1.000.000"
	if dotCount > 1 {
		return decimal.Zero, fmt.Errorf("ambiguous amount format (multiple dots): %q", raw)
	}
	if dotCount == 1 && commaCount >= 1 {
		dotIdx := strings.Index(trimmed, ".")
		commaIdx := strings.LastIndex(trimmed, ",")
		if commaIdx > dotIdx {
			// e.g. "1.000,50" — comma is the decimal separator
			return decimal.Zero, fmt.Errorf("ambiguous amount format (comma after dot suggests European style): %q — send as %q", raw, strings.Replace(strings.ReplaceAll(trimmed, ".", ""), ",", ".", 1))
		}
	}

	// Safe to strip thousand-separator commas (US/IN style: "1,234.56" -> "1234.56")
	cleaned := strings.ReplaceAll(trimmed, ",", "")

	dec, err := decimal.NewFromString(cleaned)
	if err != nil {
		return decimal.Zero, fmt.Errorf("cannot parse amount %q: %w", raw, err)
	}
	return dec, nil
}

// buildColIndex creates a map of trimmed header names to indices.
func (p *baseParser) buildColIndex(headers []string) map[string]int {
	m := make(map[string]int, len(headers))
	for i, h := range headers {
		m[strings.ToLower(strings.TrimSpace(h))] = i
	}
	return m
}

// getFromCandidates tries multiple header names and returns the first non-empty value found.
// If the last candidate is not present in colIndex, it is treated as a literal default value.
func (p *baseParser) getFromCandidates(row []string, colIndex map[string]int, candidates ...string) string {
	for i, c := range candidates {
		normalized := strings.ToLower(strings.TrimSpace(c))
		if idx, ok := colIndex[normalized]; ok && idx < len(row) {
			val := strings.TrimSpace(row[idx])
			if val != "" {
				return val
			}
		} else if i == len(candidates)-1 && len(candidates) > 1 {
			// If it's the last candidate and NOT in headers, treat it as a literal default
			// This matches calls like: get("intent_type", "PAYOUT")
			return c
		}
	}
	return ""
}
