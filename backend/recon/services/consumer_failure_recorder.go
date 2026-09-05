package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"zord-outcome-engine/kafka"
	"zord-outcome-engine/models"
)

// envelopeMeta is a best-effort partial decode of either an intent or
// dispatch event — both carry event_id/tenant_id/trace_id at the top level.
type envelopeMeta struct {
	EventID  string `json:"event_id"`
	TenantID string `json:"tenant_id"`
	TraceID  string `json:"trace_id"`
}

// NewConsumerFailureRecorder builds the OUT-02 FailureRecorder wired to Postgres.
func NewConsumerFailureRecorder(db *sql.DB) kafka.FailureRecorder {
	return NewFailureRecorder(NewConsumerFailureRepo(db))
}

// NewFailureRecorder builds a kafka.FailureRecorder (OUT-02) that durably
// writes a permanently-failed message to consumer_failure_receipts before
// kafka.ConsumeClaim is allowed to mark it.
func NewFailureRecorder(repo ConsumerFailureRepository) kafka.FailureRecorder {
	return func(ctx context.Context, f kafka.PermanentFailure) error {
		var meta envelopeMeta
		_ = json.Unmarshal(f.Value, &meta)

		headerMap := make(map[string]string, len(f.Headers))
		for _, h := range f.Headers {
			headerMap[string(h.Key)] = string(h.Value)
		}
		headersJSON, _ := json.Marshal(headerMap)

		errorCategory := "PROCESSING_ERROR"
		if meta.EventID == "" && meta.TenantID == "" && meta.TraceID == "" {
			errorCategory = "PAYLOAD_UNMARSHAL_ERROR"
		}

		return repo.Record(ctx, models.ConsumerFailureReceipt{
			IdempotencyKey: FailureIdempotencyKey(meta.EventID, f.Topic, f.Partition, f.Offset),
			EventID:        meta.EventID,
			Topic:          f.Topic,
			Partition:      f.Partition,
			Offset:         f.Offset,
			TenantID:       meta.TenantID,
			TraceID:        meta.TraceID,
			Payload:        f.Value,
			PayloadHash:    HashPayload(f.Value),
			HeadersJSON:    headersJSON,
			ErrorCategory:  errorCategory,
			ErrorMessage:   f.LastError.Error(),
			AttemptCount:   f.Attempts,
			LastAttemptAt:  time.Now().UTC(),
		})
	}
}
