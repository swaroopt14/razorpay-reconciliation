package eval

import (
	"zord-outcome-engine/internal/recon"
)

const (
	KindPayment = "payment"
	KindPayout  = "payout"
	KindOrphan  = "orphan"
)

type Label struct {
	Result     string   `json:"result"`
	Reason     string   `json:"reason,omitempty"`
	Reasons    []string `json:"reasons,omitempty"`
	Exception  bool     `json:"exception"`
	Variance   int64    `json:"variance,omitempty"`
	BankCredit bool     `json:"bank_credit"`
}

type EvidenceNeed struct {
	Settlement        bool `json:"settlement,omitempty"`
	Bank              bool `json:"bank,omitempty"`
	Decision          bool `json:"decision,omitempty"`
	MustNotInventBank bool `json:"must_not_invent_bank,omitempty"`
}

type Case struct {
	ID       string               `json:"id"`
	Family   string               `json:"family"`
	Kind     string               `json:"kind"`
	Amount   int64                `json:"amount"`
	Currency string               `json:"currency"`
	Payment  recon.FinancialInput `json:"-"`
	Payout   recon.PayoutInput    `json:"-"`
	Orphan   recon.BankTxn        `json:"-"`
	Oracle   Label                `json:"oracle"`
	Truth    Label                `json:"truth"`
	Need     EvidenceNeed         `json:"evidence_need"`
}

type Prediction struct {
	ID         string
	Family     string
	Kind       string
	Amount     int64
	Result     string
	Reason     string
	Exception  bool
	Variance   int64
	BankCredit bool
	Refs       recon.EvidenceRefs
	LatencyNS  int64
}

func reasonOK(got string, lab Label) bool {
	if lab.Reason != "" && got == lab.Reason {
		return true
	}
	for _, r := range lab.Reasons {
		if got == r {
			return true
		}
	}
	if lab.Reason == "" && len(lab.Reasons) == 0 {
		return true
	}
	return false
}
