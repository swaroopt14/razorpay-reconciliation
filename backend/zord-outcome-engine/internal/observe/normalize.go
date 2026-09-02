package observe

import (
	"fmt"
	"strings"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

func isPaymentEvent(eventType, entityType string) bool {
	et := strings.ToLower(strings.TrimSpace(eventType))
	ent := strings.ToLower(strings.TrimSpace(entityType))
	if strings.HasPrefix(et, "payment.") {
		return true
	}
	return ent == "payment"
}

func statusFromEvent(eventType, payloadStatus string) (status string, captured bool) {
	status = strings.ToLower(strings.TrimSpace(payloadStatus))
	switch strings.ToLower(strings.TrimSpace(eventType)) {
	case "payment.captured":
		if status == "" {
			status = "captured"
		}
		captured = true
	case "payment.authorized":
		if status == "" {
			status = "authorized"
		}
	case "payment.failed":
		if status == "" {
			status = "failed"
		}
	}
	if status == "captured" {
		captured = true
	}
	return status, captured
}

// NormalizePayment maps a webhook observation onto the same NeutralPayment
// shape used by API backfill. It does not rank captured vs failed.
func NormalizePayment(env Envelope) (razorpay.NeutralPayment, bool, error) {
	if !isPaymentEvent(env.ProviderEventType, env.ProviderEntityType) {
		return razorpay.NeutralPayment{}, false, nil
	}
	paymentID := strings.TrimSpace(env.ProviderEntityID)
	if paymentID == "" {
		return razorpay.NeutralPayment{}, false, fmt.Errorf("missing provider_entity_id")
	}
	status, captured := statusFromEvent(env.ProviderEventType, env.Status)
	if env.Captured {
		captured = true
	}
	currency := strings.TrimSpace(env.Currency)
	if currency == "" {
		currency = "INR"
	}
	created := time.Time{}
	if env.ProviderCreatedAt != nil {
		created = env.ProviderCreatedAt.UTC()
	}
	item := razorpay.NeutralPayment{
		PaymentID:   paymentID,
		OrderID:     strings.TrimSpace(env.OrderID),
		AmountMinor: env.Amount,
		Currency:    currency,
		Status:      status,
		Captured:    captured,
		FeeMinor:    env.Fee,
		TaxMinor:    env.Tax,
		CreatedAt:   created,
	}
	canonical, err := razorpay.CanonicalizeForHash(map[string]any{
		"payment_id":     item.PaymentID,
		"order_id":       item.OrderID,
		"amount":         item.AmountMinor,
		"currency":       item.Currency,
		"status":         item.Status,
		"captured":       item.Captured,
		"fee":            item.FeeMinor,
		"tax":            item.TaxMinor,
		"event_type":     env.ProviderEventType,
		"raw_body_hash":  env.RawBodyHash,
		"provider_event": env.ProviderEventID,
	})
	if err != nil {
		return razorpay.NeutralPayment{}, false, err
	}
	item.PayloadHash = razorpay.HashRawResponse(canonical)
	return item, true, nil
}
