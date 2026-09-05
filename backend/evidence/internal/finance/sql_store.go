package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/lib/pq"
)

type SQLStore struct {
	DB *sql.DB
}

func NewSQLStore(db *sql.DB) *SQLStore {
	return &SQLStore{DB: db}
}

func (s *SQLStore) InsertEvidence(ctx context.Context, ev Evidence, snap Snapshot) (Evidence, bool, error) {
	meta, _ := json.Marshal(ev.Metadata)
	if ev.Metadata == nil {
		meta = []byte("{}")
	}
	var id string
	err := s.DB.QueryRowContext(ctx, `
		INSERT INTO finance_evidence (
			id, tenant_id, entity_type, entity_id, evidence_type, source_type, source_id,
			source_reference, source_hash, observed_at, captured_at, role, authority, metadata, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (tenant_id, source_type, source_id, source_hash) DO NOTHING
		RETURNING id`,
		ev.ID, ev.TenantID, ev.EntityType, ev.EntityID, ev.EvidenceType, ev.SourceType, ev.SourceID,
		ev.SourceReference, ev.SourceHash, ev.ObservedAt, ev.CapturedAt, ev.Role, ev.Authority, meta, ev.CreatedAt,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		row := s.DB.QueryRowContext(ctx, `
			SELECT id FROM finance_evidence WHERE tenant_id=$1 AND source_type=$2 AND source_id=$3 AND source_hash=$4`,
			ev.TenantID, ev.SourceType, ev.SourceID, ev.SourceHash)
		if err := row.Scan(&id); err != nil {
			return Evidence{}, false, err
		}
		got, _, ok, err := s.GetEvidence(ctx, ev.TenantID, id)
		return got, false, errMust(ok, err)
	}
	if err != nil {
		return Evidence{}, false, err
	}
	body, _ := json.Marshal(snap.Snapshot)
	if snap.ID == "" {
		snap.ID = "snap_" + ev.ID
	}
	_, err = s.DB.ExecContext(ctx, `
		INSERT INTO finance_evidence_snapshots (id, evidence_id, schema_version, snapshot, snapshot_hash, created_at)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (evidence_id) DO NOTHING`,
		snap.ID, ev.ID, snap.SchemaVersion, body, snap.SnapshotHash, snap.CreatedAt)
	if err != nil {
		return Evidence{}, false, err
	}
	ev.ID = id
	return ev, true, nil
}

func errMust(ok bool, err error) error {
	if err != nil {
		return err
	}
	if !ok {
		return sql.ErrNoRows
	}
	return nil
}

func (s *SQLStore) GetEvidence(ctx context.Context, tenantID, evidenceID string) (Evidence, Snapshot, bool, error) {
	var ev Evidence
	var meta []byte
	err := s.DB.QueryRowContext(ctx, `
		SELECT id, tenant_id, entity_type, entity_id, evidence_type, source_type, source_id,
			source_reference, source_hash, observed_at, captured_at, role, authority, metadata, created_at
		FROM finance_evidence WHERE id=$1 AND tenant_id=$2`, evidenceID, tenantID,
	).Scan(&ev.ID, &ev.TenantID, &ev.EntityType, &ev.EntityID, &ev.EvidenceType, &ev.SourceType, &ev.SourceID,
		&ev.SourceReference, &ev.SourceHash, &ev.ObservedAt, &ev.CapturedAt, &ev.Role, &ev.Authority, &meta, &ev.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Evidence{}, Snapshot{}, false, nil
	}
	if err != nil {
		return Evidence{}, Snapshot{}, false, err
	}
	_ = json.Unmarshal(meta, &ev.Metadata)
	snap, _, err := s.GetSnapshot(ctx, ev.ID)
	return ev, snap, true, err
}

func (s *SQLStore) ListEvidence(ctx context.Context, tenantID, entityType, entityID string) ([]Evidence, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, tenant_id, entity_type, entity_id, evidence_type, source_type, source_id,
			source_reference, source_hash, observed_at, captured_at, role, authority, created_at
		FROM finance_evidence WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at ASC`,
		tenantID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Evidence
	for rows.Next() {
		var ev Evidence
		if err := rows.Scan(&ev.ID, &ev.TenantID, &ev.EntityType, &ev.EntityID, &ev.EvidenceType, &ev.SourceType, &ev.SourceID,
			&ev.SourceReference, &ev.SourceHash, &ev.ObservedAt, &ev.CapturedAt, &ev.Role, &ev.Authority, &ev.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

func (s *SQLStore) GetSnapshot(ctx context.Context, evidenceID string) (Snapshot, bool, error) {
	var snap Snapshot
	var body []byte
	err := s.DB.QueryRowContext(ctx, `
		SELECT id, evidence_id, schema_version, snapshot, snapshot_hash, created_at
		FROM finance_evidence_snapshots WHERE evidence_id=$1`, evidenceID,
	).Scan(&snap.ID, &snap.EvidenceID, &snap.SchemaVersion, &body, &snap.SnapshotHash, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Snapshot{}, false, nil
	}
	if err != nil {
		return Snapshot{}, false, err
	}
	_ = json.Unmarshal(body, &snap.Snapshot)
	return snap, true, nil
}

func (s *SQLStore) InsertLink(ctx context.Context, l Link) error {
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_evidence_links (id, tenant_id, evidence_id, related_evidence_id, relationship, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, l.ID, l.TenantID, l.EvidenceID, l.RelatedEvidenceID, l.Relationship, l.CreatedAt)
	return err
}

func (s *SQLStore) ListLinks(ctx context.Context, tenantID string, evidenceIDs []string) ([]Link, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, tenant_id, evidence_id, related_evidence_id, relationship, created_at
		FROM finance_evidence_links WHERE tenant_id=$1 AND evidence_id = ANY($2)`, tenantID, pq.Array(evidenceIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Link
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.ID, &l.TenantID, &l.EvidenceID, &l.RelatedEvidenceID, &l.Relationship, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *SQLStore) InsertCalculation(ctx context.Context, c CalculationTrace) (CalculationTrace, error) {
	in, _ := json.Marshal(c.Inputs)
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_calculation_traces (
			id, tenant_id, entity_type, entity_id, formula, inputs, output, actual, variance, currency, precision, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		c.ID, c.TenantID, c.EntityType, c.EntityID, c.Formula, in, c.Output, c.Actual, c.Variance, c.Currency, c.Precision, c.CreatedAt)
	return c, err
}

func (s *SQLStore) ListCalculations(ctx context.Context, tenantID, entityType, entityID string) ([]CalculationTrace, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, tenant_id, entity_type, entity_id, formula, inputs, output, actual, variance, currency, precision, created_at
		FROM finance_calculation_traces WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at ASC`,
		tenantID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CalculationTrace
	for rows.Next() {
		var c CalculationTrace
		var in []byte
		if err := rows.Scan(&c.ID, &c.TenantID, &c.EntityType, &c.EntityID, &c.Formula, &in, &c.Output, &c.Actual, &c.Variance, &c.Currency, &c.Precision, &c.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(in, &c.Inputs)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *SQLStore) InsertDecision(ctx context.Context, d DecisionTrace) (DecisionTrace, error) {
	rules, _ := json.Marshal(d.Rules)
	cands, _ := json.Marshal(d.Candidates)
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_decision_traces (
			id, tenant_id, entity_type, entity_id, decision_type, decision, reason, rules, candidates, selected_candidate, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		d.ID, d.TenantID, d.EntityType, d.EntityID, d.DecisionType, d.Decision, d.Reason, rules, cands, d.SelectedCandidate, d.CreatedAt)
	return d, err
}

func (s *SQLStore) ListDecisions(ctx context.Context, tenantID, entityType, entityID string) ([]DecisionTrace, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, tenant_id, entity_type, entity_id, decision_type, decision, reason, rules, candidates, selected_candidate, created_at
		FROM finance_decision_traces WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at ASC`,
		tenantID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DecisionTrace
	for rows.Next() {
		var d DecisionTrace
		var rules, cands []byte
		if err := rows.Scan(&d.ID, &d.TenantID, &d.EntityType, &d.EntityID, &d.DecisionType, &d.Decision, &d.Reason, &rules, &cands, &d.SelectedCandidate, &d.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(rules, &d.Rules)
		_ = json.Unmarshal(cands, &d.Candidates)
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *SQLStore) AttachInvestigation(ctx context.Context, link InvestigationLink) error {
	if link.CreatedAt.IsZero() {
		link.CreatedAt = time.Now().UTC()
	}
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_investigation_evidence (investigation_id, evidence_id, role, created_at)
		VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, link.InvestigationID, link.EvidenceID, link.Role, link.CreatedAt)
	return err
}

func (s *SQLStore) ListInvestigationEvidence(ctx context.Context, investigationID string) ([]InvestigationLink, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT investigation_id, evidence_id, role, created_at FROM finance_investigation_evidence WHERE investigation_id=$1`,
		investigationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InvestigationLink
	for rows.Next() {
		var l InvestigationLink
		if err := rows.Scan(&l.InvestigationID, &l.EvidenceID, &l.Role, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *SQLStore) InsertAudit(ctx context.Context, a AuditEvent) error {
	before, _ := json.Marshal(a.BeforeState)
	after, _ := json.Marshal(a.AfterState)
	meta, _ := json.Marshal(a.Metadata)
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_audit_events (
			id, tenant_id, actor_type, actor_id, action, entity_type, entity_id,
			before_state, after_state, evidence_ids, request_id, correlation_id, metadata, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		a.ID, a.TenantID, a.ActorType, a.ActorID, a.Action, a.EntityType, a.EntityID,
		nullJSON(before), nullJSON(after), pq.Array(a.EvidenceIDs), a.RequestID, a.CorrelationID, meta, a.CreatedAt)
	return err
}

func (s *SQLStore) ListAudit(ctx context.Context, tenantID, entityType, entityID string) ([]AuditEvent, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, tenant_id, actor_type, actor_id, action, entity_type, entity_id,
			before_state, after_state, evidence_ids, request_id, correlation_id, created_at
		FROM finance_audit_events WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at ASC`,
		tenantID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditEvent
	for rows.Next() {
		var a AuditEvent
		var before, after []byte
		var ids pq.StringArray
		if err := rows.Scan(&a.ID, &a.TenantID, &a.ActorType, &a.ActorID, &a.Action, &a.EntityType, &a.EntityID,
			&before, &after, &ids, &a.RequestID, &a.CorrelationID, &a.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(before, &a.BeforeState)
		_ = json.Unmarshal(after, &a.AfterState)
		a.EvidenceIDs = []string(ids)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *SQLStore) UpsertPack(ctx context.Context, p Pack) (Pack, error) {
	doc, _ := json.Marshal(p.Document)
	var existing string
	err := s.DB.QueryRowContext(ctx, `
		INSERT INTO finance_evidence_packs (id, tenant_id, investigation_id, entity_type, entity_id, document, pack_hash, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (tenant_id, investigation_id) DO NOTHING
		RETURNING id`, p.ID, p.TenantID, p.InvestigationID, p.EntityType, p.EntityID, doc, p.PackHash, p.CreatedAt,
	).Scan(&existing)
	if errors.Is(err, sql.ErrNoRows) || existing == "" {
		got, ok, err := s.GetPackByInvestigation(ctx, p.TenantID, p.InvestigationID)
		if err != nil || ok {
			return got, err
		}
		return p, nil
	}
	return p, err
}

func (s *SQLStore) GetPackByInvestigation(ctx context.Context, tenantID, investigationID string) (Pack, bool, error) {
	var p Pack
	var doc []byte
	err := s.DB.QueryRowContext(ctx, `
		SELECT id, tenant_id, investigation_id, entity_type, entity_id, document, pack_hash, created_at
		FROM finance_evidence_packs WHERE tenant_id=$1 AND investigation_id=$2`, tenantID, investigationID,
	).Scan(&p.ID, &p.TenantID, &p.InvestigationID, &p.EntityType, &p.EntityID, &doc, &p.PackHash, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Pack{}, false, nil
	}
	if err != nil {
		return Pack{}, false, err
	}
	_ = json.Unmarshal(doc, &p.Document)
	return p, true, nil
}

func nullJSON(b []byte) any {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	return b
}
