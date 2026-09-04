package recon

import (
	"testing"
	"time"
)

func TestMatchSettlementBankExactUTR(t *testing.T) {
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	lines := []SettlementLine{{
		ID: "sl1", SettlementID: "setl_001", EntityID: "pay_123", PaymentID: "pay_123",
		LineType: "payment", AmountMinor: 10000, CreditMinor: 9728, FeeMinor: 272, Currency: "INR",
		UTR: "UTR123", Settled: true, SettledAt: from,
	}}
	banks := []BankTxn{{
		ID: "b1", AccountID: "acc", UTR: "UTR123", CreditMinor: 9728, CreditDebit: "CREDIT",
		Currency: "INR", ValueDate: from,
	}}
	got := MatchSettlementBank(lines, banks)
	if len(got) != 1 {
		t.Fatalf("len=%d %+v", len(got), got)
	}
	if got[0].State != BankMatchExact {
		t.Fatalf("state=%s", got[0].State)
	}
	if got[0].BankObservationID != "b1" {
		t.Fatalf("bank=%s", got[0].BankObservationID)
	}
}

func TestMatchSettlementBankDoesNotVerifyPayment(t *testing.T) {
	lines := []SettlementLine{{
		ID: "sl1", SettlementID: "s", EntityID: "p", UTR: "U1", CreditMinor: 100, Currency: "INR",
	}}
	banks := []BankTxn{{ID: "b1", UTR: "U1", CreditMinor: 100, CreditDebit: "CREDIT", Currency: "INR"}}
	d := MatchSettlementBank(lines, banks)[0]
	if d.State == ReconFullyReconciled || d.State == ProofVerified {
		t.Fatalf("must not emit proof states: %s", d.State)
	}
}

func TestMatchSettlementBankConflictedAmount(t *testing.T) {
	lines := []SettlementLine{{ID: "sl", EntityID: "e", UTR: "U1", CreditMinor: 9728, Currency: "INR"}}
	banks := []BankTxn{{ID: "b1", UTR: "U1", CreditMinor: 9500, CreditDebit: "CREDIT", Currency: "INR"}}
	d := MatchSettlementBank(lines, banks)[0]
	if d.State != BankMatchConflicted {
		t.Fatalf("state=%s", d.State)
	}
}

func TestMatchSettlementBankUnresolvedAndOrphan(t *testing.T) {
	lines := []SettlementLine{{ID: "sl", EntityID: "e", UTR: "MISSING", CreditMinor: 100, Currency: "INR"}}
	banks := []BankTxn{{ID: "b1", UTR: "OTHER", CreditMinor: 50, CreditDebit: "CREDIT", Currency: "INR"}}
	got := MatchSettlementBank(lines, banks)
	var unresolved, orphan bool
	for _, d := range got {
		if d.State == BankMatchUnresolved {
			unresolved = true
		}
		if d.State == BankMatchOrphanBank && d.BankObservationID == "b1" {
			orphan = true
		}
	}
	if !unresolved || !orphan {
		t.Fatalf("unresolved=%v orphan=%v %+v", unresolved, orphan, got)
	}
}

func TestMatchSettlementBankAmbiguousNoUTR(t *testing.T) {
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	lines := []SettlementLine{{
		ID: "sl", EntityID: "e", CreditMinor: 1000, Currency: "INR", SettledAt: from,
	}}
	banks := []BankTxn{
		{ID: "b1", CreditMinor: 1000, CreditDebit: "CREDIT", Currency: "INR", ValueDate: from},
		{ID: "b2", CreditMinor: 1000, CreditDebit: "CREDIT", Currency: "INR", ValueDate: from},
	}
	got := MatchSettlementBank(lines, banks)
	if got[0].State != BankMatchAmbiguous {
		t.Fatalf("state=%s", got[0].State)
	}
	if len(got[0].Candidates) != 2 {
		t.Fatalf("cands=%v", got[0].Candidates)
	}
}

func TestMatchSettlementBankHighConfidenceNoUTR(t *testing.T) {
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	lines := []SettlementLine{{
		ID: "sl", EntityID: "e", CreditMinor: 1000, Currency: "INR", SettledAt: from,
	}}
	banks := []BankTxn{{ID: "b1", CreditMinor: 1000, CreditDebit: "CREDIT", Currency: "INR", ValueDate: from}}
	d := MatchSettlementBank(lines, banks)[0]
	if d.State != BankMatchHighConfidence {
		t.Fatalf("state=%s", d.State)
	}
}

func TestMatchSettlementBankIgnoresDebitAbs(t *testing.T) {
	lines := []SettlementLine{{ID: "sl", EntityID: "e", UTR: "U1", CreditMinor: 1000, Currency: "INR"}}
	banks := []BankTxn{{ID: "b1", UTR: "U1", DebitMinor: 1000, CreditDebit: "DEBIT", Currency: "INR"}}
	got := MatchSettlementBank(lines, banks)
	if got[0].State != BankMatchUnresolved {
		t.Fatalf("state=%s", got[0].State)
	}
	for _, d := range got {
		if d.State == BankMatchExact {
			t.Fatal("debit must not exact-match via abs(amount)")
		}
	}
}

func TestMatchSettlementBankPreservesGrossNetBankAmounts(t *testing.T) {
	lines := []SettlementLine{{
		ID: "sl", EntityID: "pay_123", PaymentID: "pay_123", AmountMinor: 10000, CreditMinor: 9728, Currency: "INR", UTR: "UTR123",
	}}
	banks := []BankTxn{{ID: "b1", UTR: "UTR123", CreditMinor: 9728, CreditDebit: "CREDIT", Currency: "INR"}}
	d := MatchSettlementBank(lines, banks)[0]
	if d.Evidence["settlement_net"].(int64) != 9728 {
		t.Fatalf("net=%v", d.Evidence["settlement_net"])
	}
	if d.State != BankMatchExact {
		t.Fatalf("state=%s", d.State)
	}
}
