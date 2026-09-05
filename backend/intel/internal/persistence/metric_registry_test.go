package persistence

// metric_registry_test.go — corrective-action-report P1-04. White-box
// (internal package) tests, no DB required — checkRatioMetric and the
// per-family ratio-check helpers are pure functions over decoded values.

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/models"
)

// successRateRow is a synthetic type mirroring the report's own worked
// example, kept independent of the real projection structs so this test
// documents the general formula, not just one specific field.
type successRateRow struct {
	Successes int
	Total     int
	StoredPct float64
}

var successRateMetric = RatioMetric[successRateRow]{
	Name:        "success_rate",
	Kind:        AggregationRatio,
	Numerator:   func(r successRateRow) float64 { return float64(r.Successes) },
	Denominator: func(r successRateRow) float64 { return float64(r.Total) },
	Stored:      func(r successRateRow) float64 { return r.StoredPct },
}

// TestCheckRatioMetric_ReportWorkedExample reproduces the report's exact
// P1-04 failure example: batch A is 1/1 (100%), batch B is 50/100 (50%).
// Naively averaging the two rates gives 75%, which is wrong. The correct
// combined rate is sum(successes)/sum(total) = 51/101 ≈ 0.50495. This test
// proves checkRatioMetric accepts the correct weighted value and rejects
// the naive-average value.
func TestCheckRatioMetric_ReportWorkedExample(t *testing.T) {
	combined := successRateRow{Successes: 1 + 50, Total: 1 + 100} // 51/101
	correctRate := 51.0 / 101.0

	// Correct: stored value matches the true weighted rate.
	consistent := combined
	consistent.StoredPct = correctRate
	if ok, expected, stored := checkRatioMetric(successRateMetric, consistent); !ok {
		t.Errorf("expected weighted rate %.6f to be accepted, got mismatch (expected=%.6f stored=%.6f)",
			correctRate, expected, stored)
	}

	// Wrong: stored value is the naive average-of-rates (75%), not the
	// volume-weighted combination — this is exactly the bug the report
	// describes and consistency_check.go could not catch before P1-04.
	naive := combined
	naive.StoredPct = 0.75
	if ok, expected, stored := checkRatioMetric(successRateMetric, naive); ok {
		t.Errorf("expected naive average 0.75 to be rejected (true rate=%.6f), but checkRatioMetric accepted it (expected=%.6f stored=%.6f)",
			correctRate, expected, stored)
	}
}

func TestCheckRatioMetric_ZeroDenominatorSkipped(t *testing.T) {
	row := successRateRow{Successes: 0, Total: 0, StoredPct: 0.5} // any stored value
	if ok, _, _ := checkRatioMetric(successRateMetric, row); !ok {
		t.Errorf("zero denominator should be skipped (ok=true), not reported as a mismatch")
	}
}

func TestCheckLeakageRatios(t *testing.T) {
	consistent := models.LeakageValue{
		UnmatchedAmountMinor:      decimal.NewFromInt(100),
		UnderSettlementAmountMinor: decimal.NewFromInt(50),
		ReversalExposureMinor:      decimal.NewFromInt(50),
		TotalIntendedAmountMinor:   decimal.NewFromInt(1000),
		LeakagePercentage:          0.2, // (100+50+50)/1000
	}
	if got := checkLeakageRatios(consistent, "TENANT", "tnt_A"); len(got) != 0 {
		t.Errorf("expected no violations for a self-consistent row, got %+v", got)
	}

	tampered := consistent
	tampered.LeakagePercentage = 0.99 // wrong on purpose
	got := checkLeakageRatios(tampered, "TENANT", "tnt_A")
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 violation for a tampered leakage_percentage, got %d: %+v", len(got), got)
	}
	if got[0].MetricKey != "leakage_percentage[TENANT:tnt_A]" {
		t.Errorf("MetricKey = %q, want %q", got[0].MetricKey, "leakage_percentage[TENANT:tnt_A]")
	}
}

func TestCheckAmbiguityRatios(t *testing.T) {
	consistent := models.AmbiguityValue{
		ConfidenceSum: 83.0, ConfidenceCount: 100, AvgAttachmentConfidence: 0.83,
		TotalDecisions: 100, AmbiguousIntentCount: 8, AmbiguityRate: 0.08,
	}
	if got := checkAmbiguityRatios(consistent, "BATCH", "b_1"); len(got) != 0 {
		t.Errorf("expected no violations for self-consistent rows, got %+v", got)
	}

	tampered := consistent
	tampered.AvgAttachmentConfidence = 0.5 // wrong on purpose
	got := checkAmbiguityRatios(tampered, "BATCH", "b_1")
	found := false
	for _, v := range got {
		if v.MetricKey == "avg_attachment_confidence[BATCH:b_1]" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a violation for tampered avg_attachment_confidence, got %+v", got)
	}
}

func TestCheckDefensibilityRatios(t *testing.T) {
	consistent := models.DefensibilityValue{
		TotalIntents: 100, WithEvidencePack: 80, EvidencePackRate: 0.8,
		AuditReadyPct:      0.4, // (with_evidence_pack + with_governance_decision) / (2 * total_intents) = 80/200
		WithSettlementLeaf: 40, SettlementEvidenceCoverage: 0.5, // 40/80
	}
	if got := checkDefensibilityRatios(consistent, "TENANT", "tnt_A"); len(got) != 0 {
		t.Errorf("expected no violations for self-consistent rows, got %+v", got)
	}

	tampered := consistent
	tampered.EvidencePackRate = 0.1 // wrong on purpose
	got := checkDefensibilityRatios(tampered, "TENANT", "tnt_A")
	found := false
	for _, v := range got {
		if v.MetricKey == "evidence_pack_rate[TENANT:tnt_A]" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a violation for tampered evidence_pack_rate, got %+v", got)
	}
}
