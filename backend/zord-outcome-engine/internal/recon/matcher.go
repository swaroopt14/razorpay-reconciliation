package recon

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

const defaultDateWindow = 3 * 24 * time.Hour

func Match(snap Snapshot) []ProofSubject {
	linesByPay := indexSettlementByPayment(snap.Lines)
	bankByUTR := indexBankByUTR(snap.Banks)
	intentByOrder := map[string]IntentRef{}
	for _, in := range snap.Intents {
		if in.ProviderOrderID != "" {
			intentByOrder[in.ProviderOrderID] = in
		}
	}

	seenPay := map[string]struct{}{}
	var out []ProofSubject

	for _, p := range snap.Payments {
		seenPay[p.PaymentID] = struct{}{}
		out = append(out, matchPayment(p, linesByPay, bankByUTR, snap.Banks, snap.Lines, intentByOrder, snap.AccountID))
	}

	// Bank credits with no matching payment/settlement.
	usedBank := map[string]struct{}{}
	for _, s := range out {
		if s.BankObservationID != "" {
			usedBank[s.BankObservationID] = struct{}{}
		}
	}
	for _, b := range snap.Banks {
		if _, ok := usedBank[b.ID]; ok {
			continue
		}
		if linked := settlementForBank(snap.Lines, b); linked.SettlementID != "" {
			if _, already := seenPay[paymentIDOf(linked)]; already {
				continue
			}
		}
		out = append(out, ProofSubject{
			TenantID:                snap.TenantID,
			ConnectorID:             snap.ConnectorID,
			PaymentID:               "",
			BankObservationID:       b.ID,
			BankCreditState:         BankMatched,
			ProviderSettlementState: SettlementNotObserved,
			PaymentState:            PaymentUnknown,
			ReconciliationState:     ReconBankCreditConfirmedProviderPending,
			ProofState:              ProofUnproven,
			BankCreditMinor:         b.CreditMinor,
			Currency:                b.Currency,
			Message:                 "Bank credit exists but provider settlement evidence is missing.",
		})
	}
	return out
}

func matchPayment(p PaymentObs, linesByPay map[string][]SettlementLine, bankByUTR map[string][]BankTxn, allBanks []BankTxn, allLines []SettlementLine, intentByOrder map[string]IntentRef, accountID string) ProofSubject {
	sub := ProofSubject{
		PaymentID:               p.PaymentID,
		OrderID:                 p.OrderID,
		PaymentState:            PaymentStateOf(p),
		ProviderSettlementState: SettlementNotObserved,
		BankCreditState:         BankNotExpected,
		ReconciliationState:     ReconUnresolved,
		ProofState:              ProofUnproven,
		Currency:                p.Currency,
		MissingWebhook:          !p.HasWebhook,
	}
	if _, ok := intentByOrder[p.OrderID]; ok && p.OrderID != "" {
		sub.MatchPairs = append(sub.MatchPairs, MatchDecision{
			MatchID: uuid.Must(uuid.NewV7()).String(), SourceAID: p.PaymentID, SourceBID: p.OrderID,
			LeftSource: "razorpay_payment", RightSource: "intent",
			MatchType: MatchOrderRelationship, Confidence: 0.4, RuleVersion: RuleVersion,
			DecisionReason: "payment.order_id == intent.provider_order_id",
			ScoreBreakdown: map[string]float64{"order_relationship": 0.4},
		})
	}

	line, matchType, ok := findSettlement(p, linesByPay)
	if !ok {
		sub.BankCreditState = BankAwaiting
		if p.Captured || sub.PaymentState == PaymentCaptured {
			sub.ReconciliationState = ReconPaymentConfirmedSettlementPending
			sub.ProofState = ProofCaptureProvenSettlementUnproven
			sub.Message = "Payment captured: yes. Settlement recon found: no. Bank credit found: no. Proof: capture proven; settlement and bank credit not proven."
		} else {
			sub.ReconciliationState = ReconUnresolved
			sub.Message = "Evidence is insufficient."
		}
		if sub.MissingWebhook && sub.ReconciliationState == ReconPaymentConfirmedSettlementPending {
			sub.ReconciliationState = ReconMissingWebhookRepairedByAPI
		}
		return sub
	}

	sub.SettlementID = line.SettlementID
	if line.Settled {
		sub.ProviderSettlementState = SettlementSettled
	} else {
		sub.ProviderSettlementState = SettlementIncludedInRecon
	}
	payMatch := MatchDecision{
		MatchID: uuid.Must(uuid.NewV7()).String(), SourceAID: p.PaymentID, SourceBID: line.EntityID,
		LeftSource: "razorpay_settlement_recon", RightSource: "razorpay_payment",
		MatchType: matchType, Confidence: ScoreExactPaymentID, RuleVersion: RuleVersion,
		DecisionReason: "settlement line tied by payment/entity ID",
		ScoreBreakdown: map[string]float64{"exact_payment_id": ScoreExactPaymentID},
	}
	sub.MatchPairs = append(sub.MatchPairs, payMatch)

	net := SettlementNetMinor(allLines, line.SettlementID)
	if net == 0 {
		net = lineNet(line)
	}
	sub.ExpectedNetMinor = net

	return attachBank(sub, line, bankByUTR, allBanks, accountID)
}

func attachBank(sub ProofSubject, line SettlementLine, bankByUTR map[string][]BankTxn, allBanks []BankTxn, accountID string) ProofSubject {
	utr := strings.TrimSpace(line.UTR)
	if utr != "" {
		cands := bankByUTR[utr]
		if len(cands) == 1 {
			return bankProven(sub, line, cands[0], MatchExactUTRAndAmount, false)
		}
		if len(cands) > 1 {
			sub.BankCreditState = BankAmbiguous
			sub.ReconciliationState = ReconAmbiguousMatch
			sub.ProofState = ProofProviderSettlementProvenBankUnproven
			sub.Message = bankPendingMessage(line, "ambiguous")
			return sub
		}
	}

	// L5: exact net + date window + account
	net := sub.ExpectedNetMinor
	var l5 []BankTxn
	for _, b := range allBanks {
		if accountID != "" && b.AccountID != accountID {
			continue
		}
		if b.Currency != "" && line.Currency != "" && b.Currency != line.Currency {
			continue
		}
		if b.CreditMinor != net {
			continue
		}
		if !line.SettledAt.IsZero() && !b.ValueDate.IsZero() {
			delta := b.ValueDate.Sub(line.SettledAt)
			if delta < 0 {
				delta = -delta
			}
			if delta > defaultDateWindow {
				continue
			}
		}
		l5 = append(l5, b)
	}
	if len(l5) == 1 && utr == "" {
		return bankL5(sub, line, l5[0])
	}
	if len(l5) > 1 && utr == "" {
		sub.BankCreditState = BankAmbiguous
		sub.ReconciliationState = ReconAmbiguousMatch
		sub.ProofState = ProofProviderSettlementProvenBankUnproven
		sub.Message = bankPendingMessage(line, "ambiguous")
		return sub
	}

	// L6 probable only
	if utr == "" && len(l5) == 0 {
		if b, ok := compositeFallback(line, allBanks, accountID); ok {
			sub.BankCreditState = BankAwaiting
			sub.BankObservationID = b.ID
			sub.BankCreditMinor = b.CreditMinor
			sub.DifferenceMinor = net - b.CreditMinor
			sub.ReconciliationState = ReconUnresolved
			sub.ProofState = ProofProbable
			sub.MatchPairs = append(sub.MatchPairs, MatchDecision{
				MatchID: uuid.Must(uuid.NewV7()).String(), SourceAID: line.SettlementID, SourceBID: b.ID,
				LeftSource: "razorpay_settlement_recon", RightSource: "bank_statement",
				MatchType: MatchCompositeFallback, Confidence: ScoreDescription, RuleVersion: RuleVersion,
				DecisionReason: "composite fallback is probable only, not proven",
				ScoreBreakdown: map[string]float64{"description_similarity": ScoreDescription},
			})
			sub.Message = bankPendingMessage(line, "probable")
			return sub
		}
	}

	if utr != "" {
		// amount mismatch if any bank amount differs on same UTR already handled; UTR missing in bank
		for _, b := range allBanks {
			if b.CreditMinor == net && (accountID == "" || b.AccountID == accountID) && b.UTR != utr {
				sub.BankCreditState = BankAmountMismatch
				sub.ReconciliationState = ReconAmountMismatch
				sub.BankCreditMinor = b.CreditMinor
				sub.DifferenceMinor = net - b.CreditMinor
				sub.ProofState = ProofProviderSettlementProvenBankUnproven
				sub.Message = amountMismatchMessage(net, b.CreditMinor, line.Currency)
				return sub
			}
		}
	}

	sub.BankCreditState = BankNotFound
	sub.ReconciliationState = ReconSettlementConfirmedBankPending
	sub.ProofState = ProofProviderSettlementProvenBankUnproven
	sub.Message = bankPendingMessage(line, "not_found")
	return sub
}

func bankProven(sub ProofSubject, line SettlementLine, b BankTxn, matchType string, l5 bool) ProofSubject {
	net := sub.ExpectedNetMinor
	sub.BankObservationID = b.ID
	sub.BankCreditMinor = b.CreditMinor
	sub.DifferenceMinor = net - b.CreditMinor
	conf, breakdown := ScoreUTRAndAmount(b.UTR != "" && b.UTR == line.UTR, b.CreditMinor == net, b.Currency == line.Currency || line.Currency == "", true)
	if b.CreditMinor != net {
		sub.BankCreditState = BankAmountMismatch
		sub.ReconciliationState = ReconAmountMismatch
		sub.ProofState = ProofProviderSettlementProvenBankUnproven
		sub.Message = amountMismatchMessage(net, b.CreditMinor, line.Currency)
		return sub
	}
	sub.BankCreditState = BankMatched
	if l5 {
		// L5 unique with no UTR: allowed verified only when no alternate candidates (caller guarantees unique)
		matchType = MatchNetAmountDateAccount
		sub.ProofState = ProofVerified
		sub.ReconciliationState = ReconFullyReconciled
	} else {
		sub.ProofState = ProofVerified
		sub.ReconciliationState = ReconFullyReconciled
		matchType = MatchExactUTRAndAmount
	}
	sub.MatchPairs = append(sub.MatchPairs, MatchDecision{
		MatchID: uuid.Must(uuid.NewV7()).String(), SourceAID: line.SettlementID, SourceBID: b.ID,
		LeftSource: "razorpay_settlement_recon", RightSource: "bank_statement",
		MatchType: matchType, Confidence: conf + ScoreExactPaymentID, RuleVersion: RuleVersion,
		DecisionReason: "bank observation matched; cash in merchant account is proven",
		ScoreBreakdown: breakdown,
	})
	sub.Message = ""
	return sub
}

func bankL5(sub ProofSubject, line SettlementLine, b BankTxn) ProofSubject {
	return bankProven(sub, line, b, MatchNetAmountDateAccount, true)
}

func compositeFallback(line SettlementLine, banks []BankTxn, accountID string) (BankTxn, bool) {
	for _, b := range banks {
		if accountID != "" && b.AccountID != accountID {
			continue
		}
		if b.Currency != "" && line.Currency != "" && b.Currency != line.Currency {
			continue
		}
		blob := strings.ToLower(b.Description)
		if line.SettlementID != "" && strings.Contains(blob, strings.ToLower(line.SettlementID)) {
			return b, true
		}
	}
	return BankTxn{}, false
}

func findSettlement(p PaymentObs, linesByPay map[string][]SettlementLine) (SettlementLine, string, bool) {
	if rows := linesByPay[p.PaymentID]; len(rows) > 0 {
		line := pickLine(rows)
		if line.PaymentID == p.PaymentID {
			return line, MatchExactPaymentID, true
		}
		return line, MatchExactEntityID, true
	}
	return SettlementLine{}, "", false
}

func pickLine(rows []SettlementLine) SettlementLine {
	for _, r := range rows {
		if r.LineType == "payment" || r.LineType == "" {
			return r
		}
	}
	return rows[0]
}

func lineNet(l SettlementLine) int64 {
	if l.CreditMinor != 0 || l.DebitMinor != 0 {
		return l.CreditMinor - l.DebitMinor
	}
	return l.AmountMinor - l.FeeMinor - l.TaxMinor
}

func indexSettlementByPayment(lines []SettlementLine) map[string][]SettlementLine {
	m := map[string][]SettlementLine{}
	for _, l := range lines {
		if l.PaymentID != "" {
			m[l.PaymentID] = append(m[l.PaymentID], l)
		}
		if l.EntityID != "" && l.EntityID != l.PaymentID {
			m[l.EntityID] = append(m[l.EntityID], l)
		}
	}
	return m
}

func indexBankByUTR(banks []BankTxn) map[string][]BankTxn {
	m := map[string][]BankTxn{}
	for _, b := range banks {
		if b.UTR == "" {
			continue
		}
		m[b.UTR] = append(m[b.UTR], b)
	}
	return m
}

func settlementForBank(lines []SettlementLine, b BankTxn) SettlementLine {
	if b.UTR == "" {
		return SettlementLine{}
	}
	for _, l := range lines {
		if l.UTR == b.UTR {
			return l
		}
	}
	return SettlementLine{}
}

func paymentIDOf(l SettlementLine) string {
	if l.PaymentID != "" {
		return l.PaymentID
	}
	return l.EntityID
}

func bankPendingMessage(line SettlementLine, kind string) string {
	utr := line.UTR
	if utr == "" {
		utr = "(none)"
	}
	base := "Razorpay reports this payment as included in settlement under UTR " + utr + ", but no matching bank credit has been found in the imported statement as of the latest bank data timestamp."
	if kind == "ambiguous" {
		return base + " More than one bank row could match."
	}
	if kind == "probable" {
		return base + " A weak description match exists and is probable only, not proven."
	}
	return "Payment captured: yes. Razorpay settlement: proven. UTR: available. Bank credit: not found in current statement. Proof: provider settlement proven; bank credit unresolved. " + base
}

func amountMismatchMessage(expected, got int64, currency string) string {
	if currency == "" {
		currency = "INR"
	}
	return "Expected net and observed bank credit differ. Reason: fee/tax or adjustment requires review."
}

// SettledDoesNotMeanBankCredited is a compile-time reminder used in tests.
func SettledDoesNotMeanBankCredited(sub ProofSubject) bool {
	if sub.ProviderSettlementState == SettlementSettled && sub.BankObservationID == "" {
		return sub.BankCreditState != BankMatched && sub.ProofState != ProofVerified
	}
	return true
}
