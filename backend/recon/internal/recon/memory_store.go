package recon

import (
	"context"
	"sync"

	"github.com/google/uuid"
)

var _ Store = (*MemoryStore)(nil)

type MemoryStore struct {
	mu       sync.Mutex
	Uploads  []BankUpload
	Banks    []BankTxn
	Payments []PaymentObs
	Lines    []SettlementLine
	Proofs   map[string]ProofSubject
	Leaves   []EvidenceLeaf
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{Proofs: map[string]ProofSubject{}}
}

func (m *MemoryStore) key(tenant, connector, payment string) string {
	return tenant + "|" + connector + "|" + payment
}

func (m *MemoryStore) InsertUpload(_ context.Context, up BankUpload) (BankUpload, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if up.ID == "" {
		up.ID = uuid.Must(uuid.NewV7()).String()
	}
	m.Uploads = append(m.Uploads, up)
	return up, nil
}

func (m *MemoryStore) InsertBankTxns(_ context.Context, _, _, _ string, rows []BankTxn) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Banks = append(m.Banks, rows...)
	return nil
}

func (m *MemoryStore) ListBankTxns(_ context.Context, _, _, accountID string) ([]BankTxn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if accountID == "" {
		return append([]BankTxn{}, m.Banks...), nil
	}
	var out []BankTxn
	for _, b := range m.Banks {
		if b.AccountID == accountID {
			out = append(out, b)
		}
	}
	return out, nil
}

func (m *MemoryStore) ListPayments(context.Context, string, string) ([]PaymentObs, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]PaymentObs{}, m.Payments...), nil
}

func (m *MemoryStore) ListSettlementLines(context.Context, string, string) ([]SettlementLine, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]SettlementLine{}, m.Lines...), nil
}

func (m *MemoryStore) UpsertProof(_ context.Context, sub ProofSubject) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Proofs[m.key(sub.TenantID, sub.ConnectorID, sub.PaymentID)] = sub
	return nil
}

func (m *MemoryStore) InsertDecisions(context.Context, string, string, []MatchDecision) error {
	return nil
}

func (m *MemoryStore) GetProof(_ context.Context, tenantID, connectorID, paymentID string) (ProofSubject, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.Proofs[m.key(tenantID, connectorID, paymentID)]
	if !ok {
		return ProofSubject{}, ErrNotFound
	}
	return s, nil
}

func (m *MemoryStore) ListProofs(context.Context, string, string) ([]ProofSubject, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ProofSubject
	for _, p := range m.Proofs {
		out = append(out, p)
	}
	return out, nil
}

func (m *MemoryStore) InsertLeaves(_ context.Context, _, _ string, leaves []EvidenceLeaf) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Leaves = append(m.Leaves, leaves...)
	return nil
}

func (m *MemoryStore) ListLeaves(_ context.Context, _, _, paymentID string) ([]EvidenceLeaf, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []EvidenceLeaf
	for _, l := range m.Leaves {
		if l.PaymentID == paymentID {
			out = append(out, l)
		}
	}
	return out, nil
}
