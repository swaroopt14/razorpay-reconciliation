package isolation

import (
	"math"
	"testing"
)

// ── Smoke: BuildFeatures ──────────────────────────────────────────────────────

func TestBuildFeatures_Rates(t *testing.T) {
	f := BuildFeatures(0.4, 0.25, 0.6, 0.2, 0.1)
	if math.Abs(f[2]-0.4) > 1e-9 {
		t.Errorf("settlement_gap = %.3f, want 0.4", f[2])
	}
	if math.Abs(f[3]-0.2) > 1e-9 {
		t.Errorf("unresolved_ratio = %.3f, want 0.2", f[3])
	}
	if math.Abs(f[4]-0.1) > 1e-9 {
		t.Errorf("missing_ref_rate = %.3f, want 0.1", f[4])
	}
}

func TestBuildFeatures_ZeroDenominator(t *testing.T) {
	f := BuildFeatures(0.0, 0.1, 0.0, 0.0, 0.0)
	for i, v := range f {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			t.Errorf("feature[%d] = %f (NaN/Inf), want 0", i, v)
		}
	}
}

func TestBuildFeatures_VarianceRate(t *testing.T) {
	f := BuildFeatures(0.0, 0.05, 1.0, 0.0, 0.0)
	if math.Abs(f[1]-0.05) > 1e-6 {
		t.Errorf("variance_rate = %.4f, want 0.05", f[1])
	}
}

func TestBuildFeatures_ClampedToUnit(t *testing.T) {
	f := BuildFeatures(2.0, 9.0, -5.0, 7.0, 4.0)
	for i, v := range f {
		if v < 0 || v > 1 {
			t.Errorf("feature[%d] = %.4f out of [0,1]", i, v)
		}
	}
}

func TestBuildFeatures_Length(t *testing.T) {
	f := BuildFeatures(0.1, 0.1, 0.9, 0.05, 0.02)
	if len(f) != len(FeatureNames) {
		t.Errorf("len(features) = %d, want %d", len(f), len(FeatureNames))
	}
}

// ── cFactor ───────────────────────────────────────────────────────────────────

func TestCFactor_EdgeCases(t *testing.T) {
	if cFactor(0) != 0 {
		t.Errorf("cFactor(0) = %.4f, want 0", cFactor(0))
	}
	if cFactor(1) != 0 {
		t.Errorf("cFactor(1) = %.4f, want 0", cFactor(1))
	}
	// c(2) = 1.0 per paper
	if math.Abs(cFactor(2)-1.0) > 0.001 {
		t.Errorf("cFactor(2) = %.4f, want 1.0", cFactor(2))
	}
}

func TestCFactor_GrowsWithN(t *testing.T) {
	// c(n) should be monotonically increasing for n >= 2 (more nodes = longer avg path)
	prev := cFactor(2)
	for n := 3; n <= 512; n++ {
		curr := cFactor(n)
		if curr <= prev {
			t.Errorf("cFactor not monotone: c(%d)=%.4f <= c(%d)=%.4f", n, curr, n-1, prev)
			break
		}
		prev = curr
	}
}

// ── Forest not trained ────────────────────────────────────────────────────────

func TestForest_ScoreBeforeFit(t *testing.T) {
	// Before Fit(), Score should return neutral result, not panic
	f := New(10, 16)
	sample := BuildFeatures(0.1, 0.0, 0.95, 0.03, 0.01)
	r := f.Score(sample)

	if r.Score != 0.5 {
		t.Errorf("untrained Score = %.3f, want 0.5", r.Score)
	}
	if r.AnomalyType != "not_trained" {
		t.Errorf("AnomalyType = %q, want not_trained", r.AnomalyType)
	}
}

// ── Score range after Fit ─────────────────────────────────────────────────────

func TestForest_FitAndScore_ScoreInRange(t *testing.T) {
	f := New(10, 16)
	data := normalBatches(30)
	f.Fit(data)

	for i, row := range data {
		r := f.Score(row)
		if r.Score < 0 || r.Score > 1 {
			t.Errorf("batch[%d] Score=%.4f out of [0,1]", i, r.Score)
		}
	}
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

func TestForest_AnomalyScoresHigherThanNormal(t *testing.T) {
	// Train on clean batches (low failure/pending rates).
	// An anomalous batch with 80% failure should score significantly higher.
	f := New(100, 64)
	f.Fit(normalBatches(200))

	normalSample := BuildFeatures(0.02, 0.01, 0.98, 0.01, 0.01)
	anomaly := BuildFeatures(0.80, 0.80, 0.20, 0.80, 0.80)

	normalScore := f.Score(normalSample).Score
	anomalyScore := f.Score(anomaly).Score

	if anomalyScore <= normalScore {
		t.Errorf("anomaly score %.4f should be > normal score %.4f", anomalyScore, normalScore)
	}
}

func TestForest_IsTrained(t *testing.T) {
	f := New(10, 16)
	if f.IsTrained() {
		t.Error("should not be trained before Fit()")
	}
	f.Fit(normalBatches(20))
	if !f.IsTrained() {
		t.Error("should be trained after Fit()")
	}
}

// ── levelFromScore thresholds ─────────────────────────────────────────────────

func TestLevelFromScore_Thresholds(t *testing.T) {
	cases := []struct {
		score float64
		want  string
	}{
		{0.80, "CRITICAL"},
		{1.00, "CRITICAL"},
		{0.65, "HIGH"},
		{0.79, "HIGH"},
		{0.55, "MEDIUM"},
		{0.64, "MEDIUM"},
		{0.00, "LOW"},
		{0.54, "LOW"},
	}
	for _, tc := range cases {
		got := levelFromScore(tc.score)
		if got != tc.want {
			t.Errorf("levelFromScore(%.2f) = %q, want %q", tc.score, got, tc.want)
		}
	}
}

// ── dominantAnomalyType ───────────────────────────────────────────────────────

func TestDominantAnomalyType_HighAmbiguity(t *testing.T) {
	fo := New(10, 16)
	fo.Fit(normalBatches(20))
	sample := []float64{0.9, 0.0, 0.0, 0.0, 0.0} // ambiguity is dominant
	got := fo.dominantAnomalyType(sample)
	if got != "HIGH_AMBIGUITY" {
		t.Errorf("dominantAnomalyType = %q, want HIGH_AMBIGUITY", got)
	}
}

func TestDominantAnomalyType_HighFailureRate(t *testing.T) {
	fo := New(10, 16)
	fo.Fit(normalBatches(20))
	sample := []float64{0.0, 0.0, 0.0, 0.85, 0.0}
	got := fo.dominantAnomalyType(sample)
	if got != "HIGH_UNRESOLVED_RATE" {
		t.Errorf("dominantAnomalyType = %q, want HIGH_UNRESOLVED_RATE", got)
	}
}

func TestDominantAnomalyType_AllZero(t *testing.T) {
	fo := New(10, 16)
	fo.Fit(normalBatches(20))
	sample := []float64{0.0, 0.0, 0.0, 0.0, 0.0}
	got := fo.dominantAnomalyType(sample)
	if got != "NO_DOMINANT_SIGNAL" {
		t.Errorf("dominantAnomalyType = %q, want NO_DOMINANT_SIGNAL", got)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// normalBatches generates n healthy batch feature vectors.
// Failure and pending rates are low (< 5%), ambiguity near zero.
func normalBatches(n int) [][]float64 {
	data := make([][]float64, n)
	for i := range data {
		data[i] = BuildFeatures(
			0.01+float64(i%10)*0.001,
			0.005+float64(i%5)*0.002,
			0.95-float64(i%3)*0.01,
			0.01+float64(i%4)*0.005,
			0.01+float64(i%3)*0.003,
		)
	}
	return data
}
