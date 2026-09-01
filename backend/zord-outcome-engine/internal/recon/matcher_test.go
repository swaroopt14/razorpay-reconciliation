package recon

import (
	"testing"
	"time"
)

func TestUTRMatchFullyReconciled(t *testing.T) {
	from := time.Date(2026, 8, 30, 3, 0, 0, 0, time.UTC)
	snap := Snapshot{
		Payments: []PaymentObs{{
			PaymentID: "pay_test_001", OrderID: "order_001", Status: "captured",
			AmountMinor: 100000, Currency: "INR", Captured: true, HasWebhook: true,
		}},
		Lines: []SettlementLine{{
			SettlementID: "setl_001", EntityID: "pay_test_001", PaymentID: "pay_test_001",
			LineType: "payment", AmountMinor: 100000, CreditMinor: 96578, FeeMinor: 2900, TaxMinor: 522,
			Currency: "INR", UTR: "utr_001", Settled: true, SettledAt: from,
		}},
		Banks: []BankTxn{{
			ID: "bank_txn_001", AccountID: "account_001", UTR: "utr_001",
			CreditMinor: 96578, Currency: "INR", ValueDate: from.Add(time.Hour),
		}},
	}
	got := Match(snap)
	if len(got) != 1 {
		t.Fatalf("len=%d", len(got))
	}
	s := got[0]
	if s.ReconciliationState != ReconFullyReconciled || s.ProofState != ProofVerified {
		t.Fatalf("state=%s proof=%s", s.ReconciliationState, s.ProofState)
	}
	if s.BankCreditState != BankMatched || s.ProviderSettlementState != SettlementSettled {
		t.Fatalf("bank=%s settlement=%s", s.BankCreditState, s.ProviderSettlementState)
	}
}

func TestSettlementWithoutBankIsPendingNotCredited(t *testing.T) {
	snap := Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_2", Status: "captured", Captured: true, AmountMinor: 450000, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_002", EntityID: "pay_2", PaymentID: "pay_2",
			LineType: "payment", CreditMinor: 450000, Currency: "INR", UTR: "utr_002", Settled: true,
		}},
	}
	s := Match(snap)[0]
	if s.ProviderSettlementState != SettlementSettled {
		t.Fatalf("settlement=%s", s.ProviderSettlementState)
	}
	if s.BankCreditState == BankMatched {
		t.Fatal("must not treat provider settled as bank credited")
	}
	if s.ReconciliationState != ReconSettlementConfirmedBankPending {
		t.Fatalf("recon=%s", s.ReconciliationState)
	}
	if s.ProofState != ProofProviderSettlementProvenBankUnproven {
		t.Fatalf("proof=%s", s.ProofState)
	}
	if !SettledDoesNotMeanBankCredited(s) {
		t.Fatal("invariant broken")
	}
}

func TestAmountMismatch(t *testing.T) {
	snap := Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_3", Status: "captured", Captured: true, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_3", EntityID: "pay_3", PaymentID: "pay_3",
			CreditMinor: 96578, Currency: "INR", UTR: "utr_3", Settled: true,
		}},
		Banks: []BankTxn{{ID: "b1", UTR: "utr_3", CreditMinor: 96000, Currency: "INR"}},
	}
	s := Match(snap)[0]
	if s.ReconciliationState != ReconAmountMismatch || s.BankCreditState != BankAmountMismatch {
		t.Fatalf("got recon=%s bank=%s", s.ReconciliationState, s.BankCreditState)
	}
	if s.ProofState == ProofVerified {
		t.Fatal("mismatch must not verify")
	}
}

func TestAmbiguousTwoBankRows(t *testing.T) {
	snap := Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_4", Status: "captured", Captured: true, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_4", EntityID: "pay_4", PaymentID: "pay_4",
			CreditMinor: 1000, Currency: "INR", UTR: "utr_4", Settled: true,
		}},
		Banks: []BankTxn{
			{ID: "b1", UTR: "utr_4", CreditMinor: 1000, Currency: "INR"},
			{ID: "b2", UTR: "utr_4", CreditMinor: 1000, Currency: "INR"},
		},
	}
	s := Match(snap)[0]
	if s.ReconciliationState != ReconAmbiguousMatch || s.BankCreditState != BankAmbiguous {
		t.Fatalf("got recon=%s bank=%s", s.ReconciliationState, s.BankCreditState)
	}
	if s.ProofState == ProofVerified {
		t.Fatal("ambiguous must not verify")
	}
}

func TestL6CannotVerify(t *testing.T) {
	snap := Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_6", Status: "captured", Captured: true, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_xyz", EntityID: "pay_6", PaymentID: "pay_6",
			CreditMinor: 5000, Currency: "INR", Settled: true,
		}},
		Banks: []BankTxn{{
			ID: "b6", AccountID: "a1", CreditMinor: 4999, Currency: "INR",
			Description: "RAZORPAY setl_xyz",
		}},
	}
	s := Match(snap)[0]
	if s.ProofState == ProofVerified || s.ReconciliationState == ReconFullyReconciled {
		t.Fatalf("L6 must not verify: proof=%s recon=%s", s.ProofState, s.ReconciliationState)
	}
	if s.ProofState != ProofProbable {
		t.Fatalf("want probable, got %s", s.ProofState)
	}
}

func TestEntityIDLevel2(t *testing.T) {
	snap := Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_e", Status: "captured", Captured: true, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_e", EntityID: "pay_e", PaymentID: "",
			CreditMinor: 100, Currency: "INR", UTR: "utr_e", Settled: true,
		}},
		Banks: []BankTxn{{ID: "be", UTR: "utr_e", CreditMinor: 100, Currency: "INR"}},
	}
	s := Match(snap)[0]
	if s.ReconciliationState != ReconFullyReconciled {
		t.Fatalf("L2+L4 should fully reconcile, got %s", s.ReconciliationState)
	}
	foundL2 := false
	for _, m := range s.MatchPairs {
		if m.MatchType == MatchExactEntityID {
			foundL2 = true
		}
	}
	if !foundL2 {
		t.Fatal("expected exact_entity_id match type")
	}
}

func TestCapturedNoSettlement(t *testing.T) {
	s := Match(Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_only", Status: "captured", Captured: true, HasWebhook: true}},
	})[0]
	if s.ReconciliationState != ReconPaymentConfirmedSettlementPending {
		t.Fatalf("got %s", s.ReconciliationState)
	}
	if s.BankCreditState == BankMatched {
		t.Fatal("no bank")
	}
}

func TestNeverMapSettledToMatchedWithoutBank(t *testing.T) {
	s := Match(Snapshot{
		Payments: []PaymentObs{{PaymentID: "pay_x", Status: "captured", Captured: true}},
		Lines: []SettlementLine{{
			SettlementID: "s", EntityID: "pay_x", PaymentID: "pay_x", Settled: true, CreditMinor: 1, UTR: "u",
		}},
	})[0]
	if s.ProviderSettlementState == SettlementSettled && s.BankCreditState == BankMatched {
		t.Fatal("settled without bank row became matched")
	}
}

func TestL5UniqueAmountDateAccountCanVerify(t *testing.T) {
	from := time.Date(2026, 8, 30, 0, 0, 0, 0, time.UTC)
	s := Match(Snapshot{
		AccountID: "a1",
		Payments: []PaymentObs{{PaymentID: "pay_5", Status: "captured", Captured: true, Currency: "INR", HasWebhook: true}},
		Lines: []SettlementLine{{
			SettlementID: "setl_5", EntityID: "pay_5", PaymentID: "pay_5",
			CreditMinor: 2000, Currency: "INR", Settled: true, SettledAt: from,
		}},
		Banks: []BankTxn{{
			ID: "b5", AccountID: "a1", CreditMinor: 2000, Currency: "INR", ValueDate: from,
		}},
	})[0]
	if s.ReconciliationState != ReconFullyReconciled || s.ProofState != ProofVerified {
		t.Fatalf("unique L5 should verify, recon=%s proof=%s", s.ReconciliationState, s.ProofState)
	}
}

