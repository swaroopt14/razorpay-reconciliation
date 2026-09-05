package eval

import (
	"sort"

	"zord-outcome-engine/internal/recon"
)

type Quality struct {
	Precision              float64 `json:"precision"`
	Recall                 float64 `json:"recall"`
	F1                     float64 `json:"f1"`
	MatchRate              float64 `json:"match_rate"`
	FalseMatchRate         float64 `json:"false_match_rate"`
	ExceptionCaptureRate   float64 `json:"exception_capture_rate"`
	VarianceDetectionRate  float64 `json:"variance_detection_rate"`
	AmountWeightedAccuracy float64 `json:"amount_weighted_accuracy"`
	EvidenceCompleteness   float64 `json:"evidence_completeness"`
	ReasonAccuracy         float64 `json:"reason_accuracy"`
	TruePositives          int     `json:"true_positives"`
	FalsePositives         int     `json:"false_positives"`
	FalseNegatives         int     `json:"false_negatives"`
	TrueNegatives          int     `json:"true_negatives"`
}

type Regression struct {
	Accuracy   float64  `json:"accuracy"`
	Mismatches []string `json:"mismatches"`
	N          int      `json:"n"`
	Correct    int      `json:"correct"`
}

type Latency struct {
	P50NS          int64   `json:"p50_ns"`
	P95NS          int64   `json:"p95_ns"`
	ThroughputPerS float64 `json:"throughput_per_s"`
	TotalNS        int64   `json:"total_ns"`
}

type Report struct {
	N                int            `json:"n"`
	Families         map[string]int `json:"families"`
	Regression       Regression     `json:"regression"`
	Quality          Quality        `json:"quality"`
	Latency          Latency        `json:"latency"`
	ROCAUC           *float64       `json:"roc_auc"`
	PRAUC            *float64       `json:"pr_auc"`
	RankingNote      string         `json:"ranking_note"`
	KnownQualityGaps []string       `json:"known_quality_gaps"`
}

func Evaluate(cases []Case, preds []Prediction) Report {
	byID := map[string]Case{}
	families := map[string]int{}
	for _, c := range cases {
		byID[c.ID] = c
		families[c.Family]++
	}
	var qs Quality
	var reg Regression
	var lat []int64
	var totalNS int64
	var amtCorrect, amtTotal int64
	var evOK, evN int
	var reasonOKN int
	var varDenom, varHit int
	var matched, falseMatch int
	vf := VarianceFamilies()

	for _, p := range preds {
		c := byID[p.ID]
		reg.N++
		if p.Result == c.Oracle.Result && p.Exception == c.Oracle.Exception && reasonOK(p.Reason, c.Oracle) {
			reg.Correct++
		} else {
			reg.Mismatches = append(reg.Mismatches, p.ID+" got="+p.Result+"/"+p.Reason)
		}

		predEx, truthEx := p.Exception, c.Truth.Exception
		switch {
		case predEx && truthEx:
			qs.TruePositives++
		case predEx && !truthEx:
			qs.FalsePositives++
		case !predEx && truthEx:
			qs.FalseNegatives++
		default:
			qs.TrueNegatives++
		}
		if p.Result == recon.ResultMatched {
			matched++
			if truthEx {
				falseMatch++
			}
		}
		if vf[c.Family] {
			varDenom++
			if p.Result == recon.ResultVariance || p.Reason == "amount_mismatch" {
				varHit++
			}
		}
		resultOK := p.Result == c.Truth.Result || (c.Truth.Result == "" && reasonOK(p.Reason, c.Truth))
		exOK := p.Exception == c.Truth.Exception
		if resultOK && exOK {
			amtCorrect += c.Amount
		}
		amtTotal += c.Amount
		if reasonOK(p.Reason, c.Truth) {
			reasonOKN++
		}
		ok, n := evidenceScore(c.Need, p)
		evOK += ok
		evN += n
		lat = append(lat, p.LatencyNS)
		totalNS += p.LatencyNS
	}

	n := float64(len(preds))
	if n == 0 {
		n = 1
	}
	qs.Precision = div(float64(qs.TruePositives), float64(qs.TruePositives+qs.FalsePositives))
	qs.Recall = div(float64(qs.TruePositives), float64(qs.TruePositives+qs.FalseNegatives))
	qs.F1 = 0
	if qs.Precision+qs.Recall > 0 {
		qs.F1 = 2 * qs.Precision * qs.Recall / (qs.Precision + qs.Recall)
	}
	qs.MatchRate = float64(matched) / n
	qs.FalseMatchRate = div(float64(falseMatch), float64(matched))
	qs.ExceptionCaptureRate = qs.Recall
	qs.VarianceDetectionRate = div(float64(varHit), float64(varDenom))
	qs.AmountWeightedAccuracy = div(float64(amtCorrect), float64(amtTotal))
	qs.EvidenceCompleteness = div(float64(evOK), float64(evN))
	qs.ReasonAccuracy = float64(reasonOKN) / n
	reg.Accuracy = float64(reg.Correct) / float64(reg.N)
	sort.Strings(reg.Mismatches)

	rep := Report{
		N:          len(preds),
		Families:   families,
		Regression: reg,
		Quality:    qs,
		Latency: Latency{
			P50NS:          percentileNS(lat, 0.50),
			P95NS:          percentileNS(lat, 0.95),
			TotalNS:        totalNS,
			ThroughputPerS: div(n, float64(totalNS)/1e9),
		},
		ROCAUC:      nil,
		PRAUC:       nil,
		RankingNote: "ROC-AUC and PR-AUC are omitted. Phase 6 recon emits rule labels and a hand-set confidence, not a scored binary classifier.",
		KnownQualityGaps: nil,
	}
	return rep
}

func evidenceScore(need EvidenceNeed, p Prediction) (ok, n int) {
	check := func(want bool, present bool) {
		if !want {
			return
		}
		n++
		if present {
			ok++
		}
	}
	check(need.Settlement, p.Refs.SettlementLineID != "")
	check(need.Bank, p.Refs.BankObservationID != "")
	check(need.Decision, p.Refs.SettlementBankDecisionID != "")
	if need.MustNotInventBank {
		n++
		if !p.BankCredit {
			ok++
		}
	}
	return ok, n
}

func div(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}
