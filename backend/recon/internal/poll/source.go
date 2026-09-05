package poll

import "strings"

const (
	SourceWebhook     = "webhook"
	SourceAPIBackfill = "api_backfill"
	SourceAPIPoll     = "api_poll"
)

// NormalizeObservationSource maps legacy and mixed labels onto acquisition mechanisms.
// Razorpay is the provider, never the source.
func NormalizeObservationSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case SourceWebhook:
		return SourceWebhook
	case SourceAPIBackfill, "api", "razorpay_api":
		return SourceAPIBackfill
	case SourceAPIPoll:
		return SourceAPIPoll
	default:
		if strings.TrimSpace(source) == "" {
			return SourceAPIBackfill
		}
		return strings.ToLower(strings.TrimSpace(source))
	}
}

func HasWebhookSource(source string, sources []string) bool {
	if NormalizeObservationSource(source) == SourceWebhook {
		return true
	}
	for _, s := range sources {
		if NormalizeObservationSource(s) == SourceWebhook {
			return true
		}
	}
	return false
}

func appendUniqueSource(existing []string, source string) []string {
	source = NormalizeObservationSource(source)
	for _, s := range existing {
		if NormalizeObservationSource(s) == source {
			return existing
		}
	}
	return append(append([]string(nil), existing...), source)
}
