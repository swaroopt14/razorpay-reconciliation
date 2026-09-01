package persistence

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

var _ poll.Store = (*SQLStore)(nil)

type SQLStore struct {
	db *sql.DB
}

func NewSQLStore(db *sql.DB) *SQLStore {
	return &SQLStore{db: db}
}

func (s *SQLStore) CreateJob(ctx context.Context, job poll.BackfillJob) (poll.BackfillJob, error) {
	if job.ID == "" {
		job.ID = uuid.Must(uuid.NewV7()).String()
	}
	now := time.Now().UTC()
	job.CreatedAt = now
	job.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO backfill_jobs (
			id, tenant_id, connector_id, provider, provider_mode, resource_type,
			window_from, window_to, trigger_type, status, requested_by, trace_id,
			created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		job.ID, job.TenantID, job.ConnectorID, job.Provider, job.ProviderMode, job.ResourceType,
		job.WindowFrom, job.WindowTo, job.TriggerType, job.Status, job.RequestedBy, job.TraceID,
		job.CreatedAt, job.UpdatedAt,
	)
	if err != nil {
		return job, err
	}
	return job, nil
}

func (s *SQLStore) FindActiveJob(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (*poll.BackfillJob, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, connector_id, provider, provider_mode, resource_type,
		       window_from, window_to, trigger_type, status, fetched_count, inserted_count,
		       updated_count, duplicate_count, missing_webhook_count, error_count,
		       COALESCE(last_error_code,''), COALESCE(last_error_message,''), trace_id, created_at, updated_at
		FROM backfill_jobs
		WHERE tenant_id=$1 AND connector_id=$2 AND resource_type=$3
		  AND window_from=$4 AND window_to=$5
		  AND status IN ('queued','running')
		ORDER BY created_at DESC
		LIMIT 1`, tenantID, connectorID, resourceType, from, to)
	job, err := scanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *SQLStore) GetJob(ctx context.Context, jobID string) (poll.BackfillJob, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, connector_id, provider, provider_mode, resource_type,
		       window_from, window_to, trigger_type, status, fetched_count, inserted_count,
		       updated_count, duplicate_count, missing_webhook_count, error_count,
		       COALESCE(last_error_code,''), COALESCE(last_error_message,''), trace_id, created_at, updated_at
		FROM backfill_jobs WHERE id=$1`, jobID)
	job, err := scanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return poll.BackfillJob{}, poll.ErrJobNotFound
	}
	return job, err
}

func scanJob(row *sql.Row) (poll.BackfillJob, error) {
	var job poll.BackfillJob
	err := row.Scan(
		&job.ID, &job.TenantID, &job.ConnectorID, &job.Provider, &job.ProviderMode, &job.ResourceType,
		&job.WindowFrom, &job.WindowTo, &job.TriggerType, &job.Status, &job.FetchedCount, &job.InsertedCount,
		&job.UpdatedCount, &job.DuplicateCount, &job.MissingWebhookCount, &job.ErrorCount,
		&job.LastErrorCode, &job.LastErrorMessage, &job.TraceID, &job.CreatedAt, &job.UpdatedAt,
	)
	return job, err
}

func (s *SQLStore) UpdateJob(ctx context.Context, job poll.BackfillJob) error {
	job.UpdatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		UPDATE backfill_jobs SET
			status=$2, started_at=$3, completed_at=$4,
			fetched_count=$5, inserted_count=$6, updated_count=$7, duplicate_count=$8,
			missing_webhook_count=$9, error_count=$10,
			last_error_code=NULLIF($11,''), last_error_message=NULLIF($12,''),
			updated_at=$13
		WHERE id=$1`,
		job.ID, job.Status, job.StartedAt, job.CompletedAt,
		job.FetchedCount, job.InsertedCount, job.UpdatedCount, job.DuplicateCount,
		job.MissingWebhookCount, job.ErrorCount,
		job.LastErrorCode, job.LastErrorMessage, job.UpdatedAt,
	)
	return err
}

func (s *SQLStore) EnsureCursor(ctx context.Context, c poll.BackfillCursor) (poll.BackfillCursor, error) {
	if c.ID == "" {
		c.ID = uuid.Must(uuid.NewV7()).String()
	}
	c.UpdatedAt = time.Now().UTC()
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO backfill_cursors (
			id, tenant_id, connector_id, resource_type, window_from, window_to,
			page_skip, page_count, pages_completed, status, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (tenant_id, connector_id, resource_type, window_from, window_to)
		DO UPDATE SET updated_at = backfill_cursors.updated_at
		RETURNING id, page_skip, page_count, pages_completed, COALESCE(last_provider_id,''),
		          COALESCE(last_response_hash,''), status, COALESCE(lease_owner,''), lease_expires_at, updated_at`,
		c.ID, c.TenantID, c.ConnectorID, c.ResourceType, c.WindowFrom, c.WindowTo,
		c.PageSkip, c.PageCount, c.PagesCompleted, c.Status, c.UpdatedAt,
	).Scan(&c.ID, &c.PageSkip, &c.PageCount, &c.PagesCompleted, &c.LastProviderID,
		&c.LastResponseHash, &c.Status, &c.LeaseOwner, &c.LeaseExpiresAt, &c.UpdatedAt)
	return c, err
}

func (s *SQLStore) GetCursor(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time) (poll.BackfillCursor, error) {
	var c poll.BackfillCursor
	err := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, connector_id, resource_type, window_from, window_to,
		       page_skip, page_count, pages_completed, COALESCE(last_provider_id,''),
		       COALESCE(last_response_hash,''), status, COALESCE(lease_owner,''), lease_expires_at, updated_at
		FROM backfill_cursors
		WHERE tenant_id=$1 AND connector_id=$2 AND resource_type=$3 AND window_from=$4 AND window_to=$5`,
		tenantID, connectorID, resourceType, from, to,
	).Scan(&c.ID, &c.TenantID, &c.ConnectorID, &c.ResourceType, &c.WindowFrom, &c.WindowTo,
		&c.PageSkip, &c.PageCount, &c.PagesCompleted, &c.LastProviderID,
		&c.LastResponseHash, &c.Status, &c.LeaseOwner, &c.LeaseExpiresAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return poll.BackfillCursor{}, poll.ErrJobNotFound
	}
	return c, err
}

func (s *SQLStore) AcquireCursorLease(ctx context.Context, tenantID, connectorID, resourceType string, from, to time.Time, owner string, ttl time.Duration) (poll.BackfillCursor, error) {
	now := time.Now().UTC()
	expires := now.Add(ttl)
	res, err := s.db.ExecContext(ctx, `
		UPDATE backfill_cursors SET
			lease_owner=$6, lease_expires_at=$7, updated_at=$8
		WHERE tenant_id=$1 AND connector_id=$2 AND resource_type=$3
		  AND window_from=$4 AND window_to=$5
		  AND status IN ('active','paused','complete')
		  AND (lease_expires_at IS NULL OR lease_expires_at < $8 OR lease_owner=$6)`,
		tenantID, connectorID, resourceType, from, to, owner, expires, now,
	)
	if err != nil {
		return poll.BackfillCursor{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return poll.BackfillCursor{}, poll.ErrCursorLeaseHeld
	}
	var c poll.BackfillCursor
	err = s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, connector_id, resource_type, window_from, window_to,
		       page_skip, page_count, pages_completed, COALESCE(last_provider_id,''),
		       COALESCE(last_response_hash,''), status, COALESCE(lease_owner,''), lease_expires_at, updated_at
		FROM backfill_cursors
		WHERE tenant_id=$1 AND connector_id=$2 AND resource_type=$3 AND window_from=$4 AND window_to=$5`,
		tenantID, connectorID, resourceType, from, to,
	).Scan(&c.ID, &c.TenantID, &c.ConnectorID, &c.ResourceType, &c.WindowFrom, &c.WindowTo,
		&c.PageSkip, &c.PageCount, &c.PagesCompleted, &c.LastProviderID,
		&c.LastResponseHash, &c.Status, &c.LeaseOwner, &c.LeaseExpiresAt, &c.UpdatedAt)
	return c, err
}

func (s *SQLStore) AdvanceCursor(ctx context.Context, c poll.BackfillCursor) error {
	c.UpdatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		UPDATE backfill_cursors SET
			page_skip=$2, pages_completed=$3, last_provider_id=NULLIF($4,''),
			last_response_hash=NULLIF($5,''), status=$6, lease_expires_at=$7, updated_at=$8
		WHERE id=$1`,
		c.ID, c.PageSkip, c.PagesCompleted, c.LastProviderID, c.LastResponseHash,
		c.Status, c.LeaseExpiresAt, c.UpdatedAt,
	)
	return err
}

func (s *SQLStore) ReleaseCursorLease(ctx context.Context, cursorID, owner string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE backfill_cursors SET lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
		WHERE id=$1 AND lease_owner=$2`, cursorID, owner)
	return err
}

func (s *SQLStore) InsertResponseReceipt(ctx context.Context, rec poll.ResponseReceipt) error {
	if rec.ID == "" {
		rec.ID = uuid.Must(uuid.NewV7()).String()
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO provider_response_receipts (
			id, tenant_id, connector_id, backfill_job_id, provider, resource_type,
			request_path, request_query_hash, response_status, response_hash,
			page_skip, page_count, provider_item_count
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (backfill_job_id, request_path, request_query_hash) DO NOTHING`,
		rec.ID, rec.TenantID, rec.ConnectorID, rec.BackfillJobID, rec.Provider, rec.ResourceType,
		rec.RequestPath, rec.RequestQueryHash, rec.ResponseStatus, rec.ResponseHash,
		rec.PageSkip, rec.PageCount, rec.ProviderItemCount,
	)
	return err
}

func (s *SQLStore) UpsertPayment(ctx context.Context, obs poll.PaymentObservation) (poll.UpsertResult, error) {
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	var existingHash sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT payload_hash FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
		obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
	).Scan(&existingHash)
	now := time.Now().UTC()
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO provider_payment_observations (
				id, tenant_id, connector_id, provider, provider_mode, payment_id, order_id,
				amount_minor, currency, status, captured, fee_minor, tax_minor,
				provider_created_at, payload_hash, source, last_response_receipt_id, observed_at, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
			obs.ID, obs.TenantID, obs.ConnectorID, obs.Provider, obs.ProviderMode, obs.Item.PaymentID, nullIfEmpty(obs.Item.OrderID),
			obs.Item.AmountMinor, obs.Item.Currency, obs.Item.Status, obs.Item.Captured, obs.Item.FeeMinor, obs.Item.TaxMinor,
			obs.Item.CreatedAt, obs.Item.PayloadHash, obs.Source, nullIfEmpty(obs.ReceiptID), now, now, now,
		)
		if err != nil {
			return "", err
		}
		return poll.UpsertInserted, nil
	}
	if err != nil {
		return "", err
	}
	if existingHash.String == obs.Item.PayloadHash {
		return poll.UpsertDuplicate, nil
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE provider_payment_observations SET
			order_id=$4, amount_minor=$5, currency=$6, status=$7, captured=$8,
			fee_minor=$9, tax_minor=$10, provider_created_at=$11, payload_hash=$12,
			last_response_receipt_id=$13, observed_at=$14, updated_at=$14
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
		obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
		nullIfEmpty(obs.Item.OrderID), obs.Item.AmountMinor, obs.Item.Currency, obs.Item.Status, obs.Item.Captured,
		obs.Item.FeeMinor, obs.Item.TaxMinor, obs.Item.CreatedAt, obs.Item.PayloadHash,
		nullIfEmpty(obs.ReceiptID), now,
	)
	if err != nil {
		return "", err
	}
	return poll.UpsertUpdated, nil
}

func (s *SQLStore) UpsertSettlementLine(ctx context.Context, obs poll.SettlementLineObservation) (poll.UpsertResult, error) {
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	var existingHash sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT payload_hash FROM provider_settlement_line_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND settlement_id=$3 AND entity_id=$4`,
		obs.TenantID, obs.ConnectorID, obs.Item.SettlementID, obs.Item.EntityID,
	).Scan(&existingHash)
	now := time.Now().UTC()
	var settledAt any
	if !obs.Item.SettledAt.IsZero() {
		settledAt = obs.Item.SettledAt
	}
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO provider_settlement_line_observations (
				id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
				payment_id, order_id, amount_minor, debit_minor, credit_minor, fee_minor, tax_minor,
				currency, settlement_utr, settled, settled_at, payload_hash, source, last_response_receipt_id,
				observed_at, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
			obs.ID, obs.TenantID, obs.ConnectorID, obs.Provider, obs.ProviderMode, obs.Item.SettlementID, obs.Item.EntityID, obs.Item.LineType,
			nullIfEmpty(obs.Item.PaymentID), nullIfEmpty(obs.Item.OrderID), obs.Item.AmountMinor, obs.Item.DebitMinor, obs.Item.CreditMinor, obs.Item.FeeMinor, obs.Item.TaxMinor,
			obs.Item.Currency, nullIfEmpty(obs.Item.UTR), obs.Item.Settled, settledAt, obs.Item.PayloadHash, obs.Source, nullIfEmpty(obs.ReceiptID),
			now, now, now,
		)
		if err != nil {
			return "", err
		}
		return poll.UpsertInserted, nil
	}
	if err != nil {
		return "", err
	}
	if existingHash.String == obs.Item.PayloadHash {
		return poll.UpsertDuplicate, nil
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE provider_settlement_line_observations SET
			line_type=$5, payment_id=$6, order_id=$7, amount_minor=$8, debit_minor=$9, credit_minor=$10,
			fee_minor=$11, tax_minor=$12, currency=$13, settlement_utr=$14, settled=$15, settled_at=$16,
			payload_hash=$17, last_response_receipt_id=$18, observed_at=$19, updated_at=$19
		WHERE tenant_id=$1 AND connector_id=$2 AND settlement_id=$3 AND entity_id=$4`,
		obs.TenantID, obs.ConnectorID, obs.Item.SettlementID, obs.Item.EntityID,
		obs.Item.LineType, nullIfEmpty(obs.Item.PaymentID), nullIfEmpty(obs.Item.OrderID),
		obs.Item.AmountMinor, obs.Item.DebitMinor, obs.Item.CreditMinor,
		obs.Item.FeeMinor, obs.Item.TaxMinor, obs.Item.Currency, nullIfEmpty(obs.Item.UTR),
		obs.Item.Settled, settledAt, obs.Item.PayloadHash, nullIfEmpty(obs.ReceiptID), now,
	)
	if err != nil {
		return "", err
	}
	return poll.UpsertUpdated, nil
}

func (s *SQLStore) ListPaymentIDsInWindow(ctx context.Context, tenantID, connectorID string, from, to time.Time) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT payment_id FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2
		  AND ((provider_created_at >= $3 AND provider_created_at < $4)
		       OR (observed_at >= $3 AND observed_at < $4))`,
		tenantID, connectorID, from, to,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *SQLStore) GetPaymentHash(ctx context.Context, tenantID, connectorID, paymentID string) (string, bool, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `
		SELECT payload_hash FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
		tenantID, connectorID, paymentID,
	).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return hash, true, nil
}

func (s *SQLStore) InsertOutbox(ctx context.Context, row models.OutboxRow) error {
	if row.EventID == uuid.Nil {
		row.EventID = uuid.Must(uuid.NewV7())
	}
	if row.CreatedAt.IsZero() {
		row.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, aggregate_type, aggregate_id,
			event_type, schema_version, payload, status, retry_count, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',0,$9)`,
		row.EventID, row.TenantID, row.TraceID, row.AggregateType, row.AggregateID,
		row.EventType, models.SchemaVersionV1, row.Payload, row.CreatedAt,
	)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
