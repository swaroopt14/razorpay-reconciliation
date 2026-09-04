package logistic

// regression.go — Logistic Regression classifier for Ambiguity risk prediction.
//
// WHAT IS LOGISTIC REGRESSION?
// It predicts the probability that a batch will become ambiguous, given its features.
// Output is always between 0.0 and 1.0 (a probability, not a raw score).
//
// HOW IT WORKS:
//   1. Multiply each feature by a learned weight.
//   2. Sum all (feature × weight) + bias → this gives a raw score "z".
//   3. Pass z through the sigmoid function → probability between 0 and 1.
//
// Sigmoid formula: sigmoid(z) = 1 / (1 + e^(-z))
//   z = +5  → probability ≈ 0.99  (very likely ambiguous)
//   z =  0  → probability = 0.50  (uncertain)
//   z = -5  → probability ≈ 0.01  (very unlikely ambiguous)
//
// FEATURES (what we feed in, in order):
//   [0] ambiguity_rate              — current % of decisions that are ambiguous
//   [1] provider_ref_missing_rate   — % of records missing UTR/RRN/client_ref
//   [2] low_confidence_proxy        — (1 - avg_attachment_confidence), so 0=perfect, 1=worst
//   [3] value_at_risk_rate          — ambiguous_value / total_intended (0–1)
//
// DOMAIN-KNOWLEDGE INITIAL WEIGHTS:
// We do NOT start with zero weights. Zero weights make every prediction = 0.5
// regardless of input, which is useless on day 1.
//
// Instead we encode what domain experts know:
//   - ambiguity_rate is the strongest direct signal    → weight = 3.0
//   - missing provider refs cause ambiguity            → weight = 2.5
//   - low attachment confidence causes ambiguity       → weight = 2.0
//   - high value at risk makes ambiguity more likely   → weight = 1.5
//   - bias = -2.0 keeps the model conservative early on
//
// TRAINING:
// Once real labels exist (batch was ambiguous = 1, was not = 0), call Train()
// for each labeled example. The model improves its weights via stochastic
// gradient descent (SGD) — same math as backprop but for a single layer.
//
// SGD update rule:
//   error     = prediction - true_label
//   new_bias  = old_bias  - learning_rate × error
//   new_weight[i] = old_weight[i] - learning_rate × error × feature[i]

import (
	"encoding/json"
	"math"
)

// FeatureSize is the expected number of input features.
// Changing this requires a model retrain.
const FeatureSize = 4

// Model is a logistic regression binary classifier.
// It is safe to copy; all state is in Weights and Bias.
type Model struct {
	Weights     []float64 `json:"weights"`      // one weight per feature
	Bias        float64   `json:"bias"`         // intercept term
	NumFeatures int       `json:"num_features"` // must equal FeatureSize
	TrainedOn   int       `json:"trained_on"`   // how many examples trained so far
}

// NewAmbiguityModel returns a model pre-loaded with domain-knowledge weights.
// These weights are NOT trained — they encode expert beliefs.
// The model is usable from day 1 and improves as labeled data arrives.
func NewAmbiguityModel() *Model {
	return &Model{
		NumFeatures: FeatureSize,
		Weights:     []float64{3.0, 2.5, 2.0, 1.5},
		Bias:        -2.0,
		TrainedOn:   0,
	}
}

// BuildFeatures constructs the feature vector from raw ambiguity metrics.
// Always call this to ensure consistent feature ordering.
//
// Parameters match the fields available in AmbiguityValue (projection model):
//   ambiguityRate:           AmbiguityValue.AmbiguityRate
//   providerRefMissingRate:  AmbiguityValue.ProviderRefMissingRate
//   avgConfidence:           AmbiguityValue.AvgAttachmentConfidence
//   valueAtRiskMinor:        AmbiguityValue.ValueAtRiskMinor
//   totalIntendedMinor:      from LeakageValue or a separate projection
func BuildFeatures(
	ambiguityRate float64,
	providerRefMissingRate float64,
	avgConfidence float64,
	valueAtRiskMinor float64,
	totalIntendedMinor float64,
) []float64 {
	// Feature 2: invert confidence so higher number = worse signal
	lowConfidenceProxy := 1.0 - clamp01(avgConfidence)

	// Feature 3: value at risk as a rate (0–1), 0 if no intended volume
	varRate := 0.0
	if totalIntendedMinor > 0 {
		varRate = clamp01(valueAtRiskMinor / totalIntendedMinor)
	}

	return []float64{
		clamp01(ambiguityRate),          // [0]
		clamp01(providerRefMissingRate), // [1]
		lowConfidenceProxy,              // [2]
		varRate,                         // [3]
	}
}

// Predict returns the probability (0.0–1.0) that a batch with these features
// will become ambiguous.
//
// A value > 0.5 means "more likely ambiguous than not".
func (m *Model) Predict(features []float64) float64 {
	z := m.Bias
	for i, w := range m.Weights {
		if i < len(features) {
			z += w * features[i]
		}
	}
	return sigmoid(z)
}

// PredictLevel converts a probability to a human-readable risk level.
//   >= 0.80 → CRITICAL
//   >= 0.60 → HIGH
//   >= 0.40 → MEDIUM
//   <  0.40 → LOW
func PredictLevel(prob float64) string {
	switch {
	case prob >= 0.80:
		return "CRITICAL"
	case prob >= 0.60:
		return "HIGH"
	case prob >= 0.40:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// Train updates the model weights using ONE labeled example via SGD.
//
// features: the feature vector for this example (use BuildFeatures).
// label:    1.0 if the batch became ambiguous, 0.0 if it did not.
// learningRate: controls how fast weights change. 0.01 is a safe default.
//   Too high (>0.1) → unstable, weights oscillate.
//   Too low (<0.001) → learns very slowly.
//
// Call this in a loop over all your labeled examples.
// One pass over all examples = one "epoch".
func (m *Model) Train(features []float64, label float64, learningRate float64) {
	pred := m.Predict(features)

	// error = how wrong we were (positive = predicted too high)
	// This is the gradient of binary cross-entropy loss w.r.t. the output.
	err := pred - label

	// Update bias: move in the direction that reduces error
	m.Bias -= learningRate * err

	// Update each weight: if feature[i] > 0 and we predicted too high,
	// reduce weight[i] so future predictions are lower.
	for i := range m.Weights {
		if i < len(features) {
			m.Weights[i] -= learningRate * err * features[i]
		}
	}

	m.TrainedOn++
}

// ToJSON serializes the model so it can be stored in ml_model_registry.
// Store this in ml_model_registry.hyperparameters_json.
func (m *Model) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

// FromJSON restores a model that was previously stored with ToJSON.
// Use this on service startup to reload the last trained weights from DB.
func FromJSON(data []byte) (*Model, error) {
	var m Model
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// sigmoid is the core activation function.
// It squashes any real number into the range (0, 1).
// Input:  any float64 (z = weighted sum of features)
// Output: probability between 0 and 1
func sigmoid(z float64) float64 {
	return 1.0 / (1.0 + math.Exp(-z))
}

// clamp01 ensures a value stays within [0, 1].
// Required because some input rates might slightly exceed 1.0 due to floating-point.
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
