package paymenttruth

import (
	"fmt"
	"strings"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/internal/recon"
)

func MapNeutral(tenantID, connectorID, provider, mode, source, sourceEventID, receiptID string, item razorpay.NeutralPayment, webhookMissing bool, observedAt time.Time) (Observation, error) {
	if err := validateNeutral(item); err != nil {
		return Observation{}, err
	}
	if strings.TrimSpace(tenantID) == "" || strings.TrimSpace(connectorID) == "" {
		return Observation{}, fmt.Errorf("tenant_id and connector_id are required")
	}
	if provider == "" {
		provider = "razorpay"
	}
	source = normalizeSource(source)
	providerStatus := strings.TrimSpace(item.ProviderStatus)
	if providerStatus == "" {
		providerStatus = strings.TrimSpace(item.Status)
	}
	canonical := razorpay.NormalizePaymentStatus(providerStatus)
	obs := Observation{
		TenantID:          tenantID,
		ConnectorID:       connectorID,
		Provider:          provider,
		ProviderMode:      mode,
		PaymentID:         strings.TrimSpace(item.PaymentID),
		OrderID:           strings.TrimSpace(item.OrderID),
		AmountMinor:       item.AmountMinor,
		Currency:          strings.ToUpper(strings.TrimSpace(item.Currency)),
		Method:            strings.TrimSpace(item.Method),
		ProviderStatus:    providerStatus,
		CanonicalStatus:   canonical,
		Captured:          item.Captured || canonical == recon.PaymentCaptured,
		FeeMinor:          item.FeeMinor,
		TaxMinor:          item.TaxMinor,
		ProviderCreatedAt: item.CreatedAt.UTC(),
		CapturedAt:        item.CapturedAt.UTC(),
		ObservedAt:        observedAt.UTC(),
		Source:            source,
		SourceEventID:     strings.TrimSpace(sourceEventID),
		SourceHash:        strings.TrimSpace(item.PayloadHash),
		RawReference:      RawReference(receiptID),
		ReceiptID:         strings.TrimSpace(receiptID),
		WebhookMissing:    webhookMissing,
		Email:             item.Email,
		Contact:           item.Contact,
	}
	if obs.Currency == "" {
		obs.Currency = "INR"
	}
	if obs.Captured && obs.CapturedAt.IsZero() && !obs.ProviderCreatedAt.IsZero() {
		obs.CapturedAt = obs.ProviderCreatedAt
	}
	if obs.ObservedAt.IsZero() {
		obs.ObservedAt = time.Now().UTC()
	}
	obs.IdentityHash = ObservationIdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PaymentID, obs.Source, obs.SourceEventID, obs.SourceHash)
	return obs, nil
}

func validateNeutral(item razorpay.NeutralPayment) error {
	if strings.TrimSpace(item.PaymentID) == "" {
		return fmt.Errorf("payment_id is required")
	}
	if item.AmountMinor < 0 {
		return fmt.Errorf("amount must not be negative")
	}
	cur := strings.ToUpper(strings.TrimSpace(item.Currency))
	if cur != "" && len(cur) != 3 {
		return fmt.Errorf("invalid currency")
	}
	return nil
}
