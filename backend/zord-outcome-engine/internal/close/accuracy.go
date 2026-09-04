package close

import (
	"zord-outcome-engine/internal/recon"
)

func ComputeAccuracy(truth []groundTruthRow, results []recon.FinancialResult) AccuracyReport {
	byEntity := map[string]recon.FinancialResult{}
	for _, r := range results {
		byEntity[r.EntityType+"|"+r.EntityID] = r
	}

	var tp, fp, fn, falseMatch, varHit, varDenom int
	var amtTotal, amtCorrect int64

	for _, t := range truth {
		amtTotal += t.AmountMinor
		got, ok := byEntity[t.EntityType+"|"+t.EntityID]
		if !ok {
			if t.ExpectedException {
				fn++
			}
			continue
		}
		exGot := got.Exception != nil
		okResult := got.Result == t.ExpectedResult
		okReason := t.ExpectedReason == "" || got.Reason == t.ExpectedReason
		okEx := exGot == t.ExpectedException

		if okResult && okReason && okEx {
			tp++
			amtCorrect += t.AmountMinor
		} else {
			if t.ExpectedException && !okEx {
				fn++
			}
			if !t.ExpectedException && okEx {
				fp++
			}
			if got.Result == recon.ResultMatched && t.ExpectedException {
				falseMatch++
			}
		}
		if t.ExpectedVariance != 0 {
			varDenom++
			if got.VarianceAmount == t.ExpectedVariance {
				varHit++
			}
		}
	}

	scored := len(truth)
	prec := div(float64(tp), float64(tp+fp))
	rec := div(float64(tp), float64(tp+fn))
	actualMatched := 0
	for _, t := range truth {
		if got, ok := byEntity[t.EntityType+"|"+t.EntityID]; ok && got.Result == recon.ResultMatched {
			actualMatched++
		}
	}

	return AccuracyReport{
		Precision:              prec,
		Recall:                 rec,
		F1:                     div(2*prec*rec, prec+rec),
		MatchRate:              div(float64(actualMatched), float64(scored)),
		FalseMatchRate:         div(float64(falseMatch), float64(scored)),
		ExceptionCaptureRate:   rec,
		VarianceDetectionRate:  div(float64(varHit), float64(varDenom)),
		AmountWeightedAccuracy: div(float64(amtCorrect), float64(amtTotal)),
		Scored:                 scored,
		Correct:                tp,
	}
}

func div(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}
