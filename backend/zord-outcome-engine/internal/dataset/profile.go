package dataset

import "zord-outcome-engine/internal/recon/eval"

var matchedFamilies = map[string]bool{
	"exact": true, "fee_explained": true, "tax_explained": true,
	"failed_no_movement": true, "failed_refund": true,
	"payout_processed_exact": true, "high_confidence": true,
}

func SelectCases(profile string, limit int) []eval.Case {
	all := eval.BuildCorpus()
	if profile == "stress" {
		if limit > 0 && len(all) > limit {
			return all[:limit]
		}
		return all
	}
	var clean, exc []eval.Case
	for _, c := range all {
		if matchedFamilies[c.Family] && !c.Oracle.Exception {
			clean = append(clean, c)
		} else {
			exc = append(exc, c)
		}
	}
	target := limit
	if target <= 0 {
		target = 120
	}
	excTarget := target / 8
	if excTarget < 10 {
		excTarget = 10
	}
	if excTarget > len(exc) {
		excTarget = len(exc)
	}
	cleanTarget := target - excTarget
	if cleanTarget > len(clean) {
		cleanTarget = len(clean)
	}
	out := append([]eval.Case{}, clean[:cleanTarget]...)
	out = append(out, exc[:excTarget]...)
	return out
}
