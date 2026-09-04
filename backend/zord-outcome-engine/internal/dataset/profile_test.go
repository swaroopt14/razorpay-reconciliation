package dataset

import "testing"

func TestSelectCasesRealisticHasAtLeastFifty(t *testing.T) {
	got := SelectCases("realistic", 120)
	if len(got) < 50 {
		t.Fatalf("got %d", len(got))
	}
	exc := 0
	for _, c := range got {
		if c.Oracle.Exception {
			exc++
		}
	}
	if exc == 0 || exc > len(got)/2 {
		t.Fatalf("exceptions=%d n=%d", exc, len(got))
	}
}

func TestSelectCasesStressUsesCorpus(t *testing.T) {
	got := SelectCases("stress", 0)
	if len(got) < 100 {
		t.Fatalf("stress=%d", len(got))
	}
}
