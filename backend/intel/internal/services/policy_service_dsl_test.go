package services

import (
	"strings"
	"testing"

	"github.com/zord/zord-intelligence/internal/models"
)

// ── helpers ──────────────────────────────────────────────────────────────────

// ctx builds a minimal eval context with the given key-value pairs.
func ctx(pairs ...any) map[string]float64 {
	m := make(map[string]float64, len(pairs)/2)
	for i := 0; i < len(pairs)-1; i += 2 {
		m[pairs[i].(string)] = pairs[i+1].(float64)
	}
	return m
}

// ── Basic condition tests ─────────────────────────────────────────────────────

func TestEvaluateDSL_BasicCondition(t *testing.T) {
	dsl := "WHEN leakage.total_amount_minor > 500000\nTHEN ACTION ESCALATE severity=HIGH"

	t.Run("fires when above threshold", func(t *testing.T) {
		fires, decision, confidence, _, severity := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 750000.0,
		))
		if !fires {
			t.Fatal("expected policy to fire")
		}
		if decision != models.DecisionEscalate {
			t.Errorf("decision = %q, want ESCALATE", decision)
		}
		if severity != "HIGH" {
			t.Errorf("severity = %q, want HIGH", severity)
		}
		if confidence < 0.5 || confidence > 1.0 {
			t.Errorf("confidence = %.3f, want in [0.5, 1.0]", confidence)
		}
	})

	t.Run("does not fire when below threshold", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 100000.0,
		))
		if fires {
			t.Fatal("expected policy NOT to fire when value is below threshold")
		}
	})

	t.Run("does not fire when exactly at threshold (strict >)", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 500000.0,
		))
		if fires {
			t.Fatal("strict > should not fire when value equals threshold")
		}
	})

	t.Run("fires on less-than operator", func(t *testing.T) {
		ltDSL := "WHEN defensibility.audit_ready_pct < 0.70\nTHEN ACTION NOTIFY severity=MEDIUM"
		fires, decision, _, _, _ := evaluateDSL(ltDSL, ctx(
			"defensibility.audit_ready_pct", 0.55,
		))
		if !fires {
			t.Fatal("expected < policy to fire")
		}
		if decision != models.DecisionNotify {
			t.Errorf("decision = %q, want NOTIFY", decision)
		}
	})

	t.Run("fires on greater-than-or-equal operator", func(t *testing.T) {
		geDSL := "WHEN leakage.percentage >= 0.25\nTHEN ACTION ESCALATE severity=HIGH"
		fires, _, _, _, _ := evaluateDSL(geDSL, ctx(
			"leakage.percentage", 0.25,
		))
		if !fires {
			t.Fatal(">= should fire when value equals threshold")
		}
	})

	t.Run("fires on equality operator", func(t *testing.T) {
		eqDSL := "WHEN corridor.total_pending == 0\nTHEN ACTION ALLOW severity=LOW"
		fires, _, _, _, _ := evaluateDSL(eqDSL, ctx(
			"corridor.total_pending", 0.0,
		))
		if !fires {
			t.Fatal("== should fire when value equals threshold")
		}
	})

	t.Run("payload contains fired condition", func(t *testing.T) {
		fires, _, _, payload, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 999999.0,
		))
		if !fires {
			t.Fatal("expected policy to fire")
		}
		if !strings.Contains(payload, "leakage.total_amount_minor") {
			t.Errorf("payload should reference the fired metric, got: %s", payload)
		}
	})

	t.Run("does not fire when metric is missing from context", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx()) // empty context
		if fires {
			t.Fatal("should not fire when the metric is absent from eval context")
		}
	})
}

// ── AND logic tests ───────────────────────────────────────────────────────────

func TestEvaluateDSL_ANDLogic(t *testing.T) {
	dsl := "WHEN leakage.total_amount_minor > 500000 AND leakage.percentage > 0.025\nTHEN ACTION ESCALATE severity=HIGH"

	t.Run("fires when both conditions true", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 600000.0,
			"leakage.percentage", 0.05,
		))
		if !fires {
			t.Fatal("AND: both conditions true should fire")
		}
	})

	t.Run("does not fire when only first condition true", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 600000.0,
			"leakage.percentage", 0.01, // below 0.025
		))
		if fires {
			t.Fatal("AND: second condition false should prevent firing")
		}
	})

	t.Run("does not fire when only second condition true", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 100000.0, // below 500000
			"leakage.percentage", 0.05,
		))
		if fires {
			t.Fatal("AND: first condition false should prevent firing")
		}
	})
}

// ── OR logic tests ────────────────────────────────────────────────────────────

func TestEvaluateDSL_ORLogic(t *testing.T) {
	dsl := "WHEN ambiguity.value_at_risk_minor > 1000000 OR ambiguity.rate > 0.05\nTHEN ACTION NOTIFY severity=MEDIUM"

	t.Run("fires when first OR branch is true", func(t *testing.T) {
		fires, decision, _, _, _ := evaluateDSL(dsl, ctx(
			"ambiguity.value_at_risk_minor", 1500000.0,
			"ambiguity.rate", 0.01, // false — but OR means one is enough
		))
		if !fires {
			t.Fatal("OR: first branch true should fire")
		}
		if decision != models.DecisionNotify {
			t.Errorf("decision = %q, want NOTIFY", decision)
		}
	})

	t.Run("fires when second OR branch is true", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"ambiguity.value_at_risk_minor", 500000.0, // false
			"ambiguity.rate", 0.10,                   // true
		))
		if !fires {
			t.Fatal("OR: second branch true should fire")
		}
	})

	t.Run("fires when both OR branches are true", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"ambiguity.value_at_risk_minor", 2000000.0,
			"ambiguity.rate", 0.10,
		))
		if !fires {
			t.Fatal("OR: both branches true should fire")
		}
	})

	t.Run("does not fire when both OR branches are false", func(t *testing.T) {
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"ambiguity.value_at_risk_minor", 100000.0,
			"ambiguity.rate", 0.01,
		))
		if fires {
			t.Fatal("OR: both branches false should not fire")
		}
	})

	t.Run("mixed AND within OR groups — (A AND B) OR (C AND D)", func(t *testing.T) {
		mixed := "WHEN leakage.total_amount_minor > 500000 AND leakage.percentage > 0.025 OR ambiguity.rate > 0.10 AND ambiguity.value_at_risk_minor > 2000000\nTHEN ACTION ESCALATE severity=HIGH"

		// First group passes (leakage both true), second group irrelevant
		fires, _, _, _, _ := evaluateDSL(mixed, ctx(
			"leakage.total_amount_minor", 600000.0,
			"leakage.percentage", 0.05,
			"ambiguity.rate", 0.05,            // false
			"ambiguity.value_at_risk_minor", 1000.0, // false
		))
		if !fires {
			t.Fatal("mixed AND/OR: first group passing should fire")
		}

		// Second group passes, first group fails
		fires, _, _, _, _ = evaluateDSL(mixed, ctx(
			"leakage.total_amount_minor", 100.0,  // false
			"leakage.percentage", 0.001,           // false
			"ambiguity.rate", 0.15,               // true
			"ambiguity.value_at_risk_minor", 3000000.0, // true
		))
		if !fires {
			t.Fatal("mixed AND/OR: second group passing should fire")
		}

		// Both groups fail
		fires, _, _, _, _ = evaluateDSL(mixed, ctx(
			"leakage.total_amount_minor", 100.0,
			"leakage.percentage", 0.001,
			"ambiguity.rate", 0.05,
			"ambiguity.value_at_risk_minor", 500.0,
		))
		if fires {
			t.Fatal("mixed AND/OR: both groups failing should not fire")
		}
	})
}

// ── Malformed DSL tests ───────────────────────────────────────────────────────

func TestEvaluateDSL_MalformedDSL(t *testing.T) {
	evalCtx := ctx("leakage.total_amount_minor", 999999.0)

	cases := []struct {
		name string
		dsl  string
	}{
		{
			name: "empty DSL",
			dsl:  "",
		},
		{
			name: "missing WHEN line",
			dsl:  "THEN ACTION ESCALATE severity=HIGH",
		},
		{
			name: "missing THEN line",
			dsl:  "WHEN leakage.total_amount_minor > 500000",
		},
		{
			name: "condition with too few tokens",
			dsl:  "WHEN leakage.total_amount_minor\nTHEN ACTION ESCALATE severity=HIGH",
		},
		{
			name: "unknown operator",
			dsl:  "WHEN leakage.total_amount_minor != 500000\nTHEN ACTION ESCALATE severity=HIGH",
		},
		{
			name: "THEN line with no decision token",
			dsl:  "WHEN leakage.total_amount_minor > 500000\nTHEN ACTION",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fires, _, _, _, _ := evaluateDSL(tc.dsl, evalCtx)
			if fires {
				t.Errorf("malformed DSL %q should not fire", tc.name)
			}
		})
	}
}

// ── Time-threshold tests ──────────────────────────────────────────────────────

func TestEvaluateDSL_TimeThreshold(t *testing.T) {
	t.Run("hours suffix: 6h parsed as 21600 seconds", func(t *testing.T) {
		dsl := "WHEN corridor.finality_p95_seconds > 6h\nTHEN ACTION ESCALATE severity=HIGH"
		// 6h = 21600s; pass a value of 25000s (above threshold)
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"corridor.finality_p95_seconds", 25000.0,
		))
		if !fires {
			t.Fatal("6h threshold: 25000s should fire for > 6h (21600s)")
		}

		// Value below threshold: should not fire
		fires, _, _, _, _ = evaluateDSL(dsl, ctx(
			"corridor.finality_p95_seconds", 3600.0,
		))
		if fires {
			t.Fatal("6h threshold: 3600s should NOT fire for > 6h (21600s)")
		}
	})

	t.Run("minutes suffix: 30m parsed as 1800 seconds", func(t *testing.T) {
		dsl := "WHEN corridor.finality_p95_seconds > 30m\nTHEN ACTION NOTIFY severity=MEDIUM"
		// 30m = 1800s; pass 2000s
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"corridor.finality_p95_seconds", 2000.0,
		))
		if !fires {
			t.Fatal("30m threshold: 2000s should fire for > 30m (1800s)")
		}
	})

	t.Run("seconds suffix: 90s parsed as 90 seconds", func(t *testing.T) {
		dsl := "WHEN corridor.finality_p50_seconds > 90s\nTHEN ACTION NOTIFY severity=LOW"
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"corridor.finality_p50_seconds", 120.0,
		))
		if !fires {
			t.Fatal("90s threshold: 120s should fire for > 90s")
		}

		fires, _, _, _, _ = evaluateDSL(dsl, ctx(
			"corridor.finality_p50_seconds", 45.0,
		))
		if fires {
			t.Fatal("90s threshold: 45s should NOT fire for > 90s")
		}
	})

	t.Run("plain number threshold works alongside time suffix", func(t *testing.T) {
		// Ensure plain numbers still parse correctly after time-suffix logic
		dsl := "WHEN corridor.total_pending > 100\nTHEN ACTION NOTIFY severity=LOW"
		fires, _, _, _, _ := evaluateDSL(dsl, ctx(
			"corridor.total_pending", 150.0,
		))
		if !fires {
			t.Fatal("plain numeric threshold 100: 150 should fire")
		}
	})
}

// ── Confidence tests ──────────────────────────────────────────────────────────

func TestEvaluateDSL_Confidence(t *testing.T) {
	dsl := "WHEN leakage.total_amount_minor > 500000\nTHEN ACTION ESCALATE severity=HIGH"

	t.Run("confidence increases with distance from threshold", func(t *testing.T) {
		_, _, confBarelyOver, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 500001.0,
		))
		_, _, confFarOver, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 1500000.0,
		))
		if confBarelyOver >= confFarOver {
			t.Errorf("expected farther breach to have higher confidence: barely=%.4f far=%.4f",
				confBarelyOver, confFarOver)
		}
	})

	t.Run("confidence is clamped to [0.5, 1.0]", func(t *testing.T) {
		// Extreme breach — should be capped at 1.0
		_, _, conf, _, _ := evaluateDSL(dsl, ctx(
			"leakage.total_amount_minor", 50000000.0,
		))
		if conf > 1.0 {
			t.Errorf("confidence should not exceed 1.0, got %.4f", conf)
		}
		if conf < 0.5 {
			t.Errorf("confidence should not be below 0.5, got %.4f", conf)
		}
	})

	t.Run("default severity is MEDIUM when not specified in DSL", func(t *testing.T) {
		noSeverityDSL := "WHEN leakage.total_amount_minor > 500000\nTHEN ACTION ESCALATE"
		fires, _, _, _, severity := evaluateDSL(noSeverityDSL, ctx(
			"leakage.total_amount_minor", 600000.0,
		))
		if !fires {
			t.Fatal("expected policy to fire")
		}
		if severity != "MEDIUM" {
			t.Errorf("default severity = %q, want MEDIUM", severity)
		}
	})
}
