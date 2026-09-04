package isolation

// forest.go — Isolation Forest anomaly detection for Pattern Intelligence.
//
// WHAT IS ISOLATION FOREST?
// It detects anomalous batches by asking: "how easy is it to isolate this batch
// from all others using random splits?"
//
// Key insight:
//   Normal batches: blend in with others, need MANY random splits to isolate → LONG path
//   Anomalous batches: are unusual, isolated quickly with FEW random splits → SHORT path
//
// ALGORITHM (step by step):
//   1. Build N random trees on a subsample of training data.
//   2. Each tree node randomly picks:
//        - a feature (e.g. "ambiguity_score")
//        - a threshold between min and max of that feature in current subset
//      and splits the data into "< threshold" (left) and ">= threshold" (right).
//   3. Grow until each point is alone (or max depth is reached).
//   4. For a new point, measure average path length across all trees.
//   5. Convert to anomaly score: score = 2^(-avgPathLen / c(n))
//        where c(n) normalises for the sample size n.
//        score ≈ 1.0 → anomaly
//        score ≈ 0.5 → normal
//        score ≈ 0.0 → very normal
//
// FEATURES WE USE FOR BATCH ANOMALY DETECTION:
//   [0] ambiguity_rate         — normalized ambiguity signal (0–1)
//   [1] variance_rate          — total_variance / total_intended (0–1)
//   [2] settlement_gap         — 1 - settlement_ratio (0–1)
//   [3] unresolved_ratio       — unresolved decisions / total decisions (0–1)
//   [4] missing_ref_rate       — weak / missing attachment refs (0–1)
//
// STANDARD HYPER-PARAMETERS (from original paper, Liu et al. 2008):
//   nTrees    = 100   (more trees = more stable score, diminishing returns after 100)
//   subSample = 256   (small subsample intentionally — IF works best with small batches)
//
// The implementation is pure Go (no external libraries).

import (
	"math"
	"math/rand"
)

// FeatureNames documents what each feature index means.
// Keep this in sync with BuildFeatures().
var FeatureNames = []string{
	"ambiguity_rate",
	"variance_rate",
	"settlement_gap",
	"unresolved_ratio",
	"missing_ref_rate",
}

// Result from scoring one sample.
type Result struct {
	Score       float64 // 0.0–1.0 (higher = more anomalous)
	Level       string  // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
	AnomalyType string  // which feature contributed most (human-readable)
}

// Forest is an Isolation Forest.
// Call Fit() with training data, then Score() for each new batch.
type Forest struct {
	trees     []*iNode
	nTrees    int
	subSample int
	maxDepth  int
	nFeatures int
	rng       *rand.Rand
}

// iNode is one node in an isolation tree.
// If left == nil, this is a leaf (isolated point or max-depth reached).
type iNode struct {
	left      *iNode
	right     *iNode
	splitFeat int     // which feature index to split on
	splitVal  float64 // threshold: go left if sample[splitFeat] < splitVal
	size      int     // number of training points that reached this node
}

// New creates a Forest with standard hyper-parameters.
// Use nTrees=100, subSample=256 for production.
// Use nTrees=50, subSample=64 for development/testing.
func New(nTrees, subSample int) *Forest {
	return &Forest{
		nTrees:    nTrees,
		subSample: subSample,
		rng:       rand.New(rand.NewSource(42)), // fixed seed for reproducibility
	}
}

// BuildFeatures constructs the 5-dimensional feature vector for a batch.
// Always call this to guarantee correct feature ordering.
func BuildFeatures(
	ambiguityRate float64,
	varianceRate float64,
	settlementRatio float64,
	unresolvedRatio float64,
	missingRefRate float64,
) []float64 {
	return []float64{
		clamp01(ambiguityRate),         // [0]
		clamp01(varianceRate),          // [1]
		clamp01(1.0 - settlementRatio), // [2]
		clamp01(unresolvedRatio),       // [3]
		clamp01(missingRefRate),        // [4]
	}
}

// Fit trains the forest on historical batch feature vectors.
// data[i] is the feature vector for one batch.
// Minimum recommended: 10 samples. Below that, scores are unreliable.
//
// This is O(nTrees × subSample × log(subSample)) — fast even for hundreds of trees.
func (f *Forest) Fit(data [][]float64) {
	if len(data) == 0 {
		return
	}
	f.nFeatures = len(data[0])
	f.maxDepth = int(math.Ceil(math.Log2(float64(f.subSample))))

	f.trees = make([]*iNode, f.nTrees)
	for i := range f.trees {
		sample := f.drawSubsample(data)
		f.trees[i] = f.growTree(sample, 0)
	}
}

// IsTrained returns true if Fit() has been called with data.
func (f *Forest) IsTrained() bool {
	return len(f.trees) > 0
}

// Score returns the anomaly score (0.0–1.0) for one feature vector.
// Higher score = more anomalous = batch looks unusual vs the training set.
//
// IMPORTANT: call Fit() before Score(). If not fitted, returns 0.5 (neutral).
func (f *Forest) Score(sample []float64) Result {
	if !f.IsTrained() {
		return Result{Score: 0.5, Level: "LOW", AnomalyType: "not_trained"}
	}

	// Average path length across all trees
	totalPathLen := 0.0
	for _, tree := range f.trees {
		totalPathLen += pathLen(sample, tree, 0)
	}
	avgPath := totalPathLen / float64(len(f.trees))

	// Normalize: c(subSample) is the expected path length for a "normal" point
	cn := cFactor(f.subSample)
	score := 0.5
	if cn > 0 {
		score = math.Pow(2, -avgPath/cn)
	}
	score = clamp01(score)

	level := levelFromScore(score)
	anomalyType := f.dominantAnomalyType(sample)

	return Result{
		Score:       score,
		Level:       level,
		AnomalyType: anomalyType,
	}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// drawSubsample picks subSample rows at random (with replacement) from data.
// Sampling with replacement is standard for ensemble methods.
func (f *Forest) drawSubsample(data [][]float64) [][]float64 {
	n := f.subSample
	if n > len(data) {
		n = len(data)
	}
	sample := make([][]float64, n)
	for i := range sample {
		sample[i] = data[f.rng.Intn(len(data))]
	}
	return sample
}

// growTree recursively builds one isolation tree.
// Returns a leaf when:
//   - Only 1 data point remains (fully isolated)
//   - Max depth is reached (approximation for large subsets)
func (f *Forest) growTree(data [][]float64, depth int) *iNode {
	node := &iNode{size: len(data)}

	// Leaf conditions
	if len(data) <= 1 || depth >= f.maxDepth {
		return node
	}

	// Randomly pick a feature to split on
	feat := f.rng.Intn(f.nFeatures)

	// Find the range of this feature in the current data subset
	minVal, maxVal := data[0][feat], data[0][feat]
	for _, row := range data {
		if row[feat] < minVal {
			minVal = row[feat]
		}
		if row[feat] > maxVal {
			maxVal = row[feat]
		}
	}

	// If all values are the same, we can't split — make it a leaf
	if minVal == maxVal {
		return node
	}

	// Random split threshold uniformly between min and max
	threshold := minVal + f.rng.Float64()*(maxVal-minVal)
	node.splitFeat = feat
	node.splitVal = threshold

	// Partition data into left (< threshold) and right (>= threshold)
	var leftData, rightData [][]float64
	for _, row := range data {
		if row[feat] < threshold {
			leftData = append(leftData, row)
		} else {
			rightData = append(rightData, row)
		}
	}

	node.left = f.growTree(leftData, depth+1)
	node.right = f.growTree(rightData, depth+1)
	return node
}

// pathLen computes the path length for one sample through one tree.
// At a leaf, adds cFactor(leafSize) to account for unresolved subtrees.
func pathLen(sample []float64, node *iNode, depth float64) float64 {
	// Reached a leaf — add adjustment for any remaining points at this leaf
	if node.left == nil && node.right == nil {
		return depth + cFactor(node.size)
	}

	feat := node.splitFeat
	if feat < len(sample) && sample[feat] < node.splitVal {
		if node.left != nil {
			return pathLen(sample, node.left, depth+1)
		}
	} else {
		if node.right != nil {
			return pathLen(sample, node.right, depth+1)
		}
	}
	return depth
}

// cFactor is the normalisation constant from the Isolation Forest paper (Liu et al. 2008).
// It is the expected path length for an unsuccessful binary search tree (BST) search
// in a dataset of size n.
//
// Formula: c(n) = 2 × H(n-1) - 2×(n-1)/n
//   where H(i) = ln(i) + γ  (γ = Euler-Mascheroni constant ≈ 0.5772)
//
// Used to normalize path lengths so scores are comparable across different tree depths.
func cFactor(n int) float64 {
	if n <= 1 {
		return 0
	}
	if n == 2 {
		return 1
	}
	// Euler-Mascheroni constant γ ≈ 0.5772156649
	h := math.Log(float64(n-1)) + 0.5772156649
	return 2*h - 2*float64(n-1)/float64(n)
}

// levelFromScore converts a 0–1 anomaly score to a human-readable level.
// Thresholds are calibrated for Isolation Forest scores (centered around 0.5).
func levelFromScore(score float64) string {
	switch {
	case score >= 0.80:
		return "CRITICAL"
	case score >= 0.65:
		return "HIGH"
	case score >= 0.55:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// dominantAnomalyType identifies which feature is most elevated,
// giving a human-readable description of WHY the batch looks anomalous.
// This is the "explanation" part of explainable ML.
func (f *Forest) dominantAnomalyType(features []float64) string {
	if len(features) < len(FeatureNames) {
		return "UNKNOWN"
	}

	maxVal := 0.0
	maxIdx := 0
	for i, v := range features {
		if v > maxVal {
			maxVal = v
			maxIdx = i
		}
	}

	if maxVal < 0.1 {
		return "NO_DOMINANT_SIGNAL"
	}

	// Map index back to human-readable anomaly type
	switch maxIdx {
	case 0:
		return "HIGH_AMBIGUITY"
	case 1:
		return "HIGH_FINANCIAL_VARIANCE"
	case 2:
		return "LOW_SETTLEMENT_COVERAGE"
	case 3:
		return "HIGH_UNRESOLVED_RATE"
	case 4:
		return "HIGH_MISSING_REF_RATE"
	default:
		return "UNKNOWN"
	}
}

// clamp01 clamps a value to [0, 1].
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
