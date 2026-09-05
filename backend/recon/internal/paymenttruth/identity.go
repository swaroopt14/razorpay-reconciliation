package paymenttruth

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func ObservationIdentityHash(tenantID, connectorID, provider, paymentID, source, sourceEventID, sourceHash string) string {
	if provider == "" {
		provider = "razorpay"
	}
	source = normalizeSource(source)
	raw := strings.Join([]string{
		strings.TrimSpace(tenantID),
		strings.TrimSpace(connectorID),
		strings.TrimSpace(provider),
		strings.TrimSpace(paymentID),
		source,
		strings.TrimSpace(sourceEventID),
		strings.TrimSpace(sourceHash),
	}, "|")
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func RawReference(receiptID string) string {
	receiptID = strings.TrimSpace(receiptID)
	if receiptID == "" {
		return ""
	}
	return "receipt:" + receiptID
}

func normalizeSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "webhook":
		return "webhook"
	case "api_backfill", "api", "razorpay_api":
		return "api_backfill"
	case "api_poll":
		return "api_poll"
	default:
		if strings.TrimSpace(source) == "" {
			return "api_backfill"
		}
		return strings.ToLower(strings.TrimSpace(source))
	}
}
