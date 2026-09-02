package recon

import (
	"context"
	"testing"
	"time"

	"zord-outcome-engine/models"
)

func TestPAY001_CapturedSettlementExactBank(t *testing.T) {
	in := FinancialInput{
		Payment: PaymentFact{
			ID: "cp1", PaymentID: "pay_001", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 10000,
		},
		Lines: []SettlementLine{{
			ID: "sl1", PaymentID: "pay_001", LineType: "payment", AmountMinor: 10000, CreditMinor: 9728, FeeMinor: 272, Currency: "INR",
		}},
		Decisions: []SettlementBankDecision{{
			ID: "d1", SettlementLineID: "sl1", BankObservationID: "b1", State: BankMatchExact, Confidence: 0.99,
			Evidence: map[string]any{"bank_credit_minor": int64(9728)},
		}},
		Banks: []BankTxn{{ID: "b1", UTR: "UTR123", CreditMinor: 9728, CreditDebit: "CREDIT", Currency: "INR"}},
	}
	got := ReconcilePayment(in)
	if got.Result != ResultMatched {
		t.Fatalf("result=%s reason=%s", got.Result, got.Reason)
	}
	if !got.BankCreditProven {
		t.Fatal("EXACT_MATCH must prove bank credit")
	}
	if got.Exception != nil {
		t.Fatalf("unexpected exception %+v", got.Exception)
	}
	if got.EvidenceRefs.SettlementBankDecisionID != "d1" || got.EvidenceRefs.BankObservationID != "b1" {
		t.Fatalf("evidence %+v", got.EvidenceRefs)
	}
}

func TestPAY002_FailedNoMovementMatchedNotBankCredited(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			ID: "cp2", PaymentID: "pay_002", CanonicalStatus: PaymentFailed, AmountMinor: 5000,
		},
	})
	if got.Result != ResultMatched {
		t.Fatalf("result=%s", got.Result)
	}
	if got.BankCreditProven {
		t.Fatal("failed MATCHED must not claim bank_credited")
	}
	if got.Exception != nil {
		t.Fatal("no exception for accounted failed-no-movement")
	}
	if got.Status != PaymentFailed {
		t.Fatalf("status mutated: %s", got.Status)
	}
}

func TestPAY003_FailedWithBankMovementUnresolved(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_003", CanonicalStatus: PaymentFailed, AmountMinor: 1000,
		},
		Banks: []BankTxn{{ID: "bdebit", DebitMinor: 1000, CreditDebit: "DEBIT"}},
	})
	if got.Result != ResultUnresolved {
		t.Fatalf("result=%s", got.Result)
	}
	if got.Exception == nil {
		t.Fatal("expected exception")
	}
	if got.VarianceAmount != 1000 || got.Exception.VarianceAmount != 1000 {
		t.Fatalf("impact=%d exception=%d", got.VarianceAmount, got.Exception.VarianceAmount)
	}
}

func TestPAY004_FailedRefundLineNoBank(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_004", CanonicalStatus: PaymentFailed, AmountMinor: 2000,
		},
		Lines: []SettlementLine{{
			ID: "ref1", PaymentID: "pay_004", LineType: "refund", AmountMinor: 2000, DebitMinor: 2000,
		}},
	})
	if got.Result != ResultMatched {
		t.Fatalf("result=%s reason=%s", got.Result, got.Reason)
	}
	if got.Exception != nil {
		t.Fatal("refund line explains; no exception")
	}
}

func TestPAY005_CapturedMissingSettlement(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_005", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 10000,
		},
	})
	if got.Result != ResultUnresolved {
		t.Fatalf("result=%s", got.Result)
	}
	if got.Reason != "captured_missing_settlement" {
		t.Fatalf("reason=%s", got.Reason)
	}
	if got.Exception == nil {
		t.Fatal("expected exception")
	}
}

func TestPAY006_ConflictedAmountsPreserved(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_006", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 10000,
		},
		Lines: []SettlementLine{{
			ID: "sl6", PaymentID: "pay_006", LineType: "payment", AmountMinor: 10000, CreditMinor: 9728, FeeMinor: 272, Currency: "INR",
		}},
		Decisions: []SettlementBankDecision{{
			ID: "d6", SettlementLineID: "sl6", BankObservationID: "b6", State: BankMatchConflicted, Rule: BankMatchVariance,
			Evidence: map[string]any{"bank_credit_minor": int64(9500), "difference_minor": int64(228)},
		}},
		Banks: []BankTxn{{ID: "b6", UTR: "UTR123", CreditMinor: 9500, CreditDebit: "CREDIT", Currency: "INR"}},
	})
	if got.Result != ResultVariance && got.Result != ResultConflicted {
		t.Fatalf("result=%s", got.Result)
	}
	if got.ExpectedAmount != 10000 {
		t.Fatalf("payment amount=%d", got.ExpectedAmount)
	}
	if got.EvidenceRefs.SettlementNetMinor != 9728 {
		t.Fatalf("settlement net=%d", got.EvidenceRefs.SettlementNetMinor)
	}
	if got.ObservedAmount != 9500 {
		t.Fatalf("bank=%d", got.ObservedAmount)
	}
	if got.VarianceAmount != 228 {
		t.Fatalf("variance=%d", got.VarianceAmount)
	}
}

func TestPAY007_TwoPaymentsSameBankAmbiguous(t *testing.T) {
	store := NewMemoryFinancialStore()
	store.Payments = []PaymentFact{
		{ID: "cpa", PaymentID: "pay_a", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 1000},
		{ID: "cpb", PaymentID: "pay_b", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 1000},
	}
	store.Lines = []SettlementLine{
		{ID: "sla", PaymentID: "pay_a", LineType: "payment", AmountMinor: 1000, CreditMinor: 1000, Currency: "INR", UTR: "SAMEUTR"},
		{ID: "slb", PaymentID: "pay_b", LineType: "payment", AmountMinor: 1000, CreditMinor: 1000, Currency: "INR", UTR: "SAMEUTR"},
	}
	store.Banks = []BankTxn{{ID: "bshared", UTR: "SAMEUTR", CreditMinor: 1000, CreditDebit: "CREDIT", Currency: "INR"}}
	store.Decisions = []SettlementBankDecision{
		{ID: "da", SettlementLineID: "sla", BankObservationID: "bshared", State: BankMatchExact, Evidence: map[string]any{"bank_credit_minor": int64(1000)}},
		{ID: "db", SettlementLineID: "slb", BankObservationID: "bshared", State: BankMatchExact, Evidence: map[string]any{"bank_credit_minor": int64(1000)}},
	}
	svc := NewFinancialService(store)
	run, results, err := svc.Run(context.Background(), FinancialRunRequest{TenantID: "t", ConnectorID: "c"})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != "completed" {
		t.Fatalf("run=%s", run.Status)
	}
	var ambiguous int
	for _, r := range results {
		if r.EntityType == EntityPayment && r.Result == ResultAmbiguous {
			ambiguous++
			if r.Exception == nil {
				t.Fatal("AMBIGUOUS must keep exception, not force MATCHED")
			}
		}
	}
	if ambiguous < 2 {
		t.Fatalf("expected both payments AMBIGUOUS, got %+v", results)
	}
}

func TestPAY008_Phase5AmbiguousBank(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_008", CanonicalStatus: PaymentCaptured, Captured: true, AmountMinor: 1000,
		},
		Lines: []SettlementLine{{ID: "sl8", PaymentID: "pay_008", LineType: "payment", AmountMinor: 1000, CreditMinor: 1000}},
		Decisions: []SettlementBankDecision{{
			ID: "d8", SettlementLineID: "sl8", State: BankMatchAmbiguous, Candidates: []string{"b1", "b2"}, Confidence: 0.5,
		}},
	})
	if got.Result != ResultAmbiguous {
		t.Fatalf("result=%s", got.Result)
	}
	if got.BankCreditProven {
		t.Fatal("must not force a pick")
	}
	if len(got.CandidateIDs) != 2 {
		t.Fatalf("candidates=%v", got.CandidateIDs)
	}
}

func TestSETOrphanBankBecomesOrphanException(t *testing.T) {
	store := NewMemoryFinancialStore()
	store.Banks = []BankTxn{{ID: "borphan", CreditMinor: 9500, CreditDebit: "CREDIT", Currency: "INR"}}
	store.Decisions = []SettlementBankDecision{{
		ID: "dorphan", BankObservationID: "borphan", State: BankMatchOrphanBank,
	}}
	svc := NewFinancialService(store)
	_, results, err := svc.Run(context.Background(), FinancialRunRequest{TenantID: "t", ConnectorID: "c"})
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, r := range results {
		if r.Result == ResultOrphan && r.Exception != nil && r.ObservedAmount == 9500 {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected ORPHAN exception %+v", results)
	}
}

func TestFailedMatchedDoesNotEmitFullyReconciled(t *testing.T) {
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{PaymentID: "pay_x", CanonicalStatus: PaymentFailed},
	})
	if got.Result != ResultMatched || got.BankCreditProven {
		t.Fatalf("%+v", got)
	}
}

func TestStuckOpenStatusUnresolvedNotRenamed(t *testing.T) {
	now := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)
	got := ReconcilePayment(FinancialInput{
		Payment: PaymentFact{
			PaymentID: "pay_stuck", CanonicalStatus: PaymentAuthorized,
			ProviderCreatedAt: now.Add(-80 * time.Hour),
		},
		Now: now, StuckAfter: DefaultStuckAfter,
	})
	if got.Result != ResultUnresolved {
		t.Fatalf("result=%s", got.Result)
	}
	if got.Status != PaymentAuthorized {
		t.Fatalf("must not rename status to STUCK, got %s", got.Status)
	}
}

func TestFinancialRunEmitsReconDecision(t *testing.T) {
	store := NewMemoryFinancialStore()
	store.Payments = []PaymentFact{{
		ID: "cp", PaymentID: "pay_run", CanonicalStatus: PaymentFailed, AmountMinor: 1,
	}}
	svc := NewFinancialService(store)
	_, _, err := svc.Run(context.Background(), FinancialRunRequest{TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "c"})
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Outbox) == 0 {
		t.Fatal("expected reconciliation.decision.v1")
	}
	if store.Outbox[0].EventType != models.EventTypeReconDecisionV1 {
		t.Fatalf("event=%s", store.Outbox[0].EventType)
	}
}

func TestInvestigateCopiesStructuredImpact(t *testing.T) {
	store := NewMemoryFinancialStore()
	store.Exceptions = []ReconciliationException{{
		ID: "ex1", EntityType: EntityPayment, EntityID: "pay_003",
		Reason: "failed_with_bank_movement", VarianceAmount: 777, Confidence: 0.9,
		EvidenceIDs: []string{"bdebit"},
	}}
	svc := NewFinancialService(store)
	rec, err := svc.Investigate(context.Background(), "t", "c", "ex1", "")
	if err != nil {
		t.Fatal(err)
	}
	if rec.FinancialImpact != 777 {
		t.Fatalf("impact=%d", rec.FinancialImpact)
	}
	if rec.EvidenceIDs[0] != "bdebit" {
		t.Fatalf("evidence=%v", rec.EvidenceIDs)
	}
}
