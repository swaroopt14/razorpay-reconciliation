package poll

import (
	"context"
	"sync"
	"time"

	"zord-outcome-engine/internal/paymenttruth"
	"zord-outcome-engine/internal/payouttruth"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

var _ Store = (*MemoryStore)(nil)

// MemoryStore is an in-process Store for unit tests.
type MemoryStore struct {
	mu          sync.Mutex
	Jobs        map[string]BackfillJob
	Cursors     map[string]BackfillCursor
	Receipts    []ResponseReceipt
	Payments    map[string]PaymentObservation
	Settlements map[string]SettlementLineObservation
	Outbox      []models.OutboxRow
	Events      []ObservationEvent
	Canonicals       map[string]paymenttruth.CanonicalPayment
	CanonicalPayouts map[string]payouttruth.CanonicalPayout
	PayoutEvents     []payouttruth.Observation
	Intents          map[string]string
}

type ObservationEvent struct {
	TenantID     string
	ConnectorID  string
	PaymentID    string
	Source       string
	Status       string
	PayloadHash  string
	IdentityHash string
	SourceEventID string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		Jobs:        map[string]BackfillJob{},
		Cursors:     map[string]BackfillCursor{},
		Payments:    map[string]PaymentObservation{},
		Settlements: map[string]SettlementLineObservation{},
		Canonicals:       map[string]paymenttruth.CanonicalPayment{},
		CanonicalPayouts: map[string]payouttruth.CanonicalPayout{},
		Intents:          map[string]string{},
	}
}

func cursorKey(tenantID, connectorID, resourceType string, from, to time.Time) string {
	return tenantID + "|" + connectorID + "|" + resourceType + "|" + from.UTC().Format(time.RFC3339Nano) + "|" + to.UTC().Format(time.RFC3339Nano)
}

func paymentKey(tenantID, connectorID, paymentID string) string {
	return tenantID + "|" + connectorID + "|" + paymentID
}

func settlementKey(tenantID, connectorID, settlementID, entityID string) string {
	return tenantID + "|" + connectorID + "|" + settlementID + "|" + entityID
}

func (m *MemoryStore) RunInTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func (m *MemoryStore) CreateJob(_ context.Context, job BackfillJob) (BackfillJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if job.ID == "" {
		job.ID = uuid.Must(uuid.NewV7()).String()
	}
	now := time.Now().UTC()
	job.CreatedAt = now
	job.UpdatedAt = now
	m.Jobs[job.ID] = job
	return job, nil
}

func (m *MemoryStore) FindActiveJob(_ context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (*BackfillJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, j := range m.Jobs {
		if j.TenantID == tenantID && j.ConnectorID == connectorID && j.ResourceType == resourceType &&
			j.WindowFrom.Equal(from) && j.WindowTo.Equal(to) && (j.Status == JobQueued || j.Status == JobRunning) {
			cp := j
			return &cp, nil
		}
	}
	return nil, nil
}

func (m *MemoryStore) GetJob(_ context.Context, jobID string) (BackfillJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.Jobs[jobID]
	if !ok {
		return BackfillJob{}, ErrJobNotFound
	}
	return j, nil
}

func (m *MemoryStore) UpdateJob(_ context.Context, job BackfillJob) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	job.UpdatedAt = time.Now().UTC()
	m.Jobs[job.ID] = job
	return nil
}

func (m *MemoryStore) EnsureCursor(_ context.Context, c BackfillCursor) (BackfillCursor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := cursorKey(c.TenantID, c.ConnectorID, c.ResourceType, c.WindowFrom, c.WindowTo)
	if existing, ok := m.Cursors[key]; ok {
		return existing, nil
	}
	if c.ID == "" {
		c.ID = uuid.Must(uuid.NewV7()).String()
	}
	c.UpdatedAt = time.Now().UTC()
	m.Cursors[key] = c
	return c, nil
}

func (m *MemoryStore) GetCursor(_ context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (BackfillCursor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.Cursors[cursorKey(tenantID, connectorID, resourceType, from, to)]
	if !ok {
		return BackfillCursor{}, ErrJobNotFound
	}
	return c, nil
}

func (m *MemoryStore) AcquireCursorLease(_ context.Context, tenantID, connectorID, resourceType string, from, to time.Time, owner string, ttl time.Duration) (BackfillCursor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := cursorKey(tenantID, connectorID, resourceType, from, to)
	c, ok := m.Cursors[key]
	if !ok {
		return BackfillCursor{}, ErrJobNotFound
	}
	now := time.Now().UTC()
	if c.LeaseOwner != "" && c.LeaseOwner != owner && c.LeaseExpiresAt != nil && c.LeaseExpiresAt.After(now) {
		return BackfillCursor{}, ErrCursorLeaseHeld
	}
	exp := now.Add(ttl)
	c.LeaseOwner = owner
	c.LeaseExpiresAt = &exp
	c.UpdatedAt = now
	m.Cursors[key] = c
	return c, nil
}

func (m *MemoryStore) AdvanceCursor(_ context.Context, c BackfillCursor) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := cursorKey(c.TenantID, c.ConnectorID, c.ResourceType, c.WindowFrom, c.WindowTo)
	c.UpdatedAt = time.Now().UTC()
	m.Cursors[key] = c
	return nil
}

func (m *MemoryStore) ReleaseCursorLease(_ context.Context, cursorID, owner string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, c := range m.Cursors {
		if c.ID == cursorID && c.LeaseOwner == owner {
			c.LeaseOwner = ""
			c.LeaseExpiresAt = nil
			m.Cursors[k] = c
		}
	}
	return nil
}

func (m *MemoryStore) InsertResponseReceipt(_ context.Context, rec ResponseReceipt) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if rec.ID == "" {
		rec.ID = uuid.Must(uuid.NewV7()).String()
	}
	for _, existing := range m.Receipts {
		if existing.BackfillJobID == rec.BackfillJobID && existing.RequestPath == rec.RequestPath && existing.RequestQueryHash == rec.RequestQueryHash {
			return nil
		}
	}
	m.Receipts = append(m.Receipts, rec)
	return nil
}

func (m *MemoryStore) UpsertPayment(_ context.Context, obs PaymentObservation) (UpsertResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	obs.Source = NormalizeObservationSource(obs.Source)
	key := paymentKey(obs.TenantID, obs.ConnectorID, obs.Item.PaymentID)
	if existing, ok := m.Payments[key]; ok {
		before := len(existing.Sources)
		existing.Sources = appendUniqueSource(existing.Sources, obs.Source)
		if HasWebhookSource(existing.Source, existing.Sources) {
			existing.WebhookMissing = false
		} else if obs.WebhookMissing {
			existing.WebhookMissing = true
		}
		if existing.Item.PayloadHash == obs.Item.PayloadHash {
			m.Payments[key] = existing
			if len(existing.Sources) > before {
				m.Events = append(m.Events, ObservationEvent{
					TenantID: obs.TenantID, ConnectorID: obs.ConnectorID, PaymentID: obs.Item.PaymentID,
					Source: obs.Source, Status: obs.Item.Status, PayloadHash: obs.Item.PayloadHash,
				})
			}
			return UpsertDuplicate, nil
		}
		obs.Sources = existing.Sources
		obs.WebhookMissing = existing.WebhookMissing
		if obs.ID == "" {
			obs.ID = existing.ID
		}
		m.Payments[key] = obs
		m.Events = append(m.Events, ObservationEvent{
			TenantID: obs.TenantID, ConnectorID: obs.ConnectorID, PaymentID: obs.Item.PaymentID,
			Source: obs.Source, Status: obs.Item.Status, PayloadHash: obs.Item.PayloadHash,
		})
		return UpsertUpdated, nil
	}
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	obs.Sources = appendUniqueSource(obs.Sources, obs.Source)
	if HasWebhookSource(obs.Source, obs.Sources) {
		obs.WebhookMissing = false
	}
	m.Payments[key] = obs
	m.Events = append(m.Events, ObservationEvent{
		TenantID: obs.TenantID, ConnectorID: obs.ConnectorID, PaymentID: obs.Item.PaymentID,
		Source: obs.Source, Status: obs.Item.Status, PayloadHash: obs.Item.PayloadHash,
	})
	return UpsertInserted, nil
}

func (m *MemoryStore) UpsertSettlementLine(_ context.Context, obs SettlementLineObservation) (UpsertResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := settlementKey(obs.TenantID, obs.ConnectorID, obs.Item.SettlementID, obs.Item.EntityID)
	if existing, ok := m.Settlements[key]; ok {
		if existing.Item.PayloadHash == obs.Item.PayloadHash {
			return UpsertDuplicate, nil
		}
		m.Settlements[key] = obs
		return UpsertUpdated, nil
	}
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	m.Settlements[key] = obs
	return UpsertInserted, nil
}

func (m *MemoryStore) ListPaymentIDsInWindow(_ context.Context, tenantID, connectorID string, from, to time.Time) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var ids []string
	for _, obs := range m.Payments {
		if obs.TenantID != tenantID || obs.ConnectorID != connectorID {
			continue
		}
		ts := obs.Item.CreatedAt
		if (ts.Equal(from) || ts.After(from)) && ts.Before(to) {
			ids = append(ids, obs.Item.PaymentID)
		}
	}
	return ids, nil
}

func (m *MemoryStore) GetPaymentHash(_ context.Context, tenantID, connectorID, paymentID string) (string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	obs, ok := m.Payments[paymentKey(tenantID, connectorID, paymentID)]
	if !ok {
		return "", false, nil
	}
	return obs.Item.PayloadHash, true, nil
}

func (m *MemoryStore) InsertOutbox(_ context.Context, row models.OutboxRow) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if row.IdempotencyKey != "" {
		for _, existing := range m.Outbox {
			if existing.IdempotencyKey == row.IdempotencyKey {
				return nil
			}
		}
	}
	m.Outbox = append(m.Outbox, row)
	return nil
}
