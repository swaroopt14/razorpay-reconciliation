package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"zord-outcome-engine/internal/imports"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

var _ imports.Store = (*ImportSQLStore)(nil)

type ImportSQLStore struct {
	db *sql.DB
}

func NewImportSQLStore(db *sql.DB) *ImportSQLStore {
	return &ImportSQLStore{db: db}
}

func (s *ImportSQLStore) Create(ctx context.Context, imp imports.Import) (imports.Import, error) {
	if imp.ID == "" {
		imp.ID = uuid.Must(uuid.NewV7()).String()
	}
	cols, _ := json.Marshal(imp.DetectedColumns)
	mapping, _ := json.Marshal(imp.SelectedMapping)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO data_imports (
			id, tenant_id, connector_id, account_id, import_type, source_type, provider_mode,
			file_name, content_type, file_size_bytes, file_sha256, storage_uri, payload, currency, status,
			detected_columns, selected_mapping, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),now())`,
		imp.ID, imp.TenantID, nullIfEmpty(imp.ConnectorID), nullIfEmpty(imp.AccountID), imp.ImportType, imp.SourceType, imp.ProviderMode,
		imp.FileName, imp.ContentType, imp.FileSizeBytes, imp.FileSHA256, nullIfEmpty(imp.StorageURI), imp.Payload, nullIfEmpty(imp.Currency), imp.Status,
		cols, mapping,
	)
	if err != nil {
		return imports.Import{}, err
	}
	return imp, nil
}

func (s *ImportSQLStore) Get(ctx context.Context, tenantID, id string) (imports.Import, error) {
	return s.scanImport(ctx, `SELECT `+importCols+` FROM data_imports WHERE tenant_id=$1 AND id=$2`, tenantID, id)
}

func (s *ImportSQLStore) GetByHash(ctx context.Context, tenantID, importType, hash string) (imports.Import, error) {
	imp, err := s.scanImport(ctx, `SELECT `+importCols+` FROM data_imports WHERE tenant_id=$1 AND import_type=$2 AND file_sha256=$3`, tenantID, importType, hash)
	if err != nil {
		return imports.Import{}, err
	}
	return imp, nil
}

const importCols = `id::text, tenant_id::text, COALESCE(connector_id::text,''), COALESCE(account_id,''), import_type, source_type, provider_mode,
		file_name, content_type, file_size_bytes, file_sha256, COALESCE(storage_uri,''), payload, COALESCE(currency,''), status,
		detected_columns, selected_mapping, rows_seen, valid_rows, invalid_rows, duplicate_rows, inserted_rows, updated_rows, rejected_rows,
		created_at, COALESCE(validated_at, 'epoch'::timestamptz), COALESCE(committed_at, 'epoch'::timestamptz)`

func (s *ImportSQLStore) scanImport(ctx context.Context, q string, args ...any) (imports.Import, error) {
	var imp imports.Import
	var payload []byte
	var detected, mapping []byte
	var created, validated, committed time.Time
	err := s.db.QueryRowContext(ctx, q, args...).Scan(
		&imp.ID, &imp.TenantID, &imp.ConnectorID, &imp.AccountID, &imp.ImportType, &imp.SourceType, &imp.ProviderMode,
		&imp.FileName, &imp.ContentType, &imp.FileSizeBytes, &imp.FileSHA256, &imp.StorageURI, &payload, &imp.Currency, &imp.Status,
		&detected, &mapping, &imp.RowsSeen, &imp.ValidRows, &imp.InvalidRows, &imp.DuplicateRows, &imp.InsertedRows, &imp.UpdatedRows, &imp.RejectedRows,
		&created, &validated, &committed,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return imports.Import{}, imports.ErrNotFound
	}
	if err != nil {
		return imports.Import{}, err
	}
	imp.Payload = payload
	imp.CreatedAt = created
	if !validated.Equal(time.Unix(0, 0).UTC()) && validated.Year() > 1970 {
		imp.ValidatedAt = validated
	}
	if committed.Year() > 1970 {
		imp.CommittedAt = committed
	}
	_ = json.Unmarshal(detected, &imp.DetectedColumns)
	_ = json.Unmarshal(mapping, &imp.SelectedMapping)
	return imp, nil
}

func (s *ImportSQLStore) Save(ctx context.Context, imp imports.Import) error {
	cols, _ := json.Marshal(imp.DetectedColumns)
	mapping, _ := json.Marshal(imp.SelectedMapping)
	var validated, committed any
	if !imp.ValidatedAt.IsZero() {
		validated = imp.ValidatedAt
	}
	if !imp.CommittedAt.IsZero() {
		committed = imp.CommittedAt
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE data_imports SET
			status=$3, currency=$4, detected_columns=$5, selected_mapping=$6,
			rows_seen=$7, valid_rows=$8, invalid_rows=$9, duplicate_rows=$10,
			inserted_rows=$11, updated_rows=$12, rejected_rows=$13,
			validated_at=$14, committed_at=$15, updated_at=now()
		WHERE tenant_id=$1 AND id=$2`,
		imp.TenantID, imp.ID, imp.Status, nullIfEmpty(imp.Currency), cols, mapping,
		imp.RowsSeen, imp.ValidRows, imp.InvalidRows, imp.DuplicateRows,
		imp.InsertedRows, imp.UpdatedRows, imp.RejectedRows, validated, committed,
	)
	return err
}

func (s *ImportSQLStore) ReplaceRows(ctx context.Context, importID string, rows []imports.RowResult) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM import_row_results WHERE import_id=$1`, importID); err != nil {
		return err
	}
	for _, r := range rows {
		id := r.ID
		if id == "" {
			id = uuid.Must(uuid.NewV7()).String()
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO import_row_results (id, import_id, row_number, row_hash, status, error_code, error_message, raw_row)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			id, importID, r.RowNumber, r.RowHash, r.Status, nullIfEmpty(r.ErrorCode), nullIfEmpty(r.ErrorMessage), imports.RedactRaw(r.Raw),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ImportSQLStore) ListRows(ctx context.Context, importID string) ([]imports.RowResult, error) {
	qrows, err := s.db.QueryContext(ctx, `
		SELECT id::text, row_number, row_hash, status, COALESCE(error_code,''), COALESCE(error_message,''), raw_row
		FROM import_row_results WHERE import_id=$1 ORDER BY row_number`, importID)
	if err != nil {
		return nil, err
	}
	defer qrows.Close()
	var out []imports.RowResult
	for qrows.Next() {
		var r imports.RowResult
		if err := qrows.Scan(&r.ID, &r.RowNumber, &r.RowHash, &r.Status, &r.ErrorCode, &r.ErrorMessage, &r.Raw); err != nil {
			return nil, err
		}
		r.ImportID = importID
		out = append(out, r)
	}
	return out, qrows.Err()
}

func (s *ImportSQLStore) Commit(ctx context.Context, imp imports.Import, rows []imports.RowResult, events []models.OutboxRow) (imports.Import, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return imports.Import{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM data_imports WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, imp.TenantID, imp.ID).Scan(&status); err != nil {
		return imports.Import{}, err
	}
	if status == imports.StatusCommitted {
		_ = tx.Rollback()
		return s.Get(ctx, imp.TenantID, imp.ID)
	}

	var inserted, updated int64
	now := time.Now().UTC()
	for _, r := range rows {
		if r.Status != imports.RowValid && r.Status != imports.RowAcceptedWithoutValidUTR && r.Status != imports.RowInserted {
			continue
		}
		if r.Settlement != nil {
			res, err := s.upsertSettlement(ctx, tx, imp, r)
			if err != nil {
				return imports.Import{}, err
			}
			if res == "inserted" {
				inserted++
			} else if res == "updated" {
				updated++
			}
		}
		if r.Bank != nil {
			res, err := s.upsertBank(ctx, tx, imp, r)
			if err != nil {
				return imports.Import{}, err
			}
			if res == "inserted" {
				inserted++
			}
		}
	}
	for _, ev := range events {
		if ev.EventID == uuid.Nil {
			ev.EventID = uuid.Must(uuid.NewV7())
		}
		if ev.CreatedAt.IsZero() {
			ev.CreatedAt = now
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO outcome_outbox (
				event_id, tenant_id, trace_id, aggregate_type, aggregate_id,
				event_type, schema_version, payload, status, retry_count, created_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',0,$9)`,
			ev.EventID, ev.TenantID, ev.TraceID, ev.AggregateType, ev.AggregateID,
			ev.EventType, models.SchemaVersionV1, ev.Payload, ev.CreatedAt,
		); err != nil {
			return imports.Import{}, err
		}
	}
	imp.InsertedRows = inserted
	imp.UpdatedRows = updated
	imp.RejectedRows = imp.InvalidRows
	imp.CommittedAt = now
	imp.Status = imports.StatusCommitted
	if imp.InvalidRows > 0 {
		imp.Status = imports.StatusPartial
	}
	if err := s.saveTx(ctx, tx, imp); err != nil {
		return imports.Import{}, err
	}
	if err := tx.Commit(); err != nil {
		return imports.Import{}, err
	}
	return imp, nil
}

func (s *ImportSQLStore) saveTx(ctx context.Context, tx *sql.Tx, imp imports.Import) error {
	cols, _ := json.Marshal(imp.DetectedColumns)
	mapping, _ := json.Marshal(imp.SelectedMapping)
	_, err := tx.ExecContext(ctx, `
		UPDATE data_imports SET
			status=$3, inserted_rows=$4, updated_rows=$5, rejected_rows=$6, committed_at=$7, updated_at=now(),
			detected_columns=$8, selected_mapping=$9
		WHERE tenant_id=$1 AND id=$2`,
		imp.TenantID, imp.ID, imp.Status, imp.InsertedRows, imp.UpdatedRows, imp.RejectedRows, imp.CommittedAt, cols, mapping,
	)
	return err
}

func (s *ImportSQLStore) upsertSettlement(ctx context.Context, tx *sql.Tx, imp imports.Import, r imports.RowResult) (string, error) {
	line := r.Settlement
	id := uuid.Must(uuid.NewV7()).String()
	var settledAt any
	if !line.SettledAt.IsZero() {
		settledAt = line.SettledAt
	}
	tag, err := tx.ExecContext(ctx, `
		INSERT INTO provider_settlement_line_observations (
			id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
			payment_id, order_id, refund_id, amount_minor, debit_minor, credit_minor, fee_minor, tax_minor,
			currency, settlement_utr, settled, settled_at, payload_hash, source, import_id, raw_record,
			observed_at, created_at, updated_at
		) VALUES ($1,$2,$3,'razorpay',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'settlement_file',$21,$22,now(),now(),now())
		ON CONFLICT (tenant_id, connector_id, settlement_id, entity_id) DO UPDATE SET
			line_type=EXCLUDED.line_type, payment_id=EXCLUDED.payment_id, refund_id=EXCLUDED.refund_id,
			amount_minor=EXCLUDED.amount_minor, debit_minor=EXCLUDED.debit_minor, credit_minor=EXCLUDED.credit_minor,
			fee_minor=EXCLUDED.fee_minor, tax_minor=EXCLUDED.tax_minor, currency=EXCLUDED.currency,
			settlement_utr=EXCLUDED.settlement_utr, settled=EXCLUDED.settled, settled_at=EXCLUDED.settled_at,
			payload_hash=EXCLUDED.payload_hash, import_id=EXCLUDED.import_id, raw_record=EXCLUDED.raw_record, updated_at=now()`,
		id, imp.TenantID, imp.ConnectorID, imp.ProviderMode, line.SettlementID, line.EntityID, line.LineType,
		nullIfEmpty(line.PaymentID), nullIfEmpty(line.OrderID), nullIfEmpty(line.RefundID),
		line.AmountMinor, line.DebitMinor, line.CreditMinor, line.FeeMinor, line.TaxMinor,
		line.Currency, nullIfEmpty(line.UTR), line.Settled, settledAt, line.PayloadHash, nullIfEmpty(imp.ID), line.Raw,
	)
	if err != nil {
		return "", err
	}
	n, _ := tag.RowsAffected()
	if n == 1 {
		return "inserted", nil
	}
	return "updated", nil
}

func (s *ImportSQLStore) upsertBank(ctx context.Context, tx *sql.Tx, imp imports.Import, r imports.RowResult) (string, error) {
	b := r.Bank
	id := uuid.Must(uuid.NewV7()).String()
	var vd any
	if !b.ValueDate.IsZero() {
		vd = b.ValueDate
	}
	tag, err := tx.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, bank_transaction_id, value_date, description,
			normalized_description, credit_minor, debit_minor, currency, utr, reference_number,
			source, row_hash, upload_id, import_id, source_row_number, raw_row
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'bank_csv',$14,$15,$16,$17,$18)
		ON CONFLICT (tenant_id, account_id, row_hash) DO NOTHING`,
		id, imp.TenantID, imp.ConnectorID, b.AccountID, nullIfEmpty(b.BankTransactionID), vd, b.Description,
		b.NormalizedDescription, b.CreditMinor, b.DebitMinor, b.Currency, nullIfEmpty(b.UTR), nullIfEmpty(b.ReferenceNumber),
		b.RowHash, nullIfEmpty(imp.ID), nullIfEmpty(imp.ID), b.SourceRowNumber, b.Raw,
	)
	if err != nil {
		return "", err
	}
	n, _ := tag.RowsAffected()
	if n == 0 {
		return "duplicate", nil
	}
	return "inserted", nil
}
