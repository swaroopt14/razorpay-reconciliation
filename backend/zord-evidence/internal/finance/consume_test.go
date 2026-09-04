package finance

import (
	"context"
	"encoding/json"
	"testing"
)

func TestConsumeIgnoresNonFinanceEvents(t *testing.T) {
	svc := NewService(NewMemoryStore())
	raw, _ := json.Marshal(map[string]any{
		"event_type": "outcome.leaf_bundle.created",
		"tenant_id":  "tenant-a",
		"entity_id":  "pay_123",
	})
	if err := ConsumeBytes(context.Background(), svc, raw); err != nil {
		t.Fatal(err)
	}
	list, _ := svc.GetEntity(context.Background(), "tenant-a", "payment", "pay_123")
	if len(list) != 0 {
		t.Fatalf("must not ingest leaf bundles: %d", len(list))
	}
}

func TestConsumeIngestsDecisionEvent(t *testing.T) {
	svc := NewService(NewMemoryStore())
	ev := failedBankEvent()
	ev.EventType = EventTypeReconDecision
	raw, _ := json.Marshal(ev)
	if err := ConsumeBytes(context.Background(), svc, raw); err != nil {
		t.Fatal(err)
	}
	list, _ := svc.GetEntity(context.Background(), ev.TenantID, ev.EntityType, ev.EntityID)
	if len(list) == 0 {
		t.Fatal("expected evidence")
	}
}
