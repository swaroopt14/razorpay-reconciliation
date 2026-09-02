package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

var _ poll.Store = (*SQLStore)(nil)

type SQLStore struct {
	db *sql.DB
}

func NewSQLStore(db *sql.DB) *SQLStore {
	return &SQLStore{db: db}
}

type txKey struct{}

type dbRunner interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func (s *SQLStore) runner(ctx context.Context) dbRunner {
	if tx, ok := ctx.Value(txKey{}).(*sql.Tx); ok && tx != nil {
		return tx
	}
	return s.db
}

func (s *SQLStore) RunInTx(ctx context.Context, fn func(context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(*sql.Tx); ok {
		return fn(ctx)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

func (s *SQLStore) CreateJob(ctx context.Context, job poll.BackfillJob) (poll.BackfillJob, error) {
	if job.ID == "" {
		job.ID = uuid.Must(uuid.NewV7()).String()
	}
	now := time.Now().UTC()
	job.CreatedAt = now
	job.UpdatedAt = now
	_, err := s.runner(ctx).ExecContext(ctx, `
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
	row := s.runner(ctx).QueryRowContext(ctx, `
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
	row := s.runner(ctx).QueryRowContext(ctx, `
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
	_, err := s.runner(ctx).ExecContext(ctx, `
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
	err := s.runner(ctx).QueryRowContext(ctx, `
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
	err := s.runner(ctx).QueryRowContext(ctx, `
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
	res, err := s.runner(ctx).ExecContext(ctx, `
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
	err = s.runner(ctx).QueryRowContext(ctx, `
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
	_, err := s.runner(ctx).ExecContext(ctx, `
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
	_, err := s.runner(ctx).ExecContext(ctx, `
		UPDATE backfill_cursors SET lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
		WHERE id=$1 AND lease_owner=$2`, cursorID, owner)
	return err
}

func (s *SQLStore) InsertResponseReceipt(ctx context.Context, rec poll.ResponseReceipt) error {
	if rec.ID == "" {
		rec.ID = uuid.Must(uuid.NewV7()).String()
	}
	_, err := s.runner(ctx).ExecContext(ctx, `
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
	obs.Source = poll.NormalizeObservationSource(obs.Source)
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	now := time.Now().UTC()
	var capturedAt any
	if !obs.Item.CapturedAt.IsZero() {
		capturedAt = obs.Item.CapturedAt
	}
	meta, _ := json.Marshal(obs.Item.Notes)
	if obs.Item.Notes == nil || len(meta) == 0 || string(meta) == "null" {
		meta = []byte("{}")
	}
	sources := obs.Sources
	if len(sources) == 0 {
		sources = []string{obs.Source}
	}

	var existingHash sql.NullString
	var existingSources pq.StringArray
	err := s.runner(ctx).QueryRowContext(ctx, `
		SELECT payload_hash, COALESCE(sources, '{}')
		FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3
		FOR UPDATE`,
		obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
	).Scan(&existingHash, &existingSources)
	if errors.Is(err, sql.ErrNoRows) {
		merged := uniqueSources(nil, sources...)
		webhookMissing := obs.WebhookMissing && !poll.HasWebhookSource(obs.Source, merged)
		_, err = s.runner(ctx).ExecContext(ctx, `
			INSERT INTO provider_payment_observations (
				id, tenant_id, connector_id, provider, provider_mode, payment_id, order_id,
				amount_minor, currency, status, captured, fee_minor, tax_minor,
				provider_created_at, captured_at_provider, method, email, contact, metadata,
				payload_hash, source, sources, webhook_missing, last_response_receipt_id,
				observed_at, first_seen_at, last_seen_at, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
			obs.ID, obs.TenantID, obs.ConnectorID, obs.Provider, obs.ProviderMode, obs.Item.PaymentID, nullIfEmpty(obs.Item.OrderID),
			obs.Item.AmountMinor, obs.Item.Currency, obs.Item.Status, obs.Item.Captured, obs.Item.FeeMinor, obs.Item.TaxMinor,
			nullTime(obs.Item.CreatedAt), capturedAt, nullIfEmpty(obs.Item.Method), nullIfEmpty(obs.Item.Email), nullIfEmpty(obs.Item.Contact), meta,
			obs.Item.PayloadHash, obs.Source, pq.Array(merged), webhookMissing, nullIfEmpty(obs.ReceiptID),
			now, now, now, now, now,
		)
		if err != nil {
			if isUniqueViolation(err) {
				return s.UpsertPayment(ctx, obs)
			}
			return "", err
		}
		if err := s.insertObservationEvent(ctx, obs, now); err != nil {
			return "", err
		}
		return poll.UpsertInserted, nil
	}
	if err != nil {
		return "", err
	}
	merged := uniqueSources(existingSources, sources...)
	webhookMissing := obs.WebhookMissing && !poll.HasWebhookSource(obs.Source, merged)
	if poll.HasWebhookSource("", merged) {
		webhookMissing = false
	}
	if existingHash.String == obs.Item.PayloadHash {
		_, err = s.runner(ctx).ExecContext(ctx, `
			UPDATE provider_payment_observations SET
				sources=$4, webhook_missing=$5, last_seen_at=$6, updated_at=$6
			WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
			obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
			pq.Array(merged), webhookMissing, now,
		)
		if err != nil {
			return "", err
		}
		if len(merged) > len(existingSources) {
			if err := s.insertObservationEvent(ctx, obs, now); err != nil {
				return "", err
			}
		}
		return poll.UpsertDuplicate, nil
	}
	_, err = s.runner(ctx).ExecContext(ctx, `
		UPDATE provider_payment_observations SET
			order_id=$4, amount_minor=$5, currency=$6, status=$7, captured=$8,
			fee_minor=$9, tax_minor=$10, provider_created_at=$11, captured_at_provider=$12,
			method=$13, email=$14, contact=$15, metadata=$16, payload_hash=$17,
			sources=$18, webhook_missing=$19, last_response_receipt_id=$20,
			observed_at=$21, last_seen_at=$21, updated_at=$21
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
		obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
		nullIfEmpty(obs.Item.OrderID), obs.Item.AmountMinor, obs.Item.Currency, obs.Item.Status, obs.Item.Captured,
		obs.Item.FeeMinor, obs.Item.TaxMinor, nullTime(obs.Item.CreatedAt), capturedAt,
		nullIfEmpty(obs.Item.Method), nullIfEmpty(obs.Item.Email), nullIfEmpty(obs.Item.Contact), meta, obs.Item.PayloadHash,
		pq.Array(merged), webhookMissing, nullIfEmpty(obs.ReceiptID), now,
	)
	if err != nil {
		return "", err
	}
	if err := s.insertObservationEvent(ctx, obs, now); err != nil {
		return "", err
	}
	return poll.UpsertUpdated, nil
}

func (s *SQLStore) insertObservationEvent(ctx context.Context, obs poll.PaymentObservation, observedAt time.Time) error {
	_, err := s.runner(ctx).ExecContext(ctx, `
		INSERT INTO provider_payment_observation_events (
			id, tenant_id, connector_id, payment_id, source, status, payload_hash, observed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		uuid.Must(uuid.NewV7()).String(), obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
		obs.Source, obs.Item.Status, obs.Item.PayloadHash, observedAt,
	)
	return err
}

func uniqueSources(existing []string, add ...string) []string {
	out := make([]string, 0, len(existing)+len(add))
	seen := map[string]struct{}{}
	for _, s := range append(append([]string{}, existing...), add...) {
		n := poll.NormalizeObservationSource(s)
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

func nullTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}

func (s *SQLStore) UpsertSettlementLine(ctx context.Context, obs poll.SettlementLineObservation) (poll.UpsertResult, error) {
	if obs.ID == "" {
		obs.ID = uuid.Must(uuid.NewV7()).String()
	}
	var existingHash sql.NullString
	err := s.runner(ctx).QueryRowContext(ctx, `
		SELECT payload_hash FROM provider_settlement_line_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND settlement_id=$3 AND entity_id=$4`,
		obs.TenantID, obs.ConnectorID, obs.Item.SettlementID, obs.Item.EntityID,
	).Scan(&existingHash)
	now := time.Now().UTC()
	var settledAt any
	if !obs.Item.SettledAt.IsZero() {
		settledAt = obs.Item.SettledAt
	}
	if obs.Item.SourceFile == "" {
		obs.Item.SourceFile = obs.Source
	}
	amt, found := lookupCanonicalPaymentAmount(ctx, s.runner(ctx), obs.TenantID, obs.ConnectorID, obs.Item.PaymentID)
	obs.Item.PaymentLink = razorpay.PaymentLinkFor(obs.Item.PaymentID, obs.Item.AmountMinor, amt, found)
	razorpay.EnrichSettlementLine(&obs.Item)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.runner(ctx).ExecContext(ctx, `
			INSERT INTO provider_settlement_line_observations (
				id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
				payment_id, order_id, refund_id, amount_minor, debit_minor, credit_minor, fee_minor, tax_minor,
				adjustment_minor, currency, settlement_utr, settled, settled_at, payload_hash, source, last_response_receipt_id,
				provider_status, canonical_status, source_file, source_row, raw_reference, payment_link,
				observed_at, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
			obs.ID, obs.TenantID, obs.ConnectorID, obs.Provider, obs.ProviderMode, obs.Item.SettlementID, obs.Item.EntityID, obs.Item.LineType,
			nullIfEmpty(obs.Item.PaymentID), nullIfEmpty(obs.Item.OrderID), nullIfEmpty(obs.Item.RefundID),
			obs.Item.AmountMinor, obs.Item.DebitMinor, obs.Item.CreditMinor, obs.Item.FeeMinor, obs.Item.TaxMinor, obs.Item.AdjustmentMinor,
			obs.Item.Currency, nullIfEmpty(obs.Item.UTR), obs.Item.Settled, settledAt, obs.Item.PayloadHash, obs.Source, nullIfEmpty(obs.ReceiptID),
			nullIfEmpty(obs.Item.ProviderStatus), nullIfEmpty(obs.Item.CanonicalStatus), nullIfEmpty(obs.Item.SourceFile),
			nullIfZero(obs.Item.SourceRow), nullIfEmpty(obs.Item.RawReference), obs.Item.PaymentLink,
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
	_, err = s.runner(ctx).ExecContext(ctx, `
		UPDATE provider_settlement_line_observations SET
			line_type=$5, payment_id=$6, order_id=$7, refund_id=$8, amount_minor=$9, debit_minor=$10, credit_minor=$11,
			fee_minor=$12, tax_minor=$13, adjustment_minor=$14, currency=$15, settlement_utr=$16, settled=$17, settled_at=$18,
			payload_hash=$19, last_response_receipt_id=$20, provider_status=$21, canonical_status=$22,
			source_file=$23, source_row=$24, raw_reference=$25, payment_link=$26, observed_at=$27, updated_at=$27
		WHERE tenant_id=$1 AND connector_id=$2 AND settlement_id=$3 AND entity_id=$4`,
		obs.TenantID, obs.ConnectorID, obs.Item.SettlementID, obs.Item.EntityID,
		obs.Item.LineType, nullIfEmpty(obs.Item.PaymentID), nullIfEmpty(obs.Item.OrderID), nullIfEmpty(obs.Item.RefundID),
		obs.Item.AmountMinor, obs.Item.DebitMinor, obs.Item.CreditMinor,
		obs.Item.FeeMinor, obs.Item.TaxMinor, obs.Item.AdjustmentMinor, obs.Item.Currency, nullIfEmpty(obs.Item.UTR),
		obs.Item.Settled, settledAt, obs.Item.PayloadHash, nullIfEmpty(obs.ReceiptID),
		nullIfEmpty(obs.Item.ProviderStatus), nullIfEmpty(obs.Item.CanonicalStatus),
		nullIfEmpty(obs.Item.SourceFile), nullIfZero(obs.Item.SourceRow), nullIfEmpty(obs.Item.RawReference),
		obs.Item.PaymentLink, now,
	)
	if err != nil {
		return "", err
	}
	return poll.UpsertUpdated, nil
}

func (s *SQLStore) ListPaymentIDsInWindow(ctx context.Context, tenantID, connectorID string, from, to time.Time) ([]string, error) {
	rows, err := s.runner(ctx).QueryContext(ctx, `
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
	err := s.runner(ctx).QueryRowContext(ctx, `
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
	_, err := s.runner(ctx).ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, aggregate_type, aggregate_id,
			event_type, schema_version, payload, status, retry_count, created_at, idempotency_key
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',0,$9,$10)
		ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
		row.EventID, row.TenantID, row.TraceID, row.AggregateType, row.AggregateID,
		row.EventType, models.SchemaVersionV1, row.Payload, row.CreatedAt, nullIfEmpty(row.IdempotencyKey),
	)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullIfZero(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}
