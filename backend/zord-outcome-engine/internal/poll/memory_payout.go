package poll

import (
	"context"

	"zord-outcome-engine/internal/payouttruth"

	"github.com/google/uuid"
)

var _ payouttruth.Store = (*MemoryStore)(nil)

func payoutKey(tenantID, connectorID, payoutID string) string {
	return tenantID + "|" + connectorID + "|" + payoutID
}

func (m *MemoryStore) InsertPayoutObservationEvent(_ context.Context, obs payouttruth.Observation) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if obs.IdentityHash == "" {
		obs.IdentityHash = payouttruth.IdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PayoutID, obs.Source, obs.SourceEventID, obs.SourceHash)
	}
	for _, ev := range m.PayoutEvents {
		if ev.IdentityHash == obs.IdentityHash && obs.IdentityHash != "" {
			return false, nil
		}
	}
	m.PayoutEvents = append(m.PayoutEvents, obs)
	return true, nil
}

func (m *MemoryStore) GetCanonicalPayout(_ context.Context, tenantID, connectorID, payoutID string) (payouttruth.CanonicalPayout, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	pay, ok := m.CanonicalPayouts[payoutKey(tenantID, connectorID, payoutID)]
	if !ok {
		return payouttruth.CanonicalPayout{}, false, nil
	}
	return pay, true, nil
}

func (m *MemoryStore) UpsertCanonicalPayout(_ context.Context, pay payouttruth.CanonicalPayout) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.CanonicalPayouts == nil {
		m.CanonicalPayouts = map[string]payouttruth.CanonicalPayout{}
	}
	if pay.ID == "" {
		pay.ID = uuid.Must(uuid.NewV7()).String()
	}
	m.CanonicalPayouts[payoutKey(pay.TenantID, pay.ConnectorID, pay.PayoutID)] = pay
	return nil
}

func (m *MemoryStore) ListPayoutObservationEvents(_ context.Context, tenantID, connectorID, payoutID string) ([]payouttruth.Observation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []payouttruth.Observation
	for _, ev := range m.PayoutEvents {
		if ev.TenantID == tenantID && ev.ConnectorID == connectorID && ev.PayoutID == payoutID {
			out = append(out, ev)
		}
	}
	return out, nil
}
