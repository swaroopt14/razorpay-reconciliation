package zscore

// detector.go — Z-score anomaly detection for Leakage Intelligence.
//
// WHAT IS Z-SCORE?
// Z-score tells us: "how unusual is this value compared to what we normally see?"
//
// Formula: z = (current_value - historical_mean) / historical_stddev
//
// Example:
//   historical leakage rates: [0.01, 0.012, 0.009, 0.011, 0.013, 0.010]
//   mean   = 0.0108
//   stddev = 0.0014
//   today's leakage = 0.045
//   z = (0.045 - 0.0108) / 0.0014 = 24.4  ← CRITICAL anomaly
//
// WHY USE IT FOR LEAKAGE?
// Leakage rates fluctuate day-to-day normally (seasonal patterns, batch sizes).
// A simple threshold like "alert if leakage > 5%" misses spikes relative to
// the tenant's own baseline. Z-score detects "this is abnormal FOR YOU."
//
// SCORING:
//   |z| < 1.0 → LOW     (normal variation)
//   |z| > 1.0 → MEDIUM  (1 stddev above normal)
//   |z| > 2.0 → HIGH    (2 stddevs — unusual, worth investigating)
//   |z| > 3.0 → CRITICAL (3 stddevs — very rare in normal distribution, likely real anomaly)
//
// The raw z is converted to a 0.0–1.0 score by capping at z=3:
//   score = min(|z| / 3.0, 1.0)

import "math"

// Result holds everything produced by a Z-score check.
type Result struct {
	Score  float64 // 0.0–1.0 normalized anomaly score (higher = more anomalous)
	Level  string  // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INSUFFICIENT_DATA"
	ZScore float64 // raw z-score (positive = above mean, negative = below mean)
	Mean   float64 // historical mean used for this computation
	StdDev float64 // historical stddev used for this computation
}

// MinSamples is the minimum number of historical data points needed
// before Z-score is meaningful. With fewer points, stddev is unreliable.
const MinSamples = 5

// Detect computes a Z-score anomaly for currentValue against the history slice.
//
// history: recent historical values of the same metric (oldest first, newest last).
//          e.g., last 30 days of leakage_percentage values.
// currentValue: the value we are checking TODAY.
//
// Returns a Result. If len(history) < MinSamples, returns Level="INSUFFICIENT_DATA"
// because we cannot compute a reliable baseline yet.
func Detect(currentValue float64, history []float64) Result {
	if len(history) < MinSamples {
		return Result{
			Score:  0.0,
			Level:  "INSUFFICIENT_DATA",
			ZScore: 0,
			Mean:   0,
			StdDev: 0,
		}
	}

	mean := computeMean(history)
	stddev := computeStdDev(history, mean)

	// Edge case: all historical values are identical (stddev = 0).
	// If today matches, it's normal. If it differs, it's a complete outlier.
	if stddev == 0 {
		if currentValue == mean {
			return Result{Score: 0.0, Level: "LOW", ZScore: 0, Mean: mean, StdDev: 0}
		}
		return Result{Score: 1.0, Level: "CRITICAL", ZScore: 999, Mean: mean, StdDev: 0}
	}

	// Compute z-score. Positive z = current is above the historical mean.
	z := (currentValue - mean) / stddev
	absZ := math.Abs(z)

	// Convert to 0–1 score: z=3 → score=1.0, z=0 → score=0.0
	score := math.Min(absZ/3.0, 1.0)

	level := levelFromZ(absZ)

	return Result{
		Score:  score,
		Level:  level,
		ZScore: z,
		Mean:   mean,
		StdDev: stddev,
	}
}

// levelFromZ converts |z| to a human-readable anomaly level.
func levelFromZ(absZ float64) string {
	switch {
	case absZ >= 3.0:
		return "CRITICAL"
	case absZ >= 2.0:
		return "HIGH"
	case absZ >= 1.0:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// computeMean returns the arithmetic mean of values.
func computeMean(values []float64) float64 {
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

// computeStdDev returns the population standard deviation.
// Population stddev (divides by N, not N-1) is used here because we treat
// the history as the full reference distribution, not a sample of a larger one.
func computeStdDev(values []float64, mean float64) float64 {
	variance := 0.0
	for _, v := range values {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(values))
	return math.Sqrt(variance)
}
