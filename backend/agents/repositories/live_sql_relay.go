package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (r *LiveSQLRetriever) fetchFromRelay(tenantID, intentID, traceID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)

	{
		args := []any{}
		q := `
			SELECT status, attempt_count, retry_class, provider_response_status,
			       next_dispatch_attempt_at::text, created_at::text, updated_at::text, sent_at::text, acked_at::text
			FROM dispatches
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR status ILIKE '%RETRY%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.relayDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("relay dispatches retrieval failed: %w", err)
		}
		for rows.Next() {
			var status string
			var attempt int
			var retryClass, providerStatus, nextAttempt, createdAt, updatedAt, sentAt, ackedAt sql.NullString
			if err := rows.Scan(&status, &attempt, &retryClass, &providerStatus, &nextAttempt, &createdAt, &updatedAt, &sentAt, &ackedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "relay_dispatches",
				Score:      0.93,
				Text: fmt.Sprintf(
					"Relay dispatch status: status=%s attempts=%d retry_class=%s provider_response_status=%s next_retry_at=%s created_at=%s updated_at=%s sent_at=%s acked_at=%s",
					status, attempt, nullText(retryClass), nullText(providerStatus), nullText(nextAttempt),
					nullText(createdAt), nullText(updatedAt), nullText(sentAt), nullText(ackedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT event_type, status, retry_count, created_at::text, published_at::text
			FROM relay_outbox
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR retry_count > 0)"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.relayDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("relay outbox retrieval failed: %w", err)
		}
		for rows.Next() {
			var eventType, status, createdAt string
			var retryCount int
			var publishedAt sql.NullString
			if err := rows.Scan(&eventType, &status, &retryCount, &createdAt, &publishedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "relay_outbox",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Relay event delivery: event_type=%s status=%s retry_count=%d created_at=%s published_at=%s",
					eventType, status, retryCount, createdAt, nullText(publishedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	return out, nil
}
