package services

import (
	"testing"
)

func TestParseMetadataNestedEntityID(t *testing.T) {
	raw := []byte(`{
		"entity":"event",
		"event":"payment.captured",
		"created_at":1700000000,
		"payload":{
			"payment":{
				"entity":{"id":"pay_test_001","entity":"payment","amount":100000}
			}
		}
	}`)
	meta, err := NewRazorpayWebhookService().ParseMetadata(raw)
	if err != nil {
		t.Fatal(err)
	}
	if meta.EntityID != "pay_test_001" {
		t.Fatalf("entity id=%q", meta.EntityID)
	}
	if meta.EntityType != "payment" {
		t.Fatalf("entity type=%q", meta.EntityType)
	}
	if meta.EventType != "payment.captured" {
		t.Fatalf("event=%q", meta.EventType)
	}
	if meta.AmountMinor != 100000 {
		t.Fatalf("amount=%d", meta.AmountMinor)
	}
}
