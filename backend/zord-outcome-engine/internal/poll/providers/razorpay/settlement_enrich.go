package razorpay

import "strings"

const (
	PaymentLinkUnlinked = "unlinked"
	PaymentLinkLinked   = "linked"
	PaymentLinkPartial  = "partial"
)

// EnrichSettlementLine fills canonical status, provider status, and adjustment
// without folding adjustments into fees or recomputing provider net.
func EnrichSettlementLine(line *NeutralSettlementLine) {
	if line == nil {
		return
	}
	line.LineType = strings.ToLower(strings.TrimSpace(line.LineType))
	if line.ProviderStatus == "" {
		line.ProviderStatus = line.LineType
	}
	if line.CanonicalStatus == "" {
		line.CanonicalStatus = CanonicalSettlementStatus(line.LineType, line.Settled)
	}
	if line.PaymentLink == "" {
		line.PaymentLink = PaymentLinkUnlinked
	}
	if line.RawReference == "" {
		line.RawReference = line.UTR
	}
	if line.LineType == "adjustment" && line.AdjustmentMinor == 0 {
		line.AdjustmentMinor = line.CreditMinor - line.DebitMinor
		if line.AdjustmentMinor == 0 {
			line.AdjustmentMinor = line.AmountMinor
		}
	}
}

func CanonicalSettlementStatus(lineType string, settled bool) string {
	switch strings.ToLower(strings.TrimSpace(lineType)) {
	case "refund":
		return "reversed"
	case "adjustment":
		return "adjusted"
	case "transfer":
		if settled {
			return "settled"
		}
		return "included_in_recon"
	default:
		if settled {
			return "settled"
		}
		return "included_in_recon"
	}
}

// PaymentLinkFor compares an exact payment_id lookup against settlement gross.
// Never amount-only: missing paymentID is always unlinked.
func PaymentLinkFor(paymentID string, settlementGross int64, paymentAmount int64, found bool) string {
	if strings.TrimSpace(paymentID) == "" || !found {
		return PaymentLinkUnlinked
	}
	if settlementGross < paymentAmount {
		return PaymentLinkPartial
	}
	return PaymentLinkLinked
}
