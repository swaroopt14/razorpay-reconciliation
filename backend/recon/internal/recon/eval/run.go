package eval

import (
	"sort"
	"time"

	"zord-outcome-engine/internal/recon"
)

func Run(cases []Case) []Prediction {
	out := make([]Prediction, 0, len(cases))
	for _, c := range cases {
		start := time.Now()
		got := execute(c)
		out = append(out, Prediction{
			ID:         c.ID,
			Family:     c.Family,
			Kind:       c.Kind,
			Amount:     c.Amount,
			Result:     got.Result,
			Reason:     got.Reason,
			Exception:  got.Exception != nil,
			Variance:   got.VarianceAmount,
			BankCredit: got.BankCreditProven,
			Refs:       got.EvidenceRefs,
			LatencyNS:  time.Since(start).Nanoseconds(),
		})
	}
	return out
}

func execute(c Case) recon.FinancialResult {
	switch c.Kind {
	case KindPayout:
		return recon.ReconcilePayout(c.Payout)
	case KindOrphan:
		return recon.OrphanBankResult(c.Orphan)
	default:
		return recon.ReconcilePayment(c.Payment)
	}
}

func percentileNS(latencies []int64, p float64) int64 {
	if len(latencies) == 0 {
		return 0
	}
	cp := append([]int64{}, latencies...)
	sort.Slice(cp, func(i, j int) bool { return cp[i] < cp[j] })
	if p <= 0 {
		return cp[0]
	}
	if p >= 1 {
		return cp[len(cp)-1]
	}
	idx := int(p * float64(len(cp)-1))
	return cp[idx]
}
