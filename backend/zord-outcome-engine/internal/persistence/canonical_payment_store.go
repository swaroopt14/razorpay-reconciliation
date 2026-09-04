package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"zord-outcome-engine/internal/paymenttruth"
	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/internal/poll/providers/razorpay"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

var _ paymenttruth.Store = (*SQLStore)(nil)

func (s *SQLStore) InsertObservationEvent(ctx context.Context, obs paymenttruth.Observation) (bool, error) {
	if obs.IdentityHash == "" {
		obs.IdentityHash = paymenttruth.ObservationIdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PaymentID, obs.Source, obs.SourceEventID, obs.SourceHash)
	}
	id := uuid.Must(uuid.NewV7()).String()
	observedAt := obs.ObservedAt
	if observedAt.IsZero() {
		observedAt = time.Now().UTC()
	}
	var returned string
	err := s.runner(ctx).QueryRowContext(ctx, `
		INSERT INTO provider_payment_observation_events (
			id, tenant_id, connector_id, payment_id, source, status, payload_hash, observed_at,
			provider_status, canonical_status, source_event_id, source_hash,
			amount_minor, currency, order_id, raw_reference, observation_identity_hash
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		ON CONFLICT (observation_identity_hash) DO NOTHING
		RETURNING id`,
		id, obs.TenantID, obs.ConnectorID, obs.PaymentID, obs.Source, obs.CanonicalStatus, obs.SourceHash, observedAt,
		nullIfEmpty(obs.ProviderStatus), nullIfEmpty(obs.CanonicalStatus), obs.SourceEventID, nullIfEmpty(obs.SourceHash),
		obs.AmountMinor, nullIfEmpty(obs.Currency), nullIfEmpty(obs.OrderID), nullIfEmpty(obs.RawReference), obs.IdentityHash,
	).Scan(&returned)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return returned != "", nil
}

func (s *SQLStore) GetCanonicalPayment(ctx context.Context, tenantID, connectorID, paymentID string) (paymenttruth.CanonicalPayment, bool, error) {
	var pay paymenttruth.CanonicalPayment
	var orderID, method, intentID sql.NullString
	var providerCreated, capturedAt sql.NullTime
	var sources pq.StringArray
	err := s.runner(ctx).QueryRowContext(ctx, `
		SELECT id::text, tenant_id::text, connector_id::text, provider, payment_id, order_id,
			amount_minor, currency, method, provider_status, canonical_status, captured,
			fee_minor, tax_minor, provider_created_at, captured_at, first_observed_at, last_observed_at,
			COALESCE(sources, '{}'), intent_id::text, intent_link
		FROM canonical_payments
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3
		FOR UPDATE`,
		tenantID, connectorID, paymentID,
	).Scan(
		&pay.ID, &pay.TenantID, &pay.ConnectorID, &pay.Provider, &pay.PaymentID, &orderID,
		&pay.AmountMinor, &pay.Currency, &method, &pay.ProviderStatus, &pay.CanonicalStatus, &pay.Captured,
		&pay.FeeMinor, &pay.TaxMinor, &providerCreated, &capturedAt, &pay.FirstObservedAt, &pay.LastObservedAt,
		&sources, &intentID, &pay.IntentLink,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return paymenttruth.CanonicalPayment{}, false, nil
	}
	if err != nil {
		return paymenttruth.CanonicalPayment{}, false, err
	}
	pay.OrderID = orderID.String
	pay.Method = method.String
	pay.IntentID = intentID.String
	if providerCreated.Valid {
		pay.ProviderCreatedAt = providerCreated.Time
	}
	if capturedAt.Valid {
		pay.CapturedAt = capturedAt.Time
	}
	pay.Sources = []string(sources)
	return pay, true, nil
}

func (s *SQLStore) UpsertCanonicalPayment(ctx context.Context, pay paymenttruth.CanonicalPayment) error {
	if pay.ID == "" {
		pay.ID = uuid.Must(uuid.NewV7()).String()
	}
	if pay.IntentLink == "" {
		pay.IntentLink = paymenttruth.IntentUnlinked
	}
	now := time.Now().UTC()
	if pay.FirstObservedAt.IsZero() {
		pay.FirstObservedAt = now
	}
	if pay.LastObservedAt.IsZero() {
		pay.LastObservedAt = now
	}
	_, err := s.runner(ctx).ExecContext(ctx, `
		INSERT INTO canonical_payments (
			id, tenant_id, connector_id, provider, payment_id, order_id, amount_minor, currency, method,
			provider_status, canonical_status, captured, fee_minor, tax_minor,
			provider_created_at, captured_at, first_observed_at, last_observed_at, sources,
			intent_id, intent_link, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
		ON CONFLICT (tenant_id, connector_id, provider, payment_id) DO UPDATE SET
			order_id=EXCLUDED.order_id,
			amount_minor=EXCLUDED.amount_minor,
			currency=EXCLUDED.currency,
			method=COALESCE(EXCLUDED.method, canonical_payments.method),
			provider_status=EXCLUDED.provider_status,
			canonical_status=EXCLUDED.canonical_status,
			captured=EXCLUDED.captured,
			fee_minor=EXCLUDED.fee_minor,
			tax_minor=EXCLUDED.tax_minor,
			provider_created_at=COALESCE(canonical_payments.provider_created_at, EXCLUDED.provider_created_at),
			captured_at=COALESCE(canonical_payments.captured_at, EXCLUDED.captured_at),
			last_observed_at=EXCLUDED.last_observed_at,
			sources=EXCLUDED.sources,
			intent_id=EXCLUDED.intent_id,
			intent_link=EXCLUDED.intent_link,
			updated_at=EXCLUDED.updated_at`,
		pay.ID, pay.TenantID, pay.ConnectorID, pay.Provider, pay.PaymentID, nullIfEmpty(pay.OrderID),
		pay.AmountMinor, pay.Currency, nullIfEmpty(pay.Method), pay.ProviderStatus, pay.CanonicalStatus, pay.Captured,
		pay.FeeMinor, pay.TaxMinor, nullTime(pay.ProviderCreatedAt), nullTime(pay.CapturedAt),
		pay.FirstObservedAt, pay.LastObservedAt, pq.Array(pay.Sources),
		nullIfEmpty(pay.IntentID), pay.IntentLink, now,
	)
	return err
}

func (s *SQLStore) ApplyCanonicalSnapshot(ctx context.Context, pay paymenttruth.CanonicalPayment, incoming paymenttruth.Observation) error {
	obs := poll.PaymentObservation{
		TenantID:     pay.TenantID,
		ConnectorID:  pay.ConnectorID,
		Provider:     pay.Provider,
		ProviderMode: incoming.ProviderMode,
		Item: razorpay.NeutralPayment{
			PaymentID:   pay.PaymentID,
			OrderID:     pay.OrderID,
			AmountMinor: pay.AmountMinor,
			Currency:    pay.Currency,
			Status:      pay.CanonicalStatus,
			Method:      pay.Method,
			Captured:    pay.Captured,
			FeeMinor:    pay.FeeMinor,
			TaxMinor:    pay.TaxMinor,
			CreatedAt:   pay.ProviderCreatedAt,
			CapturedAt:  pay.CapturedAt,
			Email:       incoming.Email,
			Contact:     incoming.Contact,
			PayloadHash: incoming.SourceHash,
		},
		ReceiptID:      incoming.ReceiptID,
		Source:         incoming.Source,
		Sources:        pay.Sources,
		WebhookMissing: incoming.WebhookMissing && !poll.HasWebhookSource("", pay.Sources),
	}
	return s.upsertPaymentSnapshot(ctx, obs)
}

func (s *SQLStore) upsertPaymentSnapshot(ctx context.Context, obs poll.PaymentObservation) error {
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
	var existingEmail, existingContact sql.NullString
	err := s.runner(ctx).QueryRowContext(ctx, `
		SELECT payload_hash, COALESCE(sources, '{}'), email, contact
		FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3
		FOR UPDATE`,
		obs.TenantID, obs.ConnectorID, obs.Item.PaymentID,
	).Scan(&existingHash, &existingSources, &existingEmail, &existingContact)
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
				return s.upsertPaymentSnapshot(ctx, obs)
			}
			return err
		}
		return nil
	}
	if err != nil {
		return err
	}
	merged := uniqueSources(existingSources, sources...)
	webhookMissing := obs.WebhookMissing && !poll.HasWebhookSource(obs.Source, merged)
	if poll.HasWebhookSource("", merged) {
		webhookMissing = false
	}
	email := obs.Item.Email
	if email == "" {
		email = existingEmail.String
	}
	contact := obs.Item.Contact
	if contact == "" {
		contact = existingContact.String
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
		nullIfEmpty(obs.Item.Method), nullIfEmpty(email), nullIfEmpty(contact), meta, obs.Item.PayloadHash,
		pq.Array(merged), webhookMissing, nullIfEmpty(obs.ReceiptID), now,
	)
	return err
}

func (s *SQLStore) FindIntentByOrderID(ctx context.Context, tenantID, orderID string) (string, bool, error) {
	if orderID == "" {
		return "", false, nil
	}
	var id string
	err := s.runner(ctx).QueryRowContext(ctx, `
		SELECT intent_id::text FROM canonical_intents
		WHERE tenant_id=$1 AND (client_payout_ref=$2 OR business_idempotency_key=$2)
		LIMIT 1`, tenantID, orderID,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, id != "", nil
}

func (s *SQLStore) ListObservationEvents(ctx context.Context, tenantID, connectorID, paymentID string) ([]paymenttruth.Observation, error) {
	rows, err := s.runner(ctx).QueryContext(ctx, `
		SELECT payment_id, COALESCE(order_id,''), COALESCE(amount_minor,0), COALESCE(currency,''),
			COALESCE(provider_status, status), COALESCE(canonical_status, status),
			COALESCE(source,''), COALESCE(source_event_id,''), COALESCE(source_hash, payload_hash),
			COALESCE(raw_reference,''), COALESCE(observation_identity_hash,''), observed_at
		FROM provider_payment_observation_events
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3
		ORDER BY observed_at ASC`,
		tenantID, connectorID, paymentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []paymenttruth.Observation
	for rows.Next() {
		var obs paymenttruth.Observation
		obs.TenantID = tenantID
		obs.ConnectorID = connectorID
		if err := rows.Scan(
			&obs.PaymentID, &obs.OrderID, &obs.AmountMinor, &obs.Currency,
			&obs.ProviderStatus, &obs.CanonicalStatus,
			&obs.Source, &obs.SourceEventID, &obs.SourceHash,
			&obs.RawReference, &obs.IdentityHash, &obs.ObservedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, obs)
	}
	return out, rows.Err()
}
