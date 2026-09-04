package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Replay status values for relay_publish_failures.
const (
	ReplayStatusPending     = "PENDING"
	ReplayStatusReplaying   = "REPLAYING"
	ReplayStatusReplayed    = "REPLAYED"
	ReplayStatusQuarantined = "QUARANTINED"
)

// Failure sources
const (
	FailureSourceUpstreamOutbox = "UPSTREAM_OUTBOX"
	FailureSourceRelayOutbox    = "RELAY_OUTBOX"
	FailureSourceBatch          = "BATCH"
)

// PublishFailureRepo persists durable records of exhausted Kafka publish
// attempts on the outbox-relay path (P0 6.1.3).
//
// A publish attempt that is abandoned — because the event is poison (never
// publishable) or because retries were exhausted — must never be reduced to
// a log line. The upstream lease for the source event may only be
// acknowledged after either (a) the publish itself succeeded, or (b) a row
// has been durably committed here. A best-effort Kafka DLQ message is not
// sufficient on its own: Kafka may be the very thing that is unreachable.
type PublishFailureRepo struct {
	db *sql.DB
}

func NewPublishFailureRepo(db *sql.DB) *PublishFailureRepo {
	return &PublishFailureRepo{db: db}
}

// PublishFailureRecord is one durable row describing an exhausted publish attempt.
type PublishFailureRecord struct {
	SourceEventID    string
	SourceService    string
	Topic            string // topic carried on the source event, if any
	DestinationTopic string // Kafka topic the publish was attempted against
	PayloadHash      string
	MessageKey       string
	MessageValue     []byte // raw message bytes
	HeadersJSON      []byte
	AttemptCount     int
	FailureClass     string // reason code, e.g. INVALID_PAYLOAD, KAFKA_MAX_RETRIES_EXCEEDED
	LastError        string
	FailureSource    string
	PublishKind      string
	TenantID         string
	TraceID          string
	ReplayStatus     string
}

// FailureSummary is for list API
type FailureSummary struct {
	FailureID        int64     `json:"failure_id"`
	SourceEventID    string    `json:"source_event_id"`
	SourceService    string    `json:"source_service"`
	DestinationTopic string    `json:"destination_topic"`
	AttemptCount     int       `json:"attempt_count"`
	FailureClass     string    `json:"failure_class"`
	ReplayStatus     string    `json:"replay_status"`
	FirstFailureAt   time.Time `json:"first_failure_at"`
	LastFailureAt    time.Time `json:"last_failure_at"`
	TenantID         *string   `json:"tenant_id,omitempty"`
}

// ListFilter for searching failures
type ListFilter struct {
	SourceService string
	ReplayStatus  string
	FailureClass  string
	TenantID      string
	From          time.Time
	To            time.Time
	Limit         int
	Offset        int
}

// Record persists (or refreshes, on re-delivery) one durable failure row.
// Idempotent on (source_service, source_event_id, destination_topic) so a
// crash-and-redeliver of the same poison/exhausted event does not pile up
// duplicate rows — it just refreshes attempt_count/last_error.
//
// Callers MUST treat a non-nil error here as "not durably recorded" and
// must NOT acknowledge the upstream lease for the event in that case.
func (r *PublishFailureRepo) Record(ctx context.Context, rec PublishFailureRecord) error {
	replayStatus := rec.ReplayStatus
	if replayStatus == "" {
		replayStatus = ReplayStatusPending
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO relay_publish_failures (
			source_event_id, source_service, topic, destination_topic,
			payload_hash, message_key, message_value, headers_json,
			attempt_count, failure_class, last_error,
			replay_status, failure_source, publish_kind, tenant_id, trace_id,
			first_failure_at, last_failure_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), now(), now())
		ON CONFLICT (source_service, source_event_id, destination_topic) DO UPDATE SET
			topic          = EXCLUDED.topic,
			payload_hash   = EXCLUDED.payload_hash,
			message_key    = EXCLUDED.message_key,
			message_value  = EXCLUDED.message_value,
			headers_json   = EXCLUDED.headers_json,
			attempt_count  = EXCLUDED.attempt_count,
			failure_class  = EXCLUDED.failure_class,
			last_error     = EXCLUDED.last_error,
			replay_status  = CASE 
								WHEN relay_publish_failures.replay_status = 'REPLAYED' THEN 'REPLAYED'
								ELSE EXCLUDED.replay_status 
							 END,
			last_failure_at = now(),
			updated_at     = now()
	`,
		rec.SourceEventID, rec.SourceService, rec.Topic, rec.DestinationTopic,
		rec.PayloadHash, rec.MessageKey, rec.MessageValue, rec.HeadersJSON,
		rec.AttemptCount, rec.FailureClass, rec.LastError, replayStatus,
		rec.FailureSource, rec.PublishKind, rec.TenantID, rec.TraceID,
	)
	if err != nil {
		return fmt.Errorf("publish_failure_repo: record: %w", err)
	}
	return nil
}

func (r *PublishFailureRepo) GetByID(ctx context.Context, failureID int64) (*PublishFailureRecord, error) {
	var rec PublishFailureRecord
	err := r.db.QueryRowContext(ctx, `
		SELECT source_event_id, source_service, topic, destination_topic,
		       payload_hash, message_key, headers_json, attempt_count,
		       failure_class, last_error, replay_status, failure_source,
		       publish_kind, tenant_id, trace_id
		FROM relay_publish_failures
		WHERE failure_id = $1
	`, failureID).Scan(
		&rec.SourceEventID, &rec.SourceService, &rec.Topic, &rec.DestinationTopic,
		&rec.PayloadHash, &rec.MessageKey, &rec.HeadersJSON, &rec.AttemptCount,
		&rec.FailureClass, &rec.LastError, &rec.ReplayStatus, &rec.FailureSource,
		&rec.PublishKind, &rec.TenantID, &rec.TraceID,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("publish_failure_repo: get by id: %w", err)
	}
	return &rec, nil
}

func (r *PublishFailureRepo) List(ctx context.Context, filter ListFilter) ([]FailureSummary, error) {
	query := `
		SELECT failure_id, source_event_id, source_service, destination_topic,
		       attempt_count, failure_class, replay_status, first_failure_at,
		       last_failure_at, tenant_id
		FROM relay_publish_failures
		WHERE 1=1
	`
	var args []interface{}
	argCount := 1

	if filter.SourceService != "" {
		query += fmt.Sprintf(" AND source_service = $%d", argCount)
		args = append(args, filter.SourceService)
		argCount++
	}
	if filter.ReplayStatus != "" {
		query += fmt.Sprintf(" AND replay_status = $%d", argCount)
		args = append(args, filter.ReplayStatus)
		argCount++
	}
	// ... add other filters as needed

	query += " ORDER BY last_failure_at DESC LIMIT $" + fmt.Sprint(argCount) + " OFFSET $" + fmt.Sprint(argCount+1)
	args = append(args, filter.Limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FailureSummary
	for rows.Next() {
		var s FailureSummary
		if err := rows.Scan(
			&s.FailureID, &s.SourceEventID, &s.SourceService, &s.DestinationTopic,
			&s.AttemptCount, &s.FailureClass, &s.ReplayStatus, &s.FirstFailureAt,
			&s.LastFailureAt, &s.TenantID,
		); err != nil {
			return nil, err
		}
		results = append(results, s)
	}
	return results, nil
}

func (r *PublishFailureRepo) BeginReplay(ctx context.Context, failureID int64) (bool, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE relay_publish_failures
		SET replay_status = 'REPLAYING', updated_at = now()
		WHERE failure_id = $1 AND replay_status = 'PENDING'
	`, failureID)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}

func (r *PublishFailureRepo) CompleteReplay(ctx context.Context, failureID int64, operatorID, reason, outcome, errMsg string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	status := ReplayStatusReplayed
	if outcome == "FAILED" {
		status = ReplayStatusPending
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE relay_publish_failures
		SET replay_status = $2, replayed_at = CASE WHEN $3 = 'SUCCESS' THEN now() ELSE replayed_at END, updated_at = now()
		WHERE failure_id = $1
	`, failureID, status, outcome)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO relay_publish_failure_replays (failure_id, operator_id, reason, outcome, error_message)
		VALUES ($1, $2, $3, $4, $5)
	`, failureID, operatorID, reason, outcome, errMsg)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *PublishFailureRepo) GetMessageForReplay(ctx context.Context, failureID int64) (key string, value []byte, headers []byte, destTopic string, payloadHash string, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT message_key, message_value, headers_json, destination_topic, payload_hash
		FROM relay_publish_failures
		WHERE failure_id = $1
	`, failureID).Scan(&key, &value, &headers, &destTopic, &payloadHash)
	return
}
