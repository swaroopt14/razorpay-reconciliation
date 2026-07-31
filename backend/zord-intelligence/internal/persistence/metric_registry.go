package persistence

// metric_registry.go — corrective-action-report P1-04.
//
// Before this file, consistency_check.go only understood two states for a
// projection field: ADDITIVE (sum tenant-scope rows, sum batch-scope rows,
// assert equal — every field in the hand-written checks elsewhere in this
// package) or invisible (every derived rate/average field — this package's
// original header comment called these "non-additive, recomputed
// independently at each scope" and excluded them from checking entirely).
// Excluded is not the same as correct: a stale or wrongly-recomputed
// derived field could sit in production undetected forever.
//
// WHY RATIO FIELDS AREN'T CHECKED tenant-sum == batch-sum:
// A rate is not additive — a single batch's success rate can legitimately
// differ from the tenant's overall rate. This is the report's own worked
// example: two batches at 100% (1 payment) and 50% (100 payments) must NOT
// average to 75%; the true combined rate is 51/101 ≈ 0.505. So the useful
// check for a RATIO/WEIGHTED_AVERAGE field is not "does tenant equal batch"
// — it's SELF-consistency: at EACH row independently (tenant-scope row or
// batch-scope row), does the persisted derived value actually equal
// numerator/denominator (recomputed), within a rounding tolerance? That
// catches a real bug class this package could never see before: a stored
// average silently drifting from its own inputs. See consistency_check.go's
// computeLeakageSums/computeAmbiguitySums/computeDefensibilitySums, which
// run this check against every decoded row before folding it into the
// (still purely additive, unchanged) tenant/batch sums.
//
// SCOPE NOTE: the existing ADDITIVE checks (hand-written slices in
// consistency_check.go's verify*Consistency/diff* functions) are NOT
// rewritten to route through this registry — they are already correct and
// tested, and reflecting into arbitrary struct fields by name would trade a
// small amount of duplication for a much larger amount of reflection-driven
// fragility in a codebase that uses none elsewhere. This registry's job is
// specifically to formalize aggregation_kind as a concept and wire in the
// fields that had NO check at all before.

import "math"

// AggregationKind classifies how one projection field must be verified.
// Names match the report's own vocabulary.
type AggregationKind string

const (
	// AggregationAdditive: sum(tenant-scope rows) must equal sum(batch-scope
	// rows). Every field consistency_check.go's hand-written checks already
	// verify. Not represented as RatioMetric entries in this file — see the
	// SCOPE NOTE above.
	AggregationAdditive AggregationKind = "ADDITIVE"

	// AggregationRatio / AggregationWeightedAverage: a derived field computed
	// as Numerator/Denominator, verified for self-consistency (see file doc),
	// never compared tenant-vs-batch directly. Kept as two names because the
	// report's own vocabulary distinguishes them (RATIO: denominator is
	// another amount/count; WEIGHTED_AVERAGE: denominator is specifically a
	// running count backing an incremental average) — mechanically identical
	// here.
	AggregationRatio           AggregationKind = "RATIO"
	AggregationWeightedAverage AggregationKind = "WEIGHTED_AVERAGE"

	// AggregationMax / Min / LastValue / NonAggregatable: reserved per the
	// report's full seven-kind vocabulary. No LEAKAGE/AMBIGUITY/
	// DEFENSIBILITY field needs MAX/MIN/LAST_VALUE today.
	// DisputeReadyPct is NON_AGGREGATABLE — it averages four OTHER derived
	// rates (avg_intent_quality + avg_mapping_confidence +
	// avg_pack_completeness + proof_readiness) / 4, not a single
	// numerator/denominator pair, so it is deliberately NOT registered as a
	// RatioMetric below; this constant documents why a lookup miss for it is
	// expected, not a bug.
	AggregationMax             AggregationKind = "MAX"
	AggregationMin             AggregationKind = "MIN"
	AggregationLastValue       AggregationKind = "LAST_VALUE"
	AggregationNonAggregatable AggregationKind = "NON_AGGREGATABLE"
)

// RatioMetric describes one RATIO/WEIGHTED_AVERAGE field's self-consistency
// formula for a value of type T (models.LeakageValue, AmbiguityValue, or
// DefensibilityValue). Numerator/Denominator/Stored are closures rather than
// field-name strings so composite formulas (e.g. leakage_percentage sums
// three fields before dividing) are expressible without reflection.
type RatioMetric[T any] struct {
	Name        string
	Kind        AggregationKind
	Numerator   func(v T) float64
	Denominator func(v T) float64
	Stored      func(v T) float64
}

// ratioTolerance absorbs JSON float round-trip noise and the incremental
// (running-sum/running-count) update pattern this codebase uses for
// averages — the same epsilon consistency_check.go already used for
// confidence_sum/score_margin_sum comparisons before P1-04.
const ratioTolerance = 1e-6

// checkRatioMetric recomputes Numerator(v)/Denominator(v) and compares it to
// Stored(v). ok=false means a mismatch; expected/stored are always returned
// for the caller to build a descriptive error/violation. A zero denominator
// is reported ok=true (skipped) — an undefined ratio is not this check's
// concern; whatever the projection writer stores for that case is a
// separate correctness question, not a self-consistency one.
func checkRatioMetric[T any](m RatioMetric[T], v T) (ok bool, expected, stored float64) {
	num := m.Numerator(v)
	den := m.Denominator(v)
	if den == 0 {
		return true, 0, 0
	}
	expected = num / den
	stored = m.Stored(v)
	return math.Abs(expected-stored) <= ratioTolerance, expected, stored
}
