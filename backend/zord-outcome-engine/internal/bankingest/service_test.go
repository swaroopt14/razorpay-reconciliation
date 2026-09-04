package bankingest

import (
	"context"
	"testing"

	"zord-outcome-engine/internal/imports"
	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/models"
)

type fakeStore struct {
	lines     []recon.SettlementLine
	banks     []recon.BankTxn
	decisions []recon.SettlementBankDecision
	outbox    []models.OutboxRow
	proofs    int
}

func (f *fakeStore) ListSettlementLines(context.Context, string, string) ([]recon.SettlementLine, error) {
	return f.lines, nil
}
func (f *fakeStore) ListBankTxns(context.Context, string, string, string) ([]recon.BankTxn, error) {
	return f.banks, nil
}
func (f *fakeStore) InsertSettlementBankDecisions(_ context.Context, _, _ string, d []recon.SettlementBankDecision) error {
	f.decisions = append(f.decisions, d...)
	return nil
}
func (f *fakeStore) InsertMatchOutbox(_ context.Context, row models.OutboxRow) error {
	f.outbox = append(f.outbox, row)
	return nil
}
func (f *fakeStore) CountProofs(context.Context, string, string) (int, error) {
	return f.proofs, nil
}

func TestMatchDoesNotWriteProof(t *testing.T) {
	f := &fakeStore{
		lines: []recon.SettlementLine{{
			ID: "sl", EntityID: "pay_123", PaymentID: "pay_123", CreditMinor: 9728, Currency: "INR", UTR: "UTR123",
		}},
		banks: []recon.BankTxn{{
			ID: "b1", UTR: "UTR123", CreditMinor: 9728, CreditDebit: "CREDIT", Currency: "INR",
		}},
	}
	svc := NewService(imports.NewService(imports.NewMemoryStore()), f)
	got, err := svc.Match(context.Background(), "t", "c", "acc")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].State != recon.BankMatchExact {
		t.Fatalf("%+v", got)
	}
	if len(f.outbox) != 1 || f.outbox[0].EventType != models.EventTypeBankMatchCompletedV1 {
		t.Fatalf("outbox=%+v", f.outbox)
	}
	if f.proofs != 0 {
		t.Fatal("proofs")
	}
}
