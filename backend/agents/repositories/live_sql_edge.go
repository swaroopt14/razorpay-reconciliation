package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (r *LiveSQLRetriever) fetchFromEdge(
	tenantID, traceID string,
	topK int,
	failureOnly bool,
	scope utils.QueryScope,
	includeDuplicateSignals bool,
) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	perTableLimit := topK
	if perTableLimit <= 0 {
		perTableLimit = 5
	}

	out := make([]model.RetrievedChunk, 0, perTableLimit*5)

	// ------------------------------------------------------------------
	// 1) ingress_outbox (highest operational value first)
	// Safe columns only:
	// source, topic, status, attempts, next_retry_at, event_type,
	// created_at, updated_at, published_at, failure_reason_code
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT source, topic, status, attempts,
			       next_retry_at::text, event_type,
			       created_at::text, updated_at::text, published_at::text,
			       failure_reason_code
			FROM ingress_outbox
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if traceID != "" && uuidRegex.MatchString(traceID) {
			q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
			args = append(args, strings.ToLower(traceID))
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR failure_reason_code IS NOT NULL)"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge outbox retrieval failed: %w", err)
		}
		for rows.Next() {
			var source, topic, status, eventType string
			var attempts int
			var nextRetryAt, createdAt, updatedAt, publishedAt, failureReason sql.NullString

			if err := rows.Scan(
				&source, &topic, &status, &attempts,
				&nextRetryAt, &eventType,
				&createdAt, &updatedAt, &publishedAt, &failureReason,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_ingress_outbox",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.99,
				Text: fmt.Sprintf(
					"Ingestion handoff status: source=%s topic=%s status=%s attempts=%d event_type=%s created_at=%s updated_at=%s published_at=%s next_retry_at=%s failure_reason=%s",
					source, topic, status, attempts, eventType,
					nullText(createdAt), nullText(updatedAt), nullText(publishedAt), nullText(nextRetryAt), nullText(failureReason),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 2) ingress_envelopes
	// Safe columns only:
	// ingress_channel, source_class, source_system, content_type,
	// payload_size, status, received_at, file_name, file_size_bytes,
	// row_count_estimate, file_upload_channel
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT ingress_channel, source_class, source_system, content_type,
			       payload_size, status, received_at::text,
			       file_name, file_size_bytes, row_count_estimate, file_upload_channel
			FROM ingress_envelopes
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if traceID != "" && uuidRegex.MatchString(traceID) {
			q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
			args = append(args, strings.ToLower(traceID))
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR status ILIKE '%DLQ%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND received_at >= $%d AND received_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY received_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge envelopes retrieval failed: %w", err)
		}
		for rows.Next() {
			var ingressChannel, sourceClass, sourceSystem, contentType, status, receivedAt string
			var payloadSize int
			var fileName, fileSizeBytes, rowCountEstimate, fileUploadChannel sql.NullString

			if err := rows.Scan(
				&ingressChannel, &sourceClass, &sourceSystem, &contentType,
				&payloadSize, &status, &receivedAt,
				&fileName, &fileSizeBytes, &rowCountEstimate, &fileUploadChannel,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_ingress_envelopes",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.97,
				Text: fmt.Sprintf(
					"Ingress receive status: channel=%s source_class=%s source_system=%s content_type=%s payload_size=%d status=%s received_at=%s file_name=%s file_size_bytes=%s row_count_estimate=%s upload_channel=%s",
					ingressChannel, sourceClass, sourceSystem, contentType, payloadSize, status, receivedAt,
					nullText(fileName), nullText(fileSizeBytes), nullText(rowCountEstimate), nullText(fileUploadChannel),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 3) idempotency_keys
	// Safe columns only:
	// status, resolution_type, conflict_count, source_class_first_seen,
	// first_seen_at, last_seen_at, expires_at, last_conflict_at
	// ------------------------------------------------------------------
	if includeDuplicateSignals {
		args := []any{}
		q := `
			SELECT status, resolution_type, conflict_count, source_class_first_seen,
			       first_seen_at::text, last_seen_at::text, expires_at::text, last_conflict_at::text
			FROM idempotency_keys
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (conflict_count > 0 OR status ILIKE '%FAIL%' OR resolution_type ILIKE '%CONFLICT%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND last_seen_at >= $%d AND last_seen_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY last_seen_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge idempotency retrieval failed: %w", err)
		}
		for rows.Next() {
			var status, resolutionType string
			var conflictCount int
			var sourceClassFirstSeen, firstSeenAt, lastSeenAt, expiresAt, lastConflictAt sql.NullString

			if err := rows.Scan(
				&status, &resolutionType, &conflictCount, &sourceClassFirstSeen,
				&firstSeenAt, &lastSeenAt, &expiresAt, &lastConflictAt,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_idempotency_keys",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.95,
				Text: fmt.Sprintf(
					"Idempotency state: status=%s resolution=%s conflicts=%d source_class=%s first_seen_at=%s last_seen_at=%s expires_at=%s last_conflict_at=%s",
					status, resolutionType, conflictCount, nullText(sourceClassFirstSeen),
					nullText(firstSeenAt), nullText(lastSeenAt), nullText(expiresAt), nullText(lastConflictAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 4) connectors
	// Safe columns only:
	// provider, connector_id, active, created_at, updated_at
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT provider, connector_id, active, created_at::text, updated_at::text
			FROM connectors
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND active = false"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND updated_at >= $%d AND updated_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY updated_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge connectors retrieval failed: %w", err)
		}
		for rows.Next() {
			var provider, connectorID, createdAt, updatedAt string
			var active bool
			if err := rows.Scan(&provider, &connectorID, &active, &createdAt, &updatedAt); err != nil {
				rows.Close()
				return nil, err
			}

			// connector_id is queried (as requested) but not exposed in text to minimize identifier leakage risk.
			_ = connectorID

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_connectors",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Connector configuration: provider=%s active=%t created_at=%s updated_at=%s",
					provider, active, createdAt, updatedAt,
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 5) tenants
	// Safe columns only:
	// tenant_name, is_active, created_at
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT tenant_name, is_active, created_at::text
			FROM tenants
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND is_active = false"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge tenants retrieval failed: %w", err)
		}
		for rows.Next() {
			var tenantName, createdAt string
			var isActive bool
			if err := rows.Scan(&tenantName, &isActive, &createdAt); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_tenants",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.88,
				Text:       fmt.Sprintf("Tenant profile: name=%s active=%t created_at=%s", tenantName, isActive, createdAt),
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
