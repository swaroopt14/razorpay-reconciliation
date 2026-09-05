package poll

import (
	"encoding/json"
	"fmt"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

func ObservationIdempotencyKey(connectorID, paymentID, payloadHash string) string {
	return fmt.Sprintf("razorpay:%s:payment:%s:%s", connectorID, paymentID, payloadHash)
}

func PaymentOutboxRow(tenantID, connectorID, paymentID, source string, item razorpay.NeutralPayment) (models.OutboxRow, error) {
	eventID := uuid.Must(uuid.NewV7())
	source = NormalizeObservationSource(source)
	idempotency := ObservationIdempotencyKey(connectorID, paymentID, item.PayloadHash)
	payload := map[string]any{
		"event_id":        eventID.String(),
		"event_type":      models.EventTypePaymentObservationNormalizedV1,
		"event_version":   models.EventVersionV1,
		"schema_version":  models.SchemaVersionV1,
		"tenant_id":       tenantID,
		"connector_id":    connectorID,
		"provider":        "razorpay",
		"source":          source,
		"sources":         []string{source},
		"payment_id":      item.PaymentID,
		"order_id":        item.OrderID,
		"amount":          item.AmountMinor,
		"currency":        item.Currency,
		"status":          item.Status,
		"captured":        item.Captured,
		"fee":             item.FeeMinor,
		"tax":             item.TaxMinor,
		"payload_hash":    item.PayloadHash,
		"idempotency_key": idempotency,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return models.OutboxRow{}, err
	}
	tid, err := uuid.Parse(tenantID)
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

func SettlementOutboxRow(tenantID, connectorID string, item razorpay.NeutralSettlementLine) (models.OutboxRow, error) {
	eventID := uuid.Must(uuid.NewV7())
	payload := map[string]any{
		"event_id":       eventID.String(),
		"event_type":     models.EventTypeSettlementObservationNormalizedV1,
		"event_version":  models.EventVersionV1,
		"schema_version": models.SchemaVersionV1,
		"tenant_id":      tenantID,
		"connector_id":   connectorID,
		"source":         "razorpay_settlement_recon",
		"settlement_id":  item.SettlementID,
		"entity_id":      item.EntityID,
		"type":           item.LineType,
		"payment_id":     item.PaymentID,
		"amount":         item.AmountMinor,
		"credit":         item.CreditMinor,
		"debit":          item.DebitMinor,
		"fee":            item.FeeMinor,
		"tax":            item.TaxMinor,
		"utr":            item.UTR,
		"payload_hash":   item.PayloadHash,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return models.OutboxRow{}, err
	}
	tid, err := uuid.Parse(tenantID)
	if err != nil {
		return models.OutboxRow{}, fmt.Errorf("tenant_id: %w", err)
	}
	return models.OutboxRow{
		EventID:       eventID,
		TenantID:      tid,
		AggregateType: "provider_settlement_line_observation",
		AggregateID:   eventID,
		EventType:     models.EventTypeSettlementObservationNormalizedV1,
		Payload:       raw,
		CreatedAt:     time.Now().UTC(),
	}, nil
}
