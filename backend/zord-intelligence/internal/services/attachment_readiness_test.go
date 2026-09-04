package services

// attachment_readiness_test.go
//
// Tests for classifyAttachmentReadiness — the ZPI-owned function that converts
// the float64 score sent by Service 5B into one of three tiers:
//   READY   (score > 0.6)
//   PARTIAL (score > 0.3 and <= 0.6)
//   POOR    (score <= 0.3)
//
// WHY THESE CASES:
//   - Exact boundary values (0.3, 0.6) confirm which side of the fence they fall on.
//   - Values just above/below the boundary catch off-by-one threshold mistakes.
//   - Clear mid-range values confirm the happy path for each tier.
//   - Zero and 1.0 are the absolute floor and ceiling of the score range.

import "testing"

func TestClassifyAttachmentReadiness(t *testing.T) {
	tests := []struct {
		name  string
		score float64
		want  string
	}{
		// ── POOR tier (score <= 0.3) ──────────────────────────────────────────
		{name: "zero score", score: 0.0, want: "POOR"},
		{name: "low score", score: 0.1, want: "POOR"},
		{name: "just below partial boundary", score: 0.29, want: "POOR"},
		{name: "exact partial boundary is POOR", score: 0.3, want: "POOR"}, // 0.3 is NOT > 0.3

		// ── PARTIAL tier (score > 0.3 and <= 0.6) ────────────────────────────
		{name: "just above partial boundary", score: 0.31, want: "PARTIAL"},
		{name: "mid partial", score: 0.5, want: "PARTIAL"},
		{name: "exact ready boundary is PARTIAL", score: 0.6, want: "PARTIAL"}, // 0.6 is NOT > 0.6

		// ── READY tier (score > 0.6) ──────────────────────────────────────────
		{name: "just above ready boundary", score: 0.61, want: "READY"},
		{name: "mid ready", score: 0.8, want: "READY"},
		{name: "perfect score", score: 1.0, want: "READY"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyAttachmentReadiness(tc.score)
			if got != tc.want {
				t.Errorf("classifyAttachmentReadiness(%.2f) = %q, want %q",
					tc.score, got, tc.want)
			}
		})
	}
}

// TestClassifyAttachmentReadiness_ThresholdConstants confirms the named constants
// match the documented boundaries. If someone changes the constant values, this
// test fails loudly rather than silently shifting all classifications.
func TestClassifyAttachmentReadiness_ThresholdConstants(t *testing.T) {
	if attachReadinessReadyThreshold != 0.6 {
		t.Errorf("attachReadinessReadyThreshold = %.2f, want 0.60 (agreed with Service 5B on 2026-05-06)",
			attachReadinessReadyThreshold)
	}
	if attachReadinessPartialThreshold != 0.3 {
		t.Errorf("attachReadinessPartialThreshold = %.2f, want 0.30 (agreed with Service 5B on 2026-05-06)",
			attachReadinessPartialThreshold)
	}
}
