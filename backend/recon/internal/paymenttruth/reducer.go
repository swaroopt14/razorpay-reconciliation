package paymenttruth

import (
	"zord-outcome-engine/internal/recon"
)

// ReducePaymentState applies incoming onto current without backward transitions.
// The observation is assumed already persisted; this only computes current truth.
func ReducePaymentState(current CanonicalPayment, incoming Observation) CanonicalPayment {
	now := incoming.ObservedAt
	if current.PaymentID == "" {
		out := canonicalFromObservation(incoming)
		out.FirstObservedAt = now
		out.LastObservedAt = now
		return out
	}

	out := current
	out.LastObservedAt = now
	out.Sources = appendUnique(out.Sources, incoming.Source)

	if incoming.OrderID != "" && out.OrderID == "" {
		out.OrderID = incoming.OrderID
	}
	if incoming.Method != "" && out.Method == "" {
		out.Method = incoming.Method
	}
	if incoming.AmountMinor > 0 {
		out.AmountMinor = incoming.AmountMinor
	}
	if incoming.Currency != "" {
		out.Currency = incoming.Currency
	}
	if incoming.FeeMinor != 0 {
		out.FeeMinor = incoming.FeeMinor
	}
	if incoming.TaxMinor != 0 {
		out.TaxMinor = incoming.TaxMinor
	}
	if out.ProviderCreatedAt.IsZero() && !incoming.ProviderCreatedAt.IsZero() {
		out.ProviderCreatedAt = incoming.ProviderCreatedAt
	}

	next, providerStatus := nextStatus(current.CanonicalStatus, current.ProviderStatus, incoming.CanonicalStatus, incoming.ProviderStatus)
	out.CanonicalStatus = next
	out.ProviderStatus = providerStatus
	out.Captured = IsCapturedOrLater(next)
	if out.Captured && out.CapturedAt.IsZero() {
		if !incoming.CapturedAt.IsZero() {
			out.CapturedAt = incoming.CapturedAt
		} else if next == recon.PaymentCaptured || next == recon.PaymentPartiallyRefunded || next == recon.PaymentRefunded {
			out.CapturedAt = incoming.ObservedAt
		}
	}
	return out
}

func nextStatus(current, currentProvider, incoming, incomingProvider string) (canonical, provider string) {
	if current == "" {
		return incoming, incomingProvider
	}
	if incoming == recon.PaymentFailed {
		if IsCapturedOrLater(current) {
			return current, currentProvider
		}
		return recon.PaymentFailed, incomingProvider
	}
	if isRefund(incoming) {
		if current == recon.PaymentCaptured || isRefund(current) {
			if Rank(incoming) >= Rank(current) {
				return incoming, incomingProvider
			}
		}
		return current, currentProvider
	}
	if current == recon.PaymentFailed && IsCapturedOrLater(incoming) {
		return incoming, incomingProvider
	}
	if current == recon.PaymentFailed {
		return current, currentProvider
	}
	if Rank(incoming) >= Rank(current) {
		return incoming, incomingProvider
	}
	return current, currentProvider
}

func isRefund(status string) bool {
	return status == recon.PaymentRefunded || status == recon.PaymentPartiallyRefunded
}

func canonicalFromObservation(in Observation) CanonicalPayment {
	return CanonicalPayment{
		TenantID:          in.TenantID,
		ConnectorID:       in.ConnectorID,
		Provider:          in.Provider,
		PaymentID:         in.PaymentID,
		OrderID:           in.OrderID,
		AmountMinor:       in.AmountMinor,
		Currency:          in.Currency,
		Method:            in.Method,
		ProviderStatus:    in.ProviderStatus,
		CanonicalStatus:   in.CanonicalStatus,
		Captured:          IsCapturedOrLater(in.CanonicalStatus) || in.Captured,
		FeeMinor:          in.FeeMinor,
		TaxMinor:          in.TaxMinor,
		ProviderCreatedAt: in.ProviderCreatedAt,
		CapturedAt:        in.CapturedAt,
		Sources:           []string{normalizeSource(in.Source)},
		IntentLink:        IntentUnlinked,
	}
}

func appendUnique(existing []string, source string) []string {
	source = normalizeSource(source)
	for _, s := range existing {
		if normalizeSource(s) == source {
			return existing
		}
	}
	return append(append([]string(nil), existing...), source)
}
