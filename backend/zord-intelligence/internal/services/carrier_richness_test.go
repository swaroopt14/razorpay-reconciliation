package services

// carrier_richness_test.go
//
// Tests for classifyCarrierRichness — ZPI's function that converts the
// float64 score from Service 5B into one of three tiers:
//   RICH    (score > 0.6)  — 3–5 carriers present
//   PARTIAL (score > 0.3)  — 1–2 carriers present
//   POOR    (score <= 0.3) — 0–1 carriers present, high ambiguity risk
//
// WHY THESE CASES:
//   - Exact boundary values (0.3, 0.6) confirm which side they fall on.
//   - Values just above/below the boundary catch off-by-one threshold mistakes.
//   - Clear mid-range values confirm the happy path for each tier.
//   - Zero score = no carriers at all. Perfect score = all 5 carriers present.

import "testing"

func TestClassifyCarrierRichness(t *testing.T) {
	tests := []struct {
		name  string
		score float64
		want  string
	}{
		// ── POOR tier (score <= 0.3) ──────────────────────────────────────────
		{name: "no carriers at all", score: 0.0, want: "POOR"},
		{name: "one carrier of five (0.2)", score: 0.2, want: "POOR"},
		{name: "just below partial boundary", score: 0.29, want: "POOR"},
		{name: "exact partial boundary is POOR", score: 0.3, want: "POOR"}, // 0.3 is NOT > 0.3

		// ── PARTIAL tier (score > 0.3 and <= 0.6) ────────────────────────────
		{name: "just above partial boundary", score: 0.31, want: "PARTIAL"},
		{name: "two carriers of five (0.4)", score: 0.4, want: "PARTIAL"},
		{name: "mid partial", score: 0.5, want: "PARTIAL"},
		{name: "exact rich boundary is PARTIAL", score: 0.6, want: "PARTIAL"}, // 0.6 is NOT > 0.6

		// ── RICH tier (score > 0.6) ───────────────────────────────────────────
		{name: "just above rich boundary", score: 0.61, want: "RICH"},
		{name: "four carriers of five (0.8)", score: 0.8, want: "RICH"},
		{name: "all five carriers present", score: 1.0, want: "RICH"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyCarrierRichness(tc.score)
			if got != tc.want {
				t.Errorf("classifyCarrierRichness(%.2f) = %q, want %q",
					tc.score, got, tc.want)
			}
		})
	}
}

// TestClassifyCarrierRichness_ThresholdConstants confirms the named constants
// match the documented boundaries. If someone changes the values, this test
// fails loudly rather than silently shifting all carrier classifications.
func TestClassifyCarrierRichness_ThresholdConstants(t *testing.T) {
	if carrierRichnessRichThreshold != 0.6 {
		t.Errorf("carrierRichnessRichThreshold = %.2f, want 0.60 (agreed with Service 5B on 2026-05-06)",
			carrierRichnessRichThreshold)
	}
	if carrierRichnessPartialThreshold != 0.3 {
		t.Errorf("carrierRichnessPartialThreshold = %.2f, want 0.30 (agreed with Service 5B on 2026-05-06)",
			carrierRichnessPartialThreshold)
	}
}
