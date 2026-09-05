package recon

import (
	"context"
	"testing"
)

func TestServiceRunPersistsProofAndDoesNotCreditWithoutBank(t *testing.T) {
	store := NewMemoryStore()
	store.Payments = []PaymentObs{{PaymentID: "pay_1", Status: "captured", Captured: true, Currency: "INR", PayloadHash: "sha256:p"}}
	store.Lines = []SettlementLine{{
		SettlementID: "setl_1", EntityID: "pay_1", PaymentID: "pay_1",
		CreditMinor: 100, Currency: "INR", UTR: "utr_1", Settled: true, PayloadHash: "sha256:s",
	}}
	svc := NewService(store)
	got, err := svc.Run(context.Background(), "t1", "c1", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].BankCreditState == BankMatched {
		t.Fatalf("%+v", got)
	}
	body, err := svc.GetProof(context.Background(), "t1", "c1", "pay_1")
	if err != nil {
		t.Fatal(err)
	}
	data := body["data"].(map[string]any)
	summary := data["proof_summary"].(map[string]any)
	if summary["bank_credited"] == Proven {
		t.Fatal("bank_credited must stay unproven")
	}
	if summary["provider_settled"] != Proven {
		t.Fatal("provider_settled should be proven")
	}
}

func TestServiceVerifyEvidenceLeaves(t *testing.T) {
	store := NewMemoryStore()
	store.Payments = []PaymentObs{{PaymentID: "pay_1", Status: "captured", Captured: true, PayloadHash: "sha256:p", HasWebhook: true}}
	store.Lines = []SettlementLine{{SettlementID: "setl", EntityID: "pay_1", PaymentID: "pay_1", CreditMinor: 1, UTR: "u", Settled: true, PayloadHash: "sha256:s"}}
	store.Banks = []BankTxn{{ID: "b1", UTR: "u", CreditMinor: 1, RowHash: "sha256:b"}}
	svc := NewService(store)
	if _, err := svc.Run(context.Background(), "t", "c", ""); err != nil {
		t.Fatal(err)
	}
	v, err := svc.VerifyEvidence(context.Background(), "t", "c", "pay_1")
	if err != nil {
		t.Fatal(err)
	}
	if v["verified"] != true {
		t.Fatalf("%v", v)
	}
}
