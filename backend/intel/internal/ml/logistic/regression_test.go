package logistic

import (
	"math"
	"testing"
)

// ── Smoke / initialisation tests ──────────────────────────────────────────────

func TestNewAmbiguityModel_InitialWeights(t *testing.T) {
	m := NewAmbiguityModel()

	if m.NumFeatures != FeatureSize {
		t.Errorf("NumFeatures = %d, want %d", m.NumFeatures, FeatureSize)
	}
	if len(m.Weights) != FeatureSize {
		t.Fatalf("len(Weights) = %d, want %d", len(m.Weights), FeatureSize)
	}

	// Verify domain-knowledge priors
	want := []float64{3.0, 2.5, 2.0, 1.5}
	for i, w := range m.Weights {
		if math.Abs(w-want[i]) > 1e-9 {
			t.Errorf("Weights[%d] = %.2f, want %.2f", i, w, want[i])
		}
	}
	if math.Abs(m.Bias-(-2.0)) > 1e-9 {
		t.Errorf("Bias = %.2f, want -2.0", m.Bias)
	}
	if m.TrainedOn != 0 {
		t.Errorf("TrainedOn = %d, want 0", m.TrainedOn)
	}
}

// ── Predict output range ──────────────────────────────────────────────────────

func TestPredict_OutputAlwaysInRange(t *testing.T) {
	m := NewAmbiguityModel()
	cases := [][]float64{
		{0, 0, 0, 0},
		{1, 1, 1, 1},
		{0.5, 0.5, 0.5, 0.5},
		{0.001, 0.001, 0.001, 0.001},
	}
	for _, f := range cases {
		p := m.Predict(f)
		if p < 0 || p > 1 {
			t.Errorf("Predict(%v) = %.4f, want in [0,1]", f, p)
		}
	}
}

func TestPredict_CleanBatch_LowProbability(t *testing.T) {
	// A batch with zero ambiguity and perfect confidence should score low
	m := NewAmbiguityModel()
	features := BuildFeatures(
		0.0,  // ambiguityRate
		0.0,  // providerRefMissingRate
		1.0,  // avgConfidence (perfect)
		0,    // valueAtRiskMinor
		0,    // totalIntendedMinor
	)
	prob := m.Predict(features)
	if prob >= 0.5 {
		t.Errorf("clean batch prob = %.4f, want < 0.5", prob)
	}
}

func TestPredict_AmbiguousBatch_HighProbability(t *testing.T) {
	// A batch with 30% ambiguity, missing refs, low confidence → should flag HIGH/CRITICAL
	m := NewAmbiguityModel()
	features := BuildFeatures(
		0.30,     // ambiguityRate
		0.40,     // providerRefMissingRate
		0.50,     // avgConfidence (weak)
		500_000,  // valueAtRiskMinor
		1_000_000,
	)
	prob := m.Predict(features)
	if prob < 0.5 {
		t.Errorf("ambiguous batch prob = %.4f, want >= 0.5", prob)
	}
}

// ── PredictLevel thresholds ───────────────────────────────────────────────────

func TestPredictLevel_Boundaries(t *testing.T) {
	cases := []struct {
		prob float64
		want string
	}{
		{0.80, "CRITICAL"},
		{0.90, "CRITICAL"},
		{0.60, "HIGH"},
		{0.79, "HIGH"},
		{0.40, "MEDIUM"},
		{0.59, "MEDIUM"},
		{0.00, "LOW"},
		{0.39, "LOW"},
	}
	for _, tc := range cases {
		got := PredictLevel(tc.prob)
		if got != tc.want {
			t.Errorf("PredictLevel(%.2f) = %q, want %q", tc.prob, got, tc.want)
		}
	}
}

// ── BuildFeatures ─────────────────────────────────────────────────────────────

func TestBuildFeatures_ConfidenceIsInverted(t *testing.T) {
	// avgConfidence=0.9 → feature[2] = 1 - 0.9 = 0.1
	f := BuildFeatures(0.0, 0.0, 0.9, 0, 0)
	if math.Abs(f[2]-0.1) > 1e-9 {
		t.Errorf("feature[2] = %.4f, want 0.1 (1 - 0.9)", f[2])
	}
}

func TestBuildFeatures_PerfectConfidence(t *testing.T) {
	// avgConfidence=1.0 → feature[2] = 0.0
	f := BuildFeatures(0.0, 0.0, 1.0, 0, 0)
	if f[2] != 0.0 {
		t.Errorf("feature[2] = %.4f, want 0.0 (perfect confidence)", f[2])
	}
}

func TestBuildFeatures_ValueAtRiskRate(t *testing.T) {
	// valueAtRisk=1000, totalIntended=10000 → feature[3] = 0.1
	f := BuildFeatures(0.0, 0.0, 1.0, 1000, 10000)
	if math.Abs(f[3]-0.1) > 1e-9 {
		t.Errorf("feature[3] = %.4f, want 0.1 (1000/10000)", f[3])
	}
}

func TestBuildFeatures_ZeroTotalIntended(t *testing.T) {
	// totalIntended=0 → feature[3] = 0 (no division by zero)
	f := BuildFeatures(0.0, 0.0, 0.8, 500, 0)
	if f[3] != 0.0 {
		t.Errorf("feature[3] = %.4f, want 0.0 when total=0", f[3])
	}
}

func TestBuildFeatures_ClampToUnit(t *testing.T) {
	// rates > 1 should be clamped to 1.0
	f := BuildFeatures(2.0, 3.0, 0.0, 1000, 100)
	for i, v := range f {
		if v < 0 || v > 1 {
			t.Errorf("feature[%d] = %.4f out of [0,1]", i, v)
		}
	}
}

func TestBuildFeatures_Length(t *testing.T) {
	f := BuildFeatures(0.1, 0.05, 0.9, 100_000, 1_000_000)
	if len(f) != FeatureSize {
		t.Errorf("len(features) = %d, want %d", len(f), FeatureSize)
	}
}

// ── Training via SGD ──────────────────────────────────────────────────────────

func TestTrain_PositiveExampleIncreasesScore(t *testing.T) {
	m := NewAmbiguityModel()
	features := BuildFeatures(0.08, 0.1, 0.8, 50_000, 500_000)

	before := m.Predict(features)
	for i := 0; i < 100; i++ {
		m.Train(features, 1.0, 0.01) // label=1: this batch IS ambiguous
	}
	after := m.Predict(features)

	if after <= before {
		t.Errorf("training on positive example: prob before=%.4f, after=%.4f — should increase", before, after)
	}
}

func TestTrain_NegativeExampleDecreasesScore(t *testing.T) {
	m := NewAmbiguityModel()
	// Give a feature vector the model currently rates as risky
	features := BuildFeatures(0.20, 0.30, 0.40, 200_000, 500_000)

	before := m.Predict(features)
	for i := 0; i < 100; i++ {
		m.Train(features, 0.0, 0.01) // label=0: this batch was NOT actually ambiguous
	}
	after := m.Predict(features)

	if after >= before {
		t.Errorf("training on negative example: prob before=%.4f, after=%.4f — should decrease", before, after)
	}
}

func TestTrain_TrainedOnCounter(t *testing.T) {
	m := NewAmbiguityModel()
	features := BuildFeatures(0.05, 0.05, 0.9, 0, 0)
	m.Train(features, 1.0, 0.01)
	m.Train(features, 0.0, 0.01)
	if m.TrainedOn != 2 {
		t.Errorf("TrainedOn = %d, want 2", m.TrainedOn)
	}
}

// ── Serialisation ─────────────────────────────────────────────────────────────

func TestModelSerialization_RoundTrip(t *testing.T) {
	m := NewAmbiguityModel()
	features := BuildFeatures(0.1, 0.05, 0.85, 100_000, 1_000_000)
	m.Train(features, 1.0, 0.01)

	data, err := m.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON error: %v", err)
	}

	m2, err := FromJSON(data)
	if err != nil {
		t.Fatalf("FromJSON error: %v", err)
	}

	p1 := m.Predict(features)
	p2 := m2.Predict(features)
	if math.Abs(p1-p2) > 1e-9 {
		t.Errorf("round-trip prediction mismatch: %.6f vs %.6f", p1, p2)
	}
	if m2.TrainedOn != m.TrainedOn {
		t.Errorf("TrainedOn mismatch: %d vs %d", m.TrainedOn, m2.TrainedOn)
	}
}

// ── Internal: sigmoid ─────────────────────────────────────────────────────────

func TestSigmoid_KnownValues(t *testing.T) {
	cases := []struct{ z, want float64 }{
		{0, 0.5},
		{100, 1.0},   // effectively 1
		{-100, 0.0},  // effectively 0
	}
	for _, tc := range cases {
		got := sigmoid(tc.z)
		if math.Abs(got-tc.want) > 0.001 {
			t.Errorf("sigmoid(%.0f) = %.6f, want ≈%.1f", tc.z, got, tc.want)
		}
	}
}
