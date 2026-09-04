package zscore

import (
	"math"
	"testing"
)

// ── Smoke tests ───────────────────────────────────────────────────────────────

func TestDetect_InsufficientData(t *testing.T) {
	// fewer than MinSamples → model can't establish a baseline yet
	history := []float64{0.01, 0.02, 0.015, 0.01} // only 4 points
	r := Detect(0.10, history)

	if r.Level != "INSUFFICIENT_DATA" {
		t.Errorf("Level = %q, want INSUFFICIENT_DATA", r.Level)
	}
	if r.Score != 0.0 {
		t.Errorf("Score = %.3f, want 0.0", r.Score)
	}
	if r.ZScore != 0 {
		t.Errorf("ZScore = %.3f, want 0", r.ZScore)
	}
}

func TestDetect_EmptyHistory(t *testing.T) {
	r := Detect(0.05, []float64{})
	if r.Level != "INSUFFICIENT_DATA" {
		t.Errorf("Level = %q, want INSUFFICIENT_DATA", r.Level)
	}
}

// ── Level classification ──────────────────────────────────────────────────────

func TestDetect_LowLevel(t *testing.T) {
	// history: mean=0.01, stddev=0.001  → today at mean → z=0 → LOW
	history := repeat(0.01, 10)
	history[0] = 0.009
	history[1] = 0.011
	r := Detect(0.010, history)

	if r.Level != "LOW" {
		t.Errorf("Level = %q, want LOW", r.Level)
	}
	if r.Score > 0.34 { // |z| < 1 → score < 1/3
		t.Errorf("Score = %.3f, expected < 0.34 for LOW anomaly", r.Score)
	}
}

func TestDetect_MediumLevel(t *testing.T) {
	// mean=0.01, stddev=0.001 → value at 1.5 stddevs → MEDIUM
	history := makeHistory(0.01, 0.001, 10)
	target := 0.01 + 1.5*0.001
	r := Detect(target, history)

	if r.Level != "MEDIUM" {
		t.Errorf("Level = %q, want MEDIUM (z≈1.5)", r.Level)
	}
}

func TestDetect_HighLevel(t *testing.T) {
	// mean=0.01, stddev=0.001 → value at 2.5 stddevs → HIGH
	history := makeHistory(0.01, 0.001, 10)
	target := 0.01 + 2.5*0.001
	r := Detect(target, history)

	if r.Level != "HIGH" {
		t.Errorf("Level = %q, want HIGH (z≈2.5)", r.Level)
	}
}

func TestDetect_CriticalLevel(t *testing.T) {
	// mean=0.01, stddev=0.001 → value at 5 stddevs → CRITICAL
	history := makeHistory(0.01, 0.001, 10)
	target := 0.01 + 5.0*0.001
	r := Detect(target, history)

	if r.Level != "CRITICAL" {
		t.Errorf("Level = %q, want CRITICAL (z≈5.0)", r.Level)
	}
}

// ── Score bounds ──────────────────────────────────────────────────────────────

func TestDetect_ScoreCappedAt1(t *testing.T) {
	// Extreme spike: z >> 3 → score must be exactly 1.0
	history := makeHistory(0.01, 0.001, 10)
	r := Detect(999.0, history)

	if r.Score != 1.0 {
		t.Errorf("Score = %.3f, want 1.0 for extreme anomaly", r.Score)
	}
}

func TestDetect_ScoreAlwaysInRange(t *testing.T) {
	cases := []float64{0, 0.001, 0.01, 0.1, 1.0, 10.0, 100.0}
	history := makeHistory(0.01, 0.001, 10)
	for _, v := range cases {
		r := Detect(v, history)
		if r.Score < 0 || r.Score > 1 {
			t.Errorf("value=%.3f → Score=%.3f, want in [0,1]", v, r.Score)
		}
	}
}

// ── Z-score arithmetic ────────────────────────────────────────────────────────

func TestDetect_ZScoreDirection(t *testing.T) {
	history := makeHistory(0.05, 0.01, 10)

	above := Detect(0.10, history) // above mean → positive z
	if above.ZScore <= 0 {
		t.Errorf("value above mean should give positive z, got %.3f", above.ZScore)
	}

	below := Detect(0.01, history) // below mean → negative z
	if below.ZScore >= 0 {
		t.Errorf("value below mean should give negative z, got %.3f", below.ZScore)
	}
}

func TestDetect_ZScoreAtMean(t *testing.T) {
	// Use even count so alternating ±stddev gives an exact mean.
	history := makeHistory(0.05, 0.005, 10)
	r := Detect(0.05, history) // exactly at mean
	if math.Abs(r.ZScore) > 0.01 {
		t.Errorf("value at mean should give z≈0, got %.4f", r.ZScore)
	}
}

// ── Edge cases ────────────────────────────────────────────────────────────────

func TestDetect_ConstantHistory_SameValue(t *testing.T) {
	// All history identical, today matches → z=0 → LOW
	history := repeat(0.02, 8)
	r := Detect(0.02, history)
	if r.Level != "LOW" {
		t.Errorf("constant history, same value → Level = %q, want LOW", r.Level)
	}
}

func TestDetect_ConstantHistory_DifferentValue(t *testing.T) {
	// All history identical, today differs → stddev=0, z=∞ → CRITICAL
	history := repeat(0.02, 8)
	r := Detect(0.05, history)
	if r.Level != "CRITICAL" {
		t.Errorf("constant history, different value → Level = %q, want CRITICAL", r.Level)
	}
	if r.Score != 1.0 {
		t.Errorf("Score = %.3f, want 1.0", r.Score)
	}
}

func TestDetect_ExactlyMinSamples(t *testing.T) {
	// Exactly MinSamples points → should compute, not return INSUFFICIENT_DATA
	history := makeHistory(0.01, 0.001, MinSamples)
	r := Detect(0.01, history)
	if r.Level == "INSUFFICIENT_DATA" {
		t.Errorf("exactly MinSamples points → should not return INSUFFICIENT_DATA")
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func repeat(v float64, n int) []float64 {
	s := make([]float64, n)
	for i := range s {
		s[i] = v
	}
	return s
}

// makeHistory builds n values with the given target mean and stddev.
// Uses alternating ±stddev offsets to achieve the exact population stddev.
func makeHistory(mean, stddev float64, n int) []float64 {
	s := make([]float64, n)
	for i := range s {
		if i%2 == 0 {
			s[i] = mean + stddev
		} else {
			s[i] = mean - stddev
		}
	}
	return s
}
