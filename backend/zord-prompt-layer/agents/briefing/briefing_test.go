package briefing

import "testing"

func TestTemplateHasNoLossClaim(t *testing.T) {
	r := Write(Report{Records: 120, Matched: 106, Exceptions: 14, MatchRate: 0.883, UnresolvedExposureMinor: 12845, FalseResolutions: 0, ThroughputPerS: 1800}, nil)
	if r.Source != "template" {
		t.Fatalf("source=%s", r.Source)
	}
	if containsAny(r.Briefing, "STUCK") {
		t.Fatalf("%s", r.Briefing)
	}
	low := toLower(r.Briefing)
	if contains(low, "we lost") || contains(low, "was lost") {
		t.Fatalf("%s", r.Briefing)
	}
	if contains(low, "is fully reconciled") && !contains(low, "not fully") {
		t.Fatalf("%s", r.Briefing)
	}
}

func TestRewriteInjectingLossIsDiscarded(t *testing.T) {
	r := Write(Report{Records: 10, Matched: 8, Exceptions: 2, MatchRate: 0.8, UnresolvedExposureMinor: 5000}, func(string) (string, error) {
		return "We lost 50000 rupees and 13 records are STUCK.", nil
	})
	if r.Source != "template" {
		t.Fatalf("must discard rewrite, got %s: %s", r.Source, r.Briefing)
	}
}

func TestRewriteKeepingNumbersAccepted(t *testing.T) {
	rep := Report{Records: 10, Matched: 8, Exceptions: 2, MatchRate: 0.8, UnresolvedExposureMinor: 5000, ThroughputPerS: 12}
	base := Template(rep)
	r := Write(rep, func(string) (string, error) { return base, nil })
	if r.Source != "gemini" {
		t.Fatalf("source=%s", r.Source)
	}
}

func containsAny(s string, needles ...string) bool {
	low := toLower(s)
	for _, n := range needles {
		if contains(low, toLower(n)) {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
