package persistence

import (
	"context"
	"database/sql"
	"strconv"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

// DLQRepository defines how DLQ entries are persisted
type DLQRepository interface {
	Save(ctx context.Context, entry models.DLQEntry) (models.DLQEntry, error)
	ListAll(ctx context.Context) ([]models.DLQEntry, error)
	ListByTenant(ctx context.Context, tenantID string) ([]models.DLQEntry, error)
	GetByTenantAndID(ctx context.Context, tenantID, dlqID string) (*models.DLQEntry, error)
	GetByID(ctx context.Context, dlqID string) (*models.DLQEntry, error)
	ListManualReview(ctx context.Context, tenantID string) ([]models.DLQEntry, error)
	CountTerminal(ctx context.Context, tenantID string) (int, error)
}

// Concrete Postgres implementation
type DLQPostgresRepo struct {
	db *sql.DB
}

// Constructor (returns interface, not pointer-to-interface)
func NewDLQRepo(db *sql.DB) DLQRepository {
	return &DLQPostgresRepo{db: db}
}

// Compile-time guarantee that implementation matches interface
var _ DLQRepository = (*DLQPostgresRepo)(nil)

func (r *DLQPostgresRepo) Save(
	ctx context.Context,
	entry models.DLQEntry,
) (models.DLQEntry, error) {

	entry.DLQID = uuid.NewString()

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO dlq_items (
			dlq_id, tenant_id, envelope_id,
			stage, reason_code, error_detail,
			replayable, client_batch_ref, created_at, batch_id,
			source_row_num, dlq_status, intent_context, trace_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	`,
		entry.DLQID,
		entry.TenantID,
		entry.EnvelopeID,
		entry.Stage,
		entry.ReasonCode,
		entry.ErrorDetail,
		entry.Replayable,
		entry.ClientBatchRef,
		entry.CreatedAt,
		entry.BatchID,
		entry.SourceRowNum,
		entry.DLQStatus,
		entry.IntentContext,
		entry.TraceID,
	)

	return entry, err
}

func (r *DLQPostgresRepo) List(
	ctx context.Context,
	tenantID string,
	stage *string,
	limit int,
	offset int,
) ([]models.DLQEntry, error) {

	query := `
		SELECT dlq_id, tenant_id, envelope_id,
		       stage, reason_code, error_detail,
		       replayable, client_batch_ref, created_at,
		       source_row_num, dlq_status, intent_context, trace_id
		FROM dlq_items
		WHERE tenant_id = $1
	`
	args := []any{tenantID}
	argPos := 2

	if stage != nil {
		query += " AND stage = $" + strconv.Itoa(argPos)
		args = append(args, *stage)
		argPos++
	}

	query += `
		ORDER BY created_at DESC
		LIMIT $` + strconv.Itoa(argPos) + `
		OFFSET $` + strconv.Itoa(argPos+1)

	args = append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.DLQEntry

	for rows.Next() {
		var e models.DLQEntry
		err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.SourceRowNum,
			&e.DLQStatus,
			&e.IntentContext,
			&e.TraceID,
		)
		if err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}

	return entries, nil
}

func (r *DLQPostgresRepo) ListByTenant(
	ctx context.Context,
	tenantID string,
) ([]models.DLQEntry, error) {

	// default behavior for simple consumers
	const defaultLimit = 50
	const defaultOffset = 0

	return r.List(
		ctx,
		tenantID,
		nil, // no stage filter
		defaultLimit,
		defaultOffset,
	)
}

func (r *DLQPostgresRepo) ListAll(
	ctx context.Context,
) ([]models.DLQEntry, error) {

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			dlq_id,
			tenant_id,
			envelope_id,
			stage,
			reason_code,
			error_detail,
			replayable,
			client_batch_ref,
			created_at,
			source_row_num,
			dlq_status,
			intent_context,
			trace_id
		FROM dlq_items
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.DLQEntry

	for rows.Next() {
		var e models.DLQEntry
		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.SourceRowNum,
			&e.DLQStatus,
			&e.IntentContext,
			&e.TraceID,
		); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}

	return entries, nil
}
func (r *DLQPostgresRepo) ListManualReview(
	ctx context.Context,
	tenantID string,
) ([]models.DLQEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			dlq_id, tenant_id, envelope_id, stage, reason_code, error_detail,
			replayable, client_batch_ref, created_at, source_row_num,
			dlq_status, intent_context, trace_id
		FROM dlq_items
		WHERE tenant_id = $1
		  AND dlq_status = 'NEEDS_MANUAL_REVIEW'
		ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.DLQEntry

	for rows.Next() {
		var e models.DLQEntry
		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.SourceRowNum,
			&e.DLQStatus,
			&e.IntentContext,
			&e.TraceID,
		); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}

	return entries, nil
}
func (r *DLQPostgresRepo) CountTerminal(
	ctx context.Context,
	tenantID string,
) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM dlq_items
		WHERE tenant_id = $1
		  AND dlq_status = 'DLQ_TERMINAL'
	`, tenantID).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}
func (r *DLQPostgresRepo) GetByTenantAndID(
	ctx context.Context,
	tenantID string,
	dlqID string,
) (*models.DLQEntry, error) {

	var e models.DLQEntry

	err := r.db.QueryRowContext(ctx, `
		SELECT
			dlq_id,
			tenant_id,
			envelope_id,
			stage,
			reason_code,
			error_detail,
			replayable,
			client_batch_ref,
			created_at,
			source_row_num,
			dlq_status,
			intent_context,
			trace_id
		FROM dlq_items
		WHERE tenant_id = $1
		  AND dlq_id = $2
	`,
		tenantID,
		dlqID,
	).Scan(
		&e.DLQID,
		&e.TenantID,
		&e.EnvelopeID,
		&e.Stage,
		&e.ReasonCode,
		&e.ErrorDetail,
		&e.Replayable,
		&e.ClientBatchRef,
		&e.CreatedAt,
		&e.SourceRowNum,
		&e.DLQStatus,
		&e.IntentContext,
		&e.TraceID,
	)

	if err == sql.ErrNoRows {
		return nil, nil // frontend can show "not found"
	}
	if err != nil {
		return nil, err
	}

	return &e, nil
}

// NEW: GetByID fetches a single DLQ entry by primary key (no tenant required)
// Used by the /v1/dlq/:dlq_id endpoint for the console frontend
func (r *DLQPostgresRepo) GetByID(
	ctx context.Context,
	dlqID string,
) (*models.DLQEntry, error) {

	var e models.DLQEntry

	err := r.db.QueryRowContext(ctx, `
		SELECT
			dlq_id,
			tenant_id,
			envelope_id,
			stage,
			reason_code,
			error_detail,
			replayable,
			client_batch_ref,
			created_at,
			source_row_num,
			dlq_status,
			intent_context,
			trace_id
		FROM dlq_items
		WHERE dlq_id = $1
	`, dlqID).Scan(
		&e.DLQID,
		&e.TenantID,
		&e.EnvelopeID,
		&e.Stage,
		&e.ReasonCode,
		&e.ErrorDetail,
		&e.Replayable,
		&e.ClientBatchRef,
		&e.CreatedAt,
		&e.SourceRowNum,
		&e.DLQStatus,
		&e.IntentContext,
		&e.TraceID,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &e, nil
}
