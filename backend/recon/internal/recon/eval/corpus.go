package eval

import (
	"fmt"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/internal/recon"
)

var amounts = []int64{999, 2000, 5000, 10000, 11800, 25000, 50000, 100000, 250000, 475000}

func BuildCorpus() []Case {
	var out []Case
	n := 0
	next := func(family string) int {
		n++
		return n
	}
	id := func(family string) string {
		return fmt.Sprintf("eval_%s_%02d", family, next(family))
	}
	amt := func(i int) int64 { return amounts[i%len(amounts)] }

	for i := 0; i < 16; i++ {
		out = append(out, exactCase(id("exact"), amt(i), amt(i)))
	}
	for i := 0; i < 8; i++ {
		a := amt(i + 1)
		fee := a / 40
		if fee < 18 {
			fee = 18
		}
		out = append(out, feeExplainedCase(id("fee_explained"), a, fee))
	}
	for i := 0; i < 6; i++ {
		a := amt(i + 2)
		tax := a / 80
		if tax < 10 {
			tax = 10
		}
		out = append(out, taxExplainedCase(id("tax_explained"), a, tax))
	}
	for i := 0; i < 6; i++ {
		out = append(out, failedNoMoveCase(id("failed_no_movement"), amt(i)))
	}
	for i := 0; i < 3; i++ {
		out = append(out, failedRefundCase(id("failed_refund"), amt(i+3)))
	}
	for i := 0; i < 5; i++ {
		out = append(out, payoutExactCase(id("payout_processed_exact"), amt(i+4)))
	}
	for i := 0; i < 3; i++ {
		out = append(out, highConfCase(id("high_confidence"), amt(i+5)))
	}

	for i := 0; i < 10; i++ {
		out = append(out, missingSettlementCase(id("missing_settlement"), amt(i)))
	}
	for i := 0; i < 10; i++ {
		out = append(out, missingBankCase(id("missing_bank"), amt(i+1)))
	}
	for i := 0; i < 8; i++ {
		a := amt(i)
		diff := int64(118 + i*10)
		out = append(out, wrongAmountCase(id("wrong_amount"), a, diff))
	}
	for i := 0; i < 6; i++ {
		out = append(out, wrongUTRCase(id("wrong_utr"), amt(i+2)))
	}
	for i := 0; i < 6; i++ {
		out = append(out, duplicateSettlementCase(id("duplicate_settlement"), amt(i+3)))
	}
	for i := 0; i < 8; i++ {
		out = append(out, duplicateBankCase(id("duplicate_bank"), amt(i+4)))
	}
	for i := 0; i < 6; i++ {
		out = append(out, partialSettlementCase(id("partial_settlement"), amt(i+5)))
	}
	for i := 0; i < 6; i++ {
		a := amt(i + 1)
		fee := a / 40
		out = append(out, feeVarianceCase(id("fee_variance"), a, fee, 250+int64(i)*15))
	}
	for i := 0; i < 5; i++ {
		a := amt(i + 2)
		tax := a / 80
		out = append(out, taxVarianceCase(id("tax_variance"), a, tax, 80+int64(i)*12))
	}
	for i := 0; i < 5; i++ {
		out = append(out, dateMismatchCase(id("date_mismatch"), amt(i+6)))
	}
	for i := 0; i < 5; i++ {
		out = append(out, ambiguousRefCase(id("ambiguous_reference"), amt(i+7)))
	}
	for i := 0; i < 5; i++ {
		out = append(out, conflictCase(id("conflicting_candidates"), amt(i+8)))
	}
	for i := 0; i < 6; i++ {
		out = append(out, failedBankCase(id("failed_with_bank"), amt(i+9)))
	}
	for i := 0; i < 5; i++ {
		out = append(out, orphanCase(id("orphan_bank"), amt(i)))
	}
	for i := 0; i < 4; i++ {
		out = append(out, openStuckCase(id("open_status_no_downstream"), amt(i+1)))
	}
	for i := 0; i < 4; i++ {
		out = append(out, payoutMissingBankCase(id("payout_missing_bank"), amt(i+2)))
	}
	for i := 0; i < 4; i++ {
		out = append(out, payoutFailedMoveCase(id("payout_failed_movement"), amt(i+3)))
	}
	for i := 0; i < 3; i++ {
		out = append(out, payoutOpenSLACase(id("payout_open_sla"), amt(i+4)))
	}
	return out
}

func RequiredFamilies() []string {
	return []string{
		"exact", "fee_explained", "tax_explained", "failed_no_movement", "failed_refund",
		"payout_processed_exact", "high_confidence",
		"missing_settlement", "missing_bank", "wrong_amount", "wrong_utr",
		"duplicate_settlement", "duplicate_bank", "partial_settlement",
		"fee_variance", "tax_variance", "date_mismatch", "ambiguous_reference",
		"conflicting_candidates", "failed_with_bank", "orphan_bank",
		"open_status_no_downstream", "payout_missing_bank", "payout_failed_movement",
		"payout_open_sla",
	}
}

func VarianceFamilies() map[string]bool {
	return map[string]bool{
		"wrong_amount": true, "fee_variance": true, "tax_variance": true, "partial_settlement": true,
	}
}

func pay(id string, status string, amount int64, captured bool) recon.PaymentFact {
	return recon.PaymentFact{
		ID: "cp_" + id, PaymentID: id, CanonicalStatus: status, Captured: captured,
		AmountMinor: amount, Currency: "INR",
	}
}

func line(id, pid string, amount, credit, fee, tax int64) recon.SettlementLine {
	return recon.SettlementLine{
		ID: id, PaymentID: pid, LineType: "payment", AmountMinor: amount,
		CreditMinor: credit, FeeMinor: fee, TaxMinor: tax, Currency: "INR", UTR: "UTR-" + pid,
	}
}

func bank(id string, credit int64, utr string) recon.BankTxn {
	return recon.BankTxn{ID: id, UTR: utr, CreditMinor: credit, CreditDebit: "CREDIT", Currency: "INR"}
}

func exactDec(id, sl, bid string, credit int64, conf float64) recon.SettlementBankDecision {
	return recon.SettlementBankDecision{
		ID: id, SettlementLineID: sl, BankObservationID: bid, State: recon.BankMatchExact, Confidence: conf,
		Evidence: map[string]any{"bank_credit_minor": credit},
	}
}

func matchedOracle(reason string, bankCredit bool) Label {
	return Label{Result: recon.ResultMatched, Reason: reason, Exception: false, BankCredit: bankCredit}
}

func exOracle(result, reason string, variance int64) Label {
	return Label{Result: result, Reason: reason, Exception: true, Variance: variance}
}

func exactCase(id string, amount, _ int64) Case {
	sl, bid := "sl_"+id, "b_"+id
	net := amount
	return Case{
		ID: id, Family: "exact", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment:   pay(id, recon.PaymentCaptured, amount, true),
			Lines:     []recon.SettlementLine{line(sl, id, amount, net, 0, 0)},
			Decisions: []recon.SettlementBankDecision{exactDec("d_"+id, sl, bid, net, 0.99)},
			Banks:     []recon.BankTxn{bank(bid, net, "UTR-"+id)},
		},
		Oracle: matchedOracle("captured_settlement_exact_bank", true),
		Truth:  matchedOracle("captured_settlement_exact_bank", true),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func feeExplainedCase(id string, amount, fee int64) Case {
	net := amount - fee
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "fee_explained", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment:   pay(id, recon.PaymentCaptured, amount, true),
			Lines:     []recon.SettlementLine{line(sl, id, amount, net, fee, 0)},
			Decisions: []recon.SettlementBankDecision{exactDec("d_"+id, sl, bid, net, 0.99)},
			Banks:     []recon.BankTxn{bank(bid, net, "UTR-"+id)},
		},
		Oracle: matchedOracle("captured_settlement_exact_bank", true),
		Truth:  matchedOracle("captured_settlement_exact_bank", true),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func taxExplainedCase(id string, amount, tax int64) Case {
	net := amount - tax
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "tax_explained", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment:   pay(id, recon.PaymentCaptured, amount, true),
			Lines:     []recon.SettlementLine{line(sl, id, amount, net, 0, tax)},
			Decisions: []recon.SettlementBankDecision{exactDec("d_"+id, sl, bid, net, 0.99)},
			Banks:     []recon.BankTxn{bank(bid, net, "UTR-"+id)},
		},
		Oracle: matchedOracle("captured_settlement_exact_bank", true),
		Truth:  matchedOracle("captured_settlement_exact_bank", true),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func failedNoMoveCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "failed_no_movement", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{Payment: pay(id, recon.PaymentFailed, amount, false)},
		Oracle:  matchedOracle("failed_no_money_movement", false),
		Truth:   matchedOracle("failed_no_money_movement", false),
		Need:    EvidenceNeed{MustNotInventBank: true},
	}
}

func failedRefundCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "failed_refund", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentFailed, amount, false),
			Lines: []recon.SettlementLine{{
				ID: "rf_" + id, PaymentID: id, LineType: "refund", AmountMinor: amount, DebitMinor: amount, Currency: "INR",
			}},
		},
		Oracle: matchedOracle("failed_refund_no_bank_movement", false),
		Truth:  matchedOracle("failed_refund_no_bank_movement", false),
		Need:   EvidenceNeed{Settlement: true, MustNotInventBank: true},
	}
}

func highConfCase(id string, amount int64) Case {
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "high_confidence", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, BankObservationID: bid,
				State: recon.BankMatchHighConfidence, Confidence: 0.72,
			}},
			Banks: []recon.BankTxn{bank(bid, amount, "UTR-"+id)},
		},
		Oracle: matchedOracle("captured_settlement_high_confidence_bank", false),
		Truth:  Label{Result: recon.ResultMatched, Reason: "captured_settlement_high_confidence_bank", Exception: false, BankCredit: false},
		Need:   EvidenceNeed{Settlement: true, Decision: true},
	}
}

func missingSettlementCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "missing_settlement", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{Payment: pay(id, recon.PaymentCaptured, amount, true)},
		Oracle:  exOracle(recon.ResultUnresolved, "captured_missing_settlement", 0),
		Truth:   exOracle(recon.ResultUnresolved, "captured_missing_settlement", 0),
		Need:    EvidenceNeed{MustNotInventBank: true},
	}
}

func missingBankCase(id string, amount int64) Case {
	sl := "sl_" + id
	return Case{
		ID: id, Family: "missing_bank", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
		},
		Oracle: exOracle(recon.ResultUnresolved, "settlement_without_bank", 0),
		Truth:  exOracle(recon.ResultUnresolved, "settlement_without_bank", 0),
		Need:   EvidenceNeed{Settlement: true, MustNotInventBank: true},
	}
}

func wrongAmountCase(id string, amount, diff int64) Case {
	sl, bid := "sl_"+id, "b_"+id
	net := amount
	bankAmt := net - diff
	return Case{
		ID: id, Family: "wrong_amount", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, net, 0, 0)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, BankObservationID: bid,
				State: recon.BankMatchVariance, Confidence: 0.8,
				Evidence: map[string]any{"bank_credit_minor": bankAmt, "difference_minor": diff},
			}},
			Banks: []recon.BankTxn{bank(bid, bankAmt, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultVariance, "amount_mismatch", diff),
		Truth:  exOracle(recon.ResultVariance, "amount_mismatch", diff),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func wrongUTRCase(id string, amount int64) Case {
	sl := "sl_" + id
	return Case{
		ID: id, Family: "wrong_utr", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
			Banks:   []recon.BankTxn{bank("b_"+id, amount, "OTHER-UTR")},
		},
		Oracle: exOracle(recon.ResultUnresolved, "settlement_without_bank", 0),
		Truth:  Label{Result: recon.ResultUnresolved, Reasons: []string{"settlement_without_bank", "amount_mismatch"}, Exception: true},
		Need:   EvidenceNeed{Settlement: true},
	}
}

func duplicateSettlementCase(id string, amount int64) Case {
	sl1, sl2, bid := "sl1_"+id, "sl2_"+id, "b_"+id
	// Engine sees two payment lines + EXACT → MATCHED. Controller wants an exception.
	return Case{
		ID: id, Family: "duplicate_settlement", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines: []recon.SettlementLine{
				line(sl1, id, amount, amount, 0, 0),
				line(sl2, id, amount, amount, 0, 0),
			},
			Decisions: []recon.SettlementBankDecision{exactDec("d_"+id, sl1, bid, amount, 0.99)},
			Banks:     []recon.BankTxn{bank(bid, amount, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultConflicted, "duplicate_settlement", amount),
		Truth:  exOracle(recon.ResultConflicted, "duplicate_settlement", amount),
		Need:   EvidenceNeed{Settlement: true},
	}
}

func duplicateBankCase(id string, amount int64) Case {
	sl := "sl_" + id
	return Case{
		ID: id, Family: "duplicate_bank", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, State: recon.BankMatchAmbiguous,
				Candidates: []string{"b1_" + id, "b2_" + id}, Confidence: 0.5,
			}},
			Banks: []recon.BankTxn{bank("b1_"+id, amount, "UTR-"+id), bank("b2_"+id, amount, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultAmbiguous, "ambiguous_bank_candidates", 0),
		Truth:  exOracle(recon.ResultAmbiguous, "ambiguous_bank_candidates", 0),
		Need:   EvidenceNeed{Settlement: true, Decision: true},
	}
}

func partialSettlementCase(id string, amount int64) Case {
	partial := amount / 2
	if partial == 0 {
		partial = 1
	}
	sl, bid := "sl_"+id, "b_"+id
	// Engine MATCHED on EXACT partial net. Controller wants variance.
	return Case{
		ID: id, Family: "partial_settlement", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment:   pay(id, recon.PaymentCaptured, amount, true),
			Lines:     []recon.SettlementLine{line(sl, id, amount, partial, 0, 0)},
			Decisions: []recon.SettlementBankDecision{exactDec("d_"+id, sl, bid, partial, 0.99)},
			Banks:     []recon.BankTxn{bank(bid, partial, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultVariance, "partial_settlement", amount-partial),
		Truth:  exOracle(recon.ResultVariance, "partial_settlement", amount-partial),
		Need:   EvidenceNeed{Settlement: true, Bank: true},
	}
}

func feeVarianceCase(id string, amount, fee, extra int64) Case {
	net := amount - fee
	bankAmt := net - extra
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "fee_variance", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, net, fee, 0)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, BankObservationID: bid,
				State: recon.BankMatchVariance, Confidence: 0.75,
				Evidence: map[string]any{"bank_credit_minor": bankAmt, "difference_minor": extra},
			}},
			Banks: []recon.BankTxn{bank(bid, bankAmt, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultVariance, "amount_mismatch", extra),
		Truth:  exOracle(recon.ResultVariance, "amount_mismatch", extra),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func taxVarianceCase(id string, amount, tax, extra int64) Case {
	net := amount - tax
	bankAmt := net - extra
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "tax_variance", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, net, 0, tax)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, BankObservationID: bid,
				State: recon.BankMatchVariance, Confidence: 0.75,
				Evidence: map[string]any{"bank_credit_minor": bankAmt, "difference_minor": extra},
			}},
			Banks: []recon.BankTxn{bank(bid, bankAmt, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultVariance, "amount_mismatch", extra),
		Truth:  exOracle(recon.ResultVariance, "amount_mismatch", extra),
		Need:   EvidenceNeed{Settlement: true, Bank: true, Decision: true},
	}
}

func dateMismatchCase(id string, amount int64) Case {
	sl := "sl_" + id
	when := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	return Case{
		ID: id, Family: "date_mismatch", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
			Banks: []recon.BankTxn{{
				ID: "b_" + id, UTR: "UTR-" + id, CreditMinor: amount, CreditDebit: "CREDIT",
				Currency: "INR", ValueDate: when.Add(40 * 24 * time.Hour),
			}},
		},
		Oracle: exOracle(recon.ResultUnresolved, "settlement_without_bank", 0),
		Truth:  Label{Result: recon.ResultUnresolved, Reasons: []string{"settlement_without_bank", "amount_mismatch"}, Exception: true},
		Need:   EvidenceNeed{Settlement: true},
	}
}

func ambiguousRefCase(id string, amount int64) Case {
	c := duplicateBankCase(id, amount)
	c.Family = "ambiguous_reference"
	return c
}

func conflictCase(id string, amount int64) Case {
	sl, bid := "sl_"+id, "b_"+id
	return Case{
		ID: id, Family: "conflicting_candidates", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentCaptured, amount, true),
			Lines:   []recon.SettlementLine{line(sl, id, amount, amount, 0, 0)},
			Decisions: []recon.SettlementBankDecision{{
				ID: "d_" + id, SettlementLineID: sl, BankObservationID: bid,
				State: recon.BankMatchConflicted, Confidence: 0.6, Candidates: []string{bid, "b_other_" + id},
				Evidence: map[string]any{"bank_credit_minor": amount, "difference_minor": int64(0)},
			}},
			Banks: []recon.BankTxn{bank(bid, amount, "UTR-"+id)},
		},
		Oracle: exOracle(recon.ResultConflicted, "amount_mismatch", 0),
		Truth:  exOracle(recon.ResultConflicted, "amount_mismatch", 0),
		Need:   EvidenceNeed{Settlement: true, Decision: true},
	}
}

func failedBankCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "failed_with_bank", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: pay(id, recon.PaymentFailed, amount, false),
			Banks:   []recon.BankTxn{{ID: "b_" + id, DebitMinor: amount, CreditDebit: "DEBIT", Currency: "INR"}},
		},
		Oracle: exOracle(recon.ResultUnresolved, "failed_with_bank_movement", amount),
		Truth:  exOracle(recon.ResultUnresolved, "failed_with_bank_movement", amount),
		Need:   EvidenceNeed{Bank: true},
	}
}

func orphanCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "orphan_bank", Kind: KindOrphan, Amount: amount, Currency: "INR",
		Orphan: recon.BankTxn{ID: id, CreditMinor: amount, CreditDebit: "CREDIT", Currency: "INR"},
		Oracle: exOracle(recon.ResultOrphan, "orphan_bank_credit", amount),
		Truth:  exOracle(recon.ResultOrphan, "orphan_bank_credit", amount),
		Need:   EvidenceNeed{Bank: true},
	}
}

func openStuckCase(id string, amount int64) Case {
	now := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)
	return Case{
		ID: id, Family: "open_status_no_downstream", Kind: KindPayment, Amount: amount, Currency: "INR",
		Payment: recon.FinancialInput{
			Payment: recon.PaymentFact{
				ID: "cp_" + id, PaymentID: id, CanonicalStatus: recon.PaymentAuthorized,
				AmountMinor: amount, Currency: "INR", ProviderCreatedAt: now.Add(-80 * time.Hour),
			},
			Now: now, StuckAfter: recon.DefaultStuckAfter,
		},
		Oracle: exOracle(recon.ResultUnresolved, "open_status_no_downstream", 0),
		Truth:  exOracle(recon.ResultUnresolved, "open_status_no_downstream", 0),
		Need:   EvidenceNeed{MustNotInventBank: true},
	}
}

func payoutExactCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "payout_processed_exact", Kind: KindPayout, Amount: amount, Currency: "INR",
		Payout: recon.PayoutInput{
			Payout: recon.PayoutFact{
				ID: "cpo_" + id, PayoutID: id, ProviderStatus: razorpay.PayoutProcessed,
				AmountMinor: amount, Currency: "INR", UTR: "PUTR-" + id,
			},
			Banks: []recon.BankTxn{{
				ID: "b_" + id, UTR: "PUTR-" + id, DebitMinor: amount, CreditDebit: "DEBIT", Currency: "INR",
			}},
		},
		Oracle: matchedOracle("processed_exact_debit", false),
		Truth:  Label{Result: recon.ResultMatched, Reason: "processed_exact_debit", Exception: false},
		Need:   EvidenceNeed{Bank: true},
	}
}

func payoutMissingBankCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "payout_missing_bank", Kind: KindPayout, Amount: amount, Currency: "INR",
		Payout: recon.PayoutInput{
			Payout: recon.PayoutFact{
				ID: "cpo_" + id, PayoutID: id, ProviderStatus: razorpay.PayoutProcessed,
				AmountMinor: amount, Currency: "INR", UTR: "PUTR-" + id,
			},
		},
		Oracle: exOracle(recon.ResultUnresolved, "payout_missing_bank", 0),
		Truth:  exOracle(recon.ResultUnresolved, "payout_missing_bank", 0),
		Need:   EvidenceNeed{MustNotInventBank: true},
	}
}

func payoutFailedMoveCase(id string, amount int64) Case {
	return Case{
		ID: id, Family: "payout_failed_movement", Kind: KindPayout, Amount: amount, Currency: "INR",
		Payout: recon.PayoutInput{
			Payout: recon.PayoutFact{
				ID: "cpo_" + id, PayoutID: id, ProviderStatus: razorpay.PayoutFailed,
				AmountMinor: amount, Currency: "INR",
			},
			Banks: []recon.BankTxn{{ID: "b_" + id, DebitMinor: amount, CreditDebit: "DEBIT", Currency: "INR"}},
		},
		Oracle: exOracle(recon.ResultUnresolved, "payout_failed_with_bank_movement", amount),
		Truth:  exOracle(recon.ResultUnresolved, "payout_failed_with_bank_movement", amount),
		Need:   EvidenceNeed{Bank: true},
	}
}

func payoutOpenSLACase(id string, amount int64) Case {
	now := time.Date(2026, 9, 2, 12, 0, 0, 0, time.UTC)
	return Case{
		ID: id, Family: "payout_open_sla", Kind: KindPayout, Amount: amount, Currency: "INR",
		Payout: recon.PayoutInput{
			Payout: recon.PayoutFact{
				ID: "cpo_" + id, PayoutID: id, ProviderStatus: razorpay.PayoutProcessing,
				AmountMinor: amount, Currency: "INR", ProviderCreatedAt: now.Add(-2 * time.Hour),
			},
			Now: now, StuckAfter: recon.DefaultPayoutSLA,
		},
		Oracle: exOracle(recon.ResultUnresolved, "payout_open_past_sla", 0),
		Truth:  exOracle(recon.ResultUnresolved, "payout_open_past_sla", 0),
		Need:   EvidenceNeed{MustNotInventBank: true},
	}
}
