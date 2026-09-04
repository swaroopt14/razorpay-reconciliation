package poll

import "testing"

func TestNormalizeObservationSource(t *testing.T) {
	if NormalizeObservationSource("razorpay_api") != SourceAPIBackfill {
		t.Fatal("legacy razorpay_api must become api_backfill")
	}
	if NormalizeObservationSource("WEBHOOK") != SourceWebhook {
		t.Fatal("WEBHOOK maps to webhook")
	}
	got := NormalizeObservationSource("razorpay")
	if got == SourceWebhook || got == SourceAPIBackfill {
		t.Fatal("provider name is not an acquisition source")
	}
}

func TestHasWebhookSource(t *testing.T) {
	if !HasWebhookSource("webhook", nil) {
		t.Fatal("source webhook")
	}
	if !HasWebhookSource("api_backfill", []string{"webhook", "api_backfill"}) {
		t.Fatal("sources include webhook")
	}
	if HasWebhookSource("api_backfill", []string{"api_backfill"}) {
		t.Fatal("api only is not webhook")
	}
}
