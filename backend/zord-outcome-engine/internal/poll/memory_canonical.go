package poll

import (
	"context"

	"zord-outcome-engine/internal/paymenttruth"
	"zord-outcome-engine/internal/poll/providers/razorpay"

	"github.com/google/uuid"
)

var _ paymenttruth.Store = (*MemoryStore)(nil)

func canonicalKey(tenantID, connectorID, paymentID string) string {
	return tenantID + "|" + connectorID + "|" + paymentID
}

func (m *MemoryStore) InsertObservationEvent(_ context.Context, obs paymenttruth.Observation) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if obs.IdentityHash == "" {
		obs.IdentityHash = paymenttruth.ObservationIdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PaymentID, obs.Source, obs.SourceEventID, obs.SourceHash)
	}
	for _, ev := range m.Events {
		if ev.IdentityHash == obs.IdentityHash && obs.IdentityHash != "" {
			return false, nil
		}
	}
	m.Events = append(m.Events, ObservationEvent{
		TenantID:      obs.TenantID,
		ConnectorID:   obs.ConnectorID,
		PaymentID:     obs.PaymentID,
		Source:        obs.Source,
		Status:        obs.CanonicalStatus,
		PayloadHash:   obs.SourceHash,
		IdentityHash:  obs.IdentityHash,
		SourceEventID: obs.SourceEventID,
	})
	return true, nil
}

func (m *MemoryStore) GetCanonicalPayment(_ context.Context, tenantID, connectorID, paymentID string) (paymenttruth.CanonicalPayment, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	pay, ok := m.Canonicals[canonicalKey(tenantID, connectorID, paymentID)]
	if !ok {
		return paymenttruth.CanonicalPayment{}, false, nil
	}
	return pay, true, nil
}

func (m *MemoryStore) UpsertCanonicalPayment(_ context.Context, pay paymenttruth.CanonicalPayment) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Canonicals == nil {
		m.Canonicals = map[string]paymenttruth.CanonicalPayment{}
	}
	if pay.ID == "" {
		pay.ID = uuid.Must(uuid.NewV7()).String()
	}
	if pay.IntentLink == "" {
		pay.IntentLink = paymenttruth.IntentUnlinked
	}
	m.Canonicals[canonicalKey(pay.TenantID, pay.ConnectorID, pay.PaymentID)] = pay
	return nil
}

func (m *MemoryStore) ApplyCanonicalSnapshot(_ context.Context, pay paymenttruth.CanonicalPayment, incoming paymenttruth.Observation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := paymentKey(pay.TenantID, pay.ConnectorID, pay.PaymentID)
	existing := m.Payments[key]
	sources := appendUniqueSource(append([]string(nil), existing.Sources...), incoming.Source)
	for _, s := range pay.Sources {
		sources = appendUniqueSource(sources, s)
	}
	item := razorpay.NeutralPayment{
		PaymentID:      pay.PaymentID,
		OrderID:        pay.OrderID,
		AmountMinor:    pay.AmountMinor,
		Currency:       pay.Currency,
		Status:         pay.CanonicalStatus,
		ProviderStatus: pay.ProviderStatus,
		Method:         pay.Method,
		Captured:       pay.Captured,
		FeeMinor:       pay.FeeMinor,
		TaxMinor:       pay.TaxMinor,
		CreatedAt:      pay.ProviderCreatedAt,
		CapturedAt:     pay.CapturedAt,
		Email:          incoming.Email,
		Contact:        incoming.Contact,
		PayloadHash:    incoming.SourceHash,
	}
	if item.Email == "" {
		item.Email = existing.Item.Email
	}
	if item.Contact == "" {
		item.Contact = existing.Item.Contact
	}
	obs := PaymentObservation{
		ID:             existing.ID,
		TenantID:       pay.TenantID,
		ConnectorID:    pay.ConnectorID,
		Provider:       pay.Provider,
		ProviderMode:   incoming.ProviderMode,
		Item:           item,
		ReceiptID:      incoming.ReceiptID,
		Source:         incoming.Source,
		Sources:        sources,
		WebhookMissing: incoming.WebhookMissing && !HasWebhookSource("", sources),
	}
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	if HasWebhookSource(obs.Source, obs.Sources) {
		obs.WebhookMissing = false
	}
	m.Payments[key] = obs
	return nil
}

func (m *MemoryStore) FindIntentByOrderID(_ context.Context, tenantID, orderID string) (string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Intents == nil || orderID == "" {
		return "", false, nil
	}
	id, ok := m.Intents[tenantID+"|"+orderID]
	return id, ok && id != "", nil
}

func (m *MemoryStore) ListObservationEvents(_ context.Context, tenantID, connectorID, paymentID string) ([]paymenttruth.Observation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []paymenttruth.Observation
	for _, ev := range m.Events {
		if ev.TenantID == tenantID && ev.ConnectorID == connectorID && ev.PaymentID == paymentID {
			out = append(out, paymenttruth.Observation{
				TenantID:      ev.TenantID,
				ConnectorID:   ev.ConnectorID,
				PaymentID:     ev.PaymentID,
				Source:        ev.Source,
				CanonicalStatus: ev.Status,
				SourceHash:    ev.PayloadHash,
				IdentityHash:  ev.IdentityHash,
				SourceEventID: ev.SourceEventID,
			})
		}
	}
	return out, nil
}

func (m *MemoryStore) SetIntent(tenantID, orderID, intentID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Intents == nil {
		m.Intents = map[string]string{}
	}
	m.Intents[tenantID+"|"+orderID] = intentID
}
