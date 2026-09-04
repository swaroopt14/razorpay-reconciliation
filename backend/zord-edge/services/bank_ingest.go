package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	BankIngestReceived  = "RECEIVED"
	BankIngestDuplicate = "DUPLICATE"
	BankIngestFailed    = "FAILED"
	BankIngestAccepted  = "ACCEPTED"
)

type BankIngestRun struct {
	IngestID    uuid.UUID
	TenantID    uuid.UUID
	ConnectorID *uuid.UUID
	AccountID   string
	Filename    string
	FileSHA256  string
	StorageURI  string
	Status      string
	Profile     string
	Currency    string
	CreatedAt   time.Time
}

type BankStatementEvent struct {
	IngestID    string `json:"ingest_id"`
	FileSHA256  string `json:"file_sha256"`
	StorageURI  string `json:"storage_uri"`
	TenantID    string `json:"tenant_id"`
	ConnectorID string `json:"connector_id,omitempty"`
	AccountID   string `json:"account_id"`
	Filename    string `json:"filename"`
	Profile     string `json:"profile,omitempty"`
	Currency    string `json:"currency,omitempty"`
}

type BankIngestStore interface {
	FindLatestByHash(ctx context.Context, tenantID uuid.UUID, hash string) (*BankIngestRun, error)
	Insert(ctx context.Context, run BankIngestRun, emitOutbox bool) error
	Get(ctx context.Context, tenantID, ingestID uuid.UUID) (*BankIngestRun, error)
}

type MemoryBankIngestStore struct {
	Runs   []BankIngestRun
	Outbox []BankStatementEvent
}

func NewMemoryBankIngestStore() *MemoryBankIngestStore {
	return &MemoryBankIngestStore{}
}

func (m *MemoryBankIngestStore) FindLatestByHash(_ context.Context, tenantID uuid.UUID, hash string) (*BankIngestRun, error) {
	var found *BankIngestRun
	for i := range m.Runs {
		r := m.Runs[i]
		if r.TenantID == tenantID && r.FileSHA256 == hash {
			cp := r
			found = &cp
		}
	}
	return found, nil
}

func (m *MemoryBankIngestStore) Insert(_ context.Context, run BankIngestRun, emitOutbox bool) error {
	m.Runs = append(m.Runs, run)
	if emitOutbox {
		ev := BankStatementEvent{
			IngestID:   run.IngestID.String(),
			FileSHA256: run.FileSHA256,
			StorageURI: run.StorageURI,
			TenantID:   run.TenantID.String(),
			AccountID:  run.AccountID,
			Filename:   run.Filename,
			Profile:    run.Profile,
			Currency:   run.Currency,
		}
		if run.ConnectorID != nil {
			ev.ConnectorID = run.ConnectorID.String()
		}
		m.Outbox = append(m.Outbox, ev)
	}
	return nil
}

func (m *MemoryBankIngestStore) Get(_ context.Context, tenantID, ingestID uuid.UUID) (*BankIngestRun, error) {
	for i := range m.Runs {
		if m.Runs[i].TenantID == tenantID && m.Runs[i].IngestID == ingestID {
			cp := m.Runs[i]
			return &cp, nil
		}
	}
	return nil, sql.ErrNoRows
}

type SQLBankIngestStore struct {
	DB *sql.DB
}

func NewSQLBankIngestStore(db *sql.DB) *SQLBankIngestStore {
	return &SQLBankIngestStore{DB: db}
}

func (s *SQLBankIngestStore) FindLatestByHash(ctx context.Context, tenantID uuid.UUID, hash string) (*BankIngestRun, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT ingest_id, tenant_id, connector_id, account_id, filename, file_sha256, storage_uri, status, COALESCE(profile,''), COALESCE(currency,''), created_at
		FROM bank_ingest_runs
		WHERE tenant_id=$1 AND file_sha256=$2
		ORDER BY created_at DESC
		LIMIT 1`, tenantID, hash)
	return scanBankIngestRun(row)
}

func (s *SQLBankIngestStore) Get(ctx context.Context, tenantID, ingestID uuid.UUID) (*BankIngestRun, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT ingest_id, tenant_id, connector_id, account_id, filename, file_sha256, storage_uri, status, COALESCE(profile,''), COALESCE(currency,''), created_at
		FROM bank_ingest_runs
		WHERE tenant_id=$1 AND ingest_id=$2`, tenantID, ingestID)
	return scanBankIngestRun(row)
}

func scanBankIngestRun(row *sql.Row) (*BankIngestRun, error) {
	var r BankIngestRun
	var connector sql.NullString
	if err := row.Scan(&r.IngestID, &r.TenantID, &connector, &r.AccountID, &r.Filename, &r.FileSHA256, &r.StorageURI, &r.Status, &r.Profile, &r.Currency, &r.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if connector.Valid {
		id, err := uuid.Parse(connector.String)
		if err == nil {
			r.ConnectorID = &id
		}
	}
	return &r, nil
}

func (s *SQLBankIngestStore) Insert(ctx context.Context, run BankIngestRun, emitOutbox bool) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var connector any
	if run.ConnectorID != nil {
		connector = *run.ConnectorID
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO bank_ingest_runs (
			ingest_id, tenant_id, connector_id, account_id, filename, file_sha256, storage_uri, status, profile, currency, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`,
		run.IngestID, run.TenantID, connector, run.AccountID, run.Filename, run.FileSHA256, run.StorageURI, run.Status, nullEmpty(run.Profile), nullEmpty(run.Currency),
	); err != nil {
		return err
	}
	if emitOutbox {
		if err := insertBankStatementOutbox(ctx, tx, run); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func insertBankStatementOutbox(ctx context.Context, tx *sql.Tx, run BankIngestRun) error {
	ev := BankStatementEvent{
		IngestID:   run.IngestID.String(),
		FileSHA256: run.FileSHA256,
		StorageURI: run.StorageURI,
		TenantID:   run.TenantID.String(),
		AccountID:  run.AccountID,
		Filename:   run.Filename,
		Profile:    run.Profile,
		Currency:   run.Currency,
	}
	if run.ConnectorID != nil {
		ev.ConnectorID = run.ConnectorID.String()
	}
	payload, _ := json.Marshal(ev)
	now := time.Now().UTC()
	_, err := tx.ExecContext(ctx, `
		INSERT INTO ingress_outbox (
			trace_id, envelope_id, tenant_id, artifact_id, artifact_version_id,
			object_ref, received_at, ingress_channel, source,
			idempotency_key, encrypted_payload, payload_hash,
			raw_row_hash, envelope_hash, envelope_signature,
			content_type, kms_key_version, encryption_key_id,
			topic, status, event_type, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now())`,
		uuid.Must(uuid.NewV7()),
		uuid.Must(uuid.NewV7()).String(),
		run.TenantID,
		uuid.Must(uuid.NewV7()).String(),
		uuid.Must(uuid.NewV7()).String(),
		run.StorageURI,
		now,
		"bank-statement",
		"bank.statement.received",
		run.IngestID.String(),
		payload,
		run.FileSHA256,
		run.FileSHA256,
		run.FileSHA256,
		[]byte{},
		"application/json",
		"",
		"",
		"payments.bank.events.v1",
		"PENDING",
		"bank.statement.received",
	)
	return err
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
