package main

import "testing"

func TestInMemoryCloseMeetsBatchSize(t *testing.T) {
	got := inMemoryClose("realistic", 120)
	n, _ := got["records"].(int)
	if n < 50 {
		t.Fatalf("need 50+ records for the track, got %d (%v)", n, got)
	}
	if _, ok := got["match_rate"]; !ok {
		t.Fatalf("%v", got)
	}
	if got["false_resolutions"] != 0 {
		t.Fatalf("false_resolutions=%v", got["false_resolutions"])
	}
}
