package eval

import (
	"encoding/json"
	"testing"
)

func TestCorpusSizeAndFamilies(t *testing.T) {
	cases := BuildCorpus()
	if len(cases) < 100 {
		t.Fatalf("corpus=%d want >= 100", len(cases))
	}
	seen := map[string]int{}
	ids := map[string]bool{}
	for _, c := range cases {
		seen[c.Family]++
		if ids[c.ID] {
			t.Fatalf("duplicate id %s", c.ID)
		}
		ids[c.ID] = true
		if c.Amount <= 0 {
			t.Fatalf("%s amount=%d", c.ID, c.Amount)
		}
		if c.Oracle.Result == "" || c.Truth.Result == "" {
			t.Fatalf("%s missing labels", c.ID)
		}
	}
	for _, f := range RequiredFamilies() {
		if seen[f] == 0 {
			t.Fatalf("missing family %s", f)
		}
	}
}

func TestPhase11HarnessMetrics(t *testing.T) {
	cases := BuildCorpus()
	preds := Run(cases)
	if len(preds) != len(cases) {
		t.Fatalf("preds=%d cases=%d", len(preds), len(cases))
	}
	rep := Evaluate(cases, preds)
	if rep.N < 100 {
		t.Fatalf("n=%d", rep.N)
	}
	if rep.Regression.Accuracy != 1 {
		t.Fatalf("regression accuracy=%v mismatches=%v", rep.Regression.Accuracy, rep.Regression.Mismatches)
	}
	if rep.ROCAUC != nil || rep.PRAUC != nil {
		t.Fatal("ROC-AUC/PR-AUC must stay omitted")
	}
	if rep.Quality.Precision == 0 && rep.Quality.Recall == 0 {
		t.Fatal("precision/recall were not computed")
	}
	if rep.Quality.F1 == 0 {
		t.Fatal("F1 was not computed")
	}
	if rep.Quality.FalseMatchRate > 0.001 {
		t.Fatalf("false_match_rate=%v want ~0 after partial/duplicate fixes", rep.Quality.FalseMatchRate)
	}
	if rep.Quality.ExceptionCaptureRate < 0.8 {
		t.Fatalf("exception capture=%v", rep.Quality.ExceptionCaptureRate)
	}
	if rep.Quality.EvidenceCompleteness < 0.9 {
		t.Fatalf("evidence completeness=%v", rep.Quality.EvidenceCompleteness)
	}
	if rep.Latency.ThroughputPerS <= 0 {
		t.Fatal("throughput not computed")
	}
	raw, _ := json.Marshal(rep)
	if string(raw) == "" {
		t.Fatal("empty report")
	}
	t.Logf("phase11 n=%d regression=%.3f precision=%.3f recall=%.3f f1=%.3f false_match=%.3f capture=%.3f amt_acc=%.3f ev=%.3f thru=%.0f/s",
		rep.N, rep.Regression.Accuracy, rep.Quality.Precision, rep.Quality.Recall, rep.Quality.F1,
		rep.Quality.FalseMatchRate, rep.Quality.ExceptionCaptureRate, rep.Quality.AmountWeightedAccuracy,
		rep.Quality.EvidenceCompleteness, rep.Latency.ThroughputPerS)
}

func TestFailedNoMovementIsMatchedNotException(t *testing.T) {
	var c Case
	for _, x := range BuildCorpus() {
		if x.Family == "failed_no_movement" {
			c = x
			break
		}
	}
	preds := Run([]Case{c})
	if preds[0].Result != "MATCHED" || preds[0].Exception || preds[0].BankCredit {
		t.Fatalf("%+v", preds[0])
	}
}

func TestExactIsBankCreditProven(t *testing.T) {
	var c Case
	for _, x := range BuildCorpus() {
		if x.Family == "exact" {
			c = x
			break
		}
	}
	preds := Run([]Case{c})
	if !preds[0].BankCredit || preds[0].Exception {
		t.Fatalf("%+v", preds[0])
	}
}
