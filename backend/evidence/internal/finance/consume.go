package finance

import (
	"context"
	"encoding/json"
	"log"
)

const (
	EventTypeReconDecision           = "reconciliation.decision.v1"
	EventTypeInvestigationCompleted  = "investigation.completed.v1"
)

func ConsumeBytes(ctx context.Context, svc *Service, raw []byte) error {
	var ev DecisionEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		return err
	}
	switch ev.EventType {
	case EventTypeReconDecision, EventTypeInvestigationCompleted:
	default:
		return nil
	}
	if ev.TenantID == "" || ev.EntityID == "" {
		return nil
	}
	_, err := svc.IngestDecision(ctx, ev)
	if err != nil {
		log.Printf("finance.ingest err=%v entity=%s type=%s", err, ev.EntityID, ev.EventType)
	}
	return err
}
