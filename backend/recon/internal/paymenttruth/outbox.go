package paymenttruth

import (
	"encoding/json"
	"fmt"
	"time"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

func ObservationOutboxRow(obs Observation) (models.OutboxRow, error) {
	eventID := uuid.Must(uuid.NewV7())
	source := normalizeSource(obs.Source)
	idempotency := fmt.Sprintf("razorpay:%s:payment:%s:%s", obs.ConnectorID, obs.PaymentID, obs.SourceHash)
	payload := map[string]any{
		"event_id":        eventID.String(),
		"event_type":      models.EventTypePaymentObservationNormalizedV1,
		"event_version":   models.EventVersionV1,
		"schema_version":  models.SchemaVersionV1,
		"tenant_id":       obs.TenantID,
		"connector_id":    obs.ConnectorID,
		"provider":        "razorpay",
		"source":          source,
		"sources":         []string{source},
		"payment_id":      obs.PaymentID,
		"order_id":        obs.OrderID,
		"amount":          obs.AmountMinor,
		"currency":        obs.Currency,
		"status":          obs.CanonicalStatus,
		"provider_status": obs.ProviderStatus,
		"captured":        obs.Captured,
		"fee":             obs.FeeMinor,
		"tax":             obs.TaxMinor,
		"payload_hash":    obs.SourceHash,
		"idempotency_key": idempotency,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return models.OutboxRow{}, err
	}
	tid, err := uuid.Parse(obs.TenantID)
	if err != nil {
		return models.OutboxRow{}, fmt.Errorf("tenant_id: %w", err)
	}
	return models.OutboxRow{
		EventID:        eventID,
		TenantID:       tid,
		AggregateType:  "provider_payment_observation",
		AggregateID:    eventID,
		EventType:      models.EventTypePaymentObservationNormalizedV1,
		Payload:        raw,
		IdempotencyKey: idempotency,
		CreatedAt:      time.Now().UTC(),
	}, nil
}

func CanonicalOutboxRow(pay CanonicalPayment, obs Observation) (models.OutboxRow, error) {
	eventID := uuid.Must(uuid.NewV7())
	idempotency := fmt.Sprintf("razorpay:%s:canonical:%s:%s:%s", pay.ConnectorID, pay.PaymentID, pay.CanonicalStatus, obs.SourceHash)
	payload := map[string]any{
		"event_id":          eventID.String(),
		"event_type":        models.EventTypePaymentCanonicalUpdatedV1,
		"event_version":     models.EventVersionV1,
		"schema_version":    models.SchemaVersionV1,
		"tenant_id":         pay.TenantID,
		"connector_id":      pay.ConnectorID,
		"provider":          "razorpay",
		"payment_id":        pay.PaymentID,
		"order_id":          pay.OrderID,
		"amount":            pay.AmountMinor,
		"currency":          pay.Currency,
		"canonical_status":  pay.CanonicalStatus,
		"provider_status":   pay.ProviderStatus,
		"captured":          pay.Captured,
		"intent_id":         pay.IntentID,
		"intent_link":       pay.IntentLink,
		"sources":           pay.Sources,
		"payload_hash":      obs.SourceHash,
		"idempotency_key":   idempotency,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return models.OutboxRow{}, err
	}
	tid, err := uuid.Parse(pay.TenantID)
	if err != nil {
		return models.OutboxRow{}, fmt.Errorf("tenant_id: %w", err)
	}
	aggID := eventID
	if pay.ID != "" {
		if parsed, err := uuid.Parse(pay.ID); err == nil {
			aggID = parsed
		}
	}
	return models.OutboxRow{
		EventID:        eventID,
		TenantID:       tid,
		AggregateType:  "canonical_payment",
		AggregateID:    aggID,
		EventType:      models.EventTypePaymentCanonicalUpdatedV1,
		Payload:        raw,
		IdempotencyKey: idempotency,
		CreatedAt:      time.Now().UTC(),
	}, nil
}
