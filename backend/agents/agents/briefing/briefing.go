package briefing

import (
	"fmt"
	"regexp"
	"strings"
)

type Report struct {
	Records                 int     `json:"records"`
	Matched                 int     `json:"matched"`
	Exceptions              int     `json:"exceptions"`
	MatchRate               float64 `json:"match_rate"`
	UnresolvedExposureMinor int64   `json:"unresolved_exposure_minor"`
	FalseResolutions        int     `json:"false_resolutions"`
	ThroughputPerS          float64 `json:"throughput_per_s"`
}

type Result struct {
	Briefing    string   `json:"briefing"`
	Source      string   `json:"source"`
	Limitations []string `json:"limitations"`
}

type Rewriter func(prompt string) (string, error)

func Template(r Report) string {
	pct := int(r.MatchRate * 100)
	return fmt.Sprintf(
		"Closed %d records. Match rate %d percent: %d MATCHED, %d exceptions remain. Unresolved exposure is %d (copied from exception variance). False resolutions %d. Settled is not bank credited. MATCHED is not fully reconciled. Throughput %.0f records per second. Root causes are listed; none were guessed.",
		r.Records, pct, r.Matched, r.Exceptions, r.UnresolvedExposureMinor, r.FalseResolutions, r.ThroughputPerS,
	)
}

func Write(r Report, rewrite Rewriter) Result {
	base := Template(r)
	out := Result{
		Briefing:    base,
		Source:      "template",
		Limitations: []string{"Every amount is copied from the close report JSON. Gemini may only rephrase."},
	}
	if rewrite == nil {
		return out
	}
	rewritten, err := rewrite("Rewrite this finance close briefing in 8-12 sentences. Do not add any numbers that are not already present.\n\n" + base)
	if err != nil || strings.TrimSpace(rewritten) == "" {
		return out
	}
	if !numbersSubset(base, rewritten) {
		out.Limitations = append(out.Limitations, "Gemini rewrite discarded: it introduced numbers not in the close report.")
		return out
	}
	out.Briefing = strings.TrimSpace(rewritten)
	out.Source = "gemini"
	return out
}

var numRe = regexp.MustCompile(`\d+`)

func numbersSubset(allowed, candidate string) bool {
	allow := map[string]bool{}
	for _, n := range numRe.FindAllString(allowed, -1) {
		allow[n] = true
	}
	for _, n := range numRe.FindAllString(candidate, -1) {
		if !allow[n] {
			return false
		}
	}
	return true
}
