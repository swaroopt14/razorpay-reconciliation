package services

import (
	"context"
	"fmt"

	"zord-intent-engine/internal/models"
)

// PersistRejectedIntentDLQ finalizes a rejected intent's DLQ record: it fills
// in identifiers the pipeline may not have set yet, persists the entry if it
// wasn't already saved upstream (dlq.DLQID == ""), and fires the
// vector-index side effect only on a confirmed durable save.
//
// INT-01: the caller must propagate a non-nil return here rather than
// acknowledging the Kafka message — a rejected intent with a failed DLQ
// write has neither an intent row nor a DLQ row, which is silent
// financial-data loss and corrupts batch counts/auditability. Propagating
// the error sends the message back through kafka.callWithRetry; if every
// attempt fails, kafka.ConsumeClaim durably records it in
// consumer_failure_receipts (R-03) before the offset is allowed to advance.
//
// Exported as an IntentService method (rather than a free function in
// cmd/main.go, where it originally lived) specifically so it can be
// exercised by a real, importing test — cmd is package main, which nothing
// can ever import, so a test anywhere outside cmd/ could only ever call a
// reproduction of this logic, never the real thing.
func (s *IntentService) PersistRejectedIntentDLQ(
	ctx context.Context,
	dlq *models.DLQEntry,
	event *models.Event,
) error {
	if dlq.DLQID != "" {
		// Already durably saved upstream (inside ProcessIncomingIntent) —
		// nothing left to do.
		return nil
	}
	if dlq.TenantID == "" {
		dlq.TenantID = event.TenantID.String()
	}
	if dlq.EnvelopeID == "" {
		dlq.EnvelopeID = event.EnvelopeID.String()
	}
	if dlq.ClientBatchRef == "" && event.BatchID != nil {
		dlq.ClientBatchRef = *event.BatchID
	}
	if dlq.BatchID == "" && event.BatchID != nil {
		dlq.BatchID = *event.BatchID
	}
	savedDLQ, err := s.validator.DLQRepo().Save(ctx, *dlq)
	if err != nil {
		return fmt.Errorf("failed to persist DLQ entry for envelope=%s: %w", event.EnvelopeID, err)
	}
	s.EmitDLQVectorIndexRequest(savedDLQ)
	return nil
}
