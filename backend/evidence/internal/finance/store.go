package finance

import (
	"context"
	"sync"
	"time"
)

type Store interface {
	InsertEvidence(ctx context.Context, ev Evidence, snap Snapshot) (Evidence, bool, error)
	GetEvidence(ctx context.Context, tenantID, evidenceID string) (Evidence, Snapshot, bool, error)
	ListEvidence(ctx context.Context, tenantID, entityType, entityID string) ([]Evidence, error)
	GetSnapshot(ctx context.Context, evidenceID string) (Snapshot, bool, error)
	InsertLink(ctx context.Context, l Link) error
	ListLinks(ctx context.Context, tenantID string, evidenceIDs []string) ([]Link, error)
	InsertCalculation(ctx context.Context, c CalculationTrace) (CalculationTrace, error)
	ListCalculations(ctx context.Context, tenantID, entityType, entityID string) ([]CalculationTrace, error)
	InsertDecision(ctx context.Context, d DecisionTrace) (DecisionTrace, error)
	ListDecisions(ctx context.Context, tenantID, entityType, entityID string) ([]DecisionTrace, error)
	AttachInvestigation(ctx context.Context, link InvestigationLink) error
	ListInvestigationEvidence(ctx context.Context, investigationID string) ([]InvestigationLink, error)
	InsertAudit(ctx context.Context, a AuditEvent) error
	ListAudit(ctx context.Context, tenantID, entityType, entityID string) ([]AuditEvent, error)
	UpsertPack(ctx context.Context, p Pack) (Pack, error)
	GetPackByInvestigation(ctx context.Context, tenantID, investigationID string) (Pack, bool, error)
}

type MemoryStore struct {
	mu       sync.Mutex
	Evidence map[string]Evidence
	Snaps    map[string]Snapshot
	ByIdent  map[string]string
	Links    []Link
	Calcs    []CalculationTrace
	Decs     []DecisionTrace
	Inv      []InvestigationLink
	Audit    []AuditEvent
	Packs    map[string]Pack
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		Evidence: map[string]Evidence{},
		Snaps:    map[string]Snapshot{},
		ByIdent:  map[string]string{},
		Packs:    map[string]Pack{},
	}
}

func identKey(tenantID, sourceType, sourceID, sourceHash string) string {
	return tenantID + "|" + sourceType + "|" + sourceID + "|" + sourceHash
}

func (m *MemoryStore) InsertEvidence(_ context.Context, ev Evidence, snap Snapshot) (Evidence, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := identKey(ev.TenantID, ev.SourceType, ev.SourceID, ev.SourceHash)
	if id, ok := m.ByIdent[key]; ok {
		return m.Evidence[id], false, nil
	}
	m.Evidence[ev.ID] = ev
	m.ByIdent[key] = ev.ID
	snap.EvidenceID = ev.ID
	m.Snaps[ev.ID] = snap
	return ev, true, nil
}

func (m *MemoryStore) GetEvidence(_ context.Context, tenantID, evidenceID string) (Evidence, Snapshot, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ev, ok := m.Evidence[evidenceID]
	if !ok || ev.TenantID != tenantID {
		return Evidence{}, Snapshot{}, false, nil
	}
	return ev, m.Snaps[evidenceID], true, nil
}

func (m *MemoryStore) ListEvidence(_ context.Context, tenantID, entityType, entityID string) ([]Evidence, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Evidence
	for _, ev := range m.Evidence {
		if ev.TenantID == tenantID && ev.EntityType == entityType && ev.EntityID == entityID {
			out = append(out, ev)
		}
	}
	return out, nil
}

func (m *MemoryStore) GetSnapshot(_ context.Context, evidenceID string) (Snapshot, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.Snaps[evidenceID]
	return s, ok, nil
}

func (m *MemoryStore) InsertLink(_ context.Context, l Link) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Links = append(m.Links, l)
	return nil
}

func (m *MemoryStore) ListLinks(_ context.Context, tenantID string, evidenceIDs []string) ([]Link, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	want := map[string]struct{}{}
	for _, id := range evidenceIDs {
		want[id] = struct{}{}
	}
	var out []Link
	for _, l := range m.Links {
		if l.TenantID != tenantID {
			continue
		}
		if _, ok := want[l.EvidenceID]; ok {
			out = append(out, l)
		}
	}
	return out, nil
}

func (m *MemoryStore) InsertCalculation(_ context.Context, c CalculationTrace) (CalculationTrace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Calcs = append(m.Calcs, c)
	return c, nil
}

func (m *MemoryStore) ListCalculations(_ context.Context, tenantID, entityType, entityID string) ([]CalculationTrace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []CalculationTrace
	for _, c := range m.Calcs {
		if c.TenantID == tenantID && c.EntityType == entityType && c.EntityID == entityID {
			out = append(out, c)
		}
	}
	return out, nil
}

func (m *MemoryStore) InsertDecision(_ context.Context, d DecisionTrace) (DecisionTrace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Decs = append(m.Decs, d)
	return d, nil
}

func (m *MemoryStore) ListDecisions(_ context.Context, tenantID, entityType, entityID string) ([]DecisionTrace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []DecisionTrace
	for _, d := range m.Decs {
		if d.TenantID == tenantID && d.EntityType == entityType && d.EntityID == entityID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (m *MemoryStore) AttachInvestigation(_ context.Context, link InvestigationLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.Inv {
		if existing.InvestigationID == link.InvestigationID && existing.EvidenceID == link.EvidenceID {
			return nil
		}
	}
	if link.CreatedAt.IsZero() {
		link.CreatedAt = time.Now().UTC()
	}
	m.Inv = append(m.Inv, link)
	return nil
}

func (m *MemoryStore) ListInvestigationEvidence(_ context.Context, investigationID string) ([]InvestigationLink, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []InvestigationLink
	for _, l := range m.Inv {
		if l.InvestigationID == investigationID {
			out = append(out, l)
		}
	}
	return out, nil
}

func (m *MemoryStore) InsertAudit(_ context.Context, a AuditEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Audit = append(m.Audit, a)
	return nil
}

func (m *MemoryStore) ListAudit(_ context.Context, tenantID, entityType, entityID string) ([]AuditEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []AuditEvent
	for _, a := range m.Audit {
		if a.TenantID == tenantID && a.EntityType == entityType && a.EntityID == entityID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (m *MemoryStore) UpsertPack(_ context.Context, p Pack) (Pack, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := p.TenantID + "|" + p.InvestigationID
	if existing, ok := m.Packs[key]; ok {
		return existing, nil
	}
	m.Packs[key] = p
	return p, nil
}

func (m *MemoryStore) TamperSnapshot(evidenceID string, snapshot map[string]any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.Snaps[evidenceID]
	s.Snapshot = snapshot
	m.Snaps[evidenceID] = s
}

func (m *MemoryStore) GetPackByInvestigation(_ context.Context, tenantID, investigationID string) (Pack, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.Packs[tenantID+"|"+investigationID]
	return p, ok, nil
}
