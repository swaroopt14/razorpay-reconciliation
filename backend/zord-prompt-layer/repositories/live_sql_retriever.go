package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

var uuidRegex = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var batchHintRe = regexp.MustCompile(`(?i)\bbatch(?:_id| id)?\s*[:=]?\s*([A-Za-z0-9._:-]+)\b`)

type LiveSQLRetriever struct {
	edgeDB         *sql.DB
	intentDB       *sql.DB
	relayDB        *sql.DB
	intelligenceDB *sql.DB
	evidenceDB     *sql.DB
	outcomeDB      *sql.DB
	timeout        time.Duration
}

func NewLiveSQLRetriever(edgeDB, intentDB, relayDB, intelligenceDB, evidenceDB, outcomeDB *sql.DB) *LiveSQLRetriever {
	return &LiveSQLRetriever{
		edgeDB:         edgeDB,
		intentDB:       intentDB,
		relayDB:        relayDB,
		intelligenceDB: intelligenceDB,
		outcomeDB:      outcomeDB,
		evidenceDB:     evidenceDB,
		timeout:        4 * time.Second,
	}
}
func isFailureQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "fail") ||
		strings.Contains(s, "failed") ||
		strings.Contains(s, "failure") ||
		strings.Contains(s, "error") ||
		strings.Contains(s, "dlq")
}
func isBatchQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "batch") || strings.Contains(s, "csv") || strings.Contains(s, "upload")
}

func isDuplicateProtectionQuery(q string) bool {
	s := strings.ToLower(q)
	hints := []string{
		"idempotency",
		"duplicate",
		"duplicated",
		"same payment twice",
		"sent twice",
		"replay",
		"conflict",
	}
	for _, h := range hints {
		if strings.Contains(s, h) {
			return true
		}
	}
	return false
}

func extractBatchHint(q string) string {
	m := batchHintRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
func (r *LiveSQLRetriever) Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	tenantID := ""
	effectiveTopK := topK
	if effectiveTopK <= 0 {
		effectiveTopK = 5
	}
	if isBatchQuery(req.Query) && effectiveTopK < 25 {
		effectiveTopK = 25
	}
	if strings.TrimSpace(req.TenantID) != "" {
		resolved, err := r.resolveTenantID(req.TenantID)
		if err != nil {
			return nil, err
		}
		tenantID = resolved
		// If tenant was provided but not found, return empty evidence.
		if tenantID == "" || !uuidRegex.MatchString(tenantID) {
			return []model.RetrievedChunk{}, nil
		}
	}

	failureOnly := isFailureQuery(req.Query)
	includeDuplicateSignals := isDuplicateProtectionQuery(req.Query)
	chunks := make([]model.RetrievedChunk, 0, effectiveTopK*4)

	if r.edgeDB != nil {
		if c, err := r.fetchFromEdge(tenantID, traceID, effectiveTopK, failureOnly, scope, includeDuplicateSignals); err == nil {
			chunks = append(chunks, c...)
		}

	}
	if r.intentDB != nil {
		if c, err := r.fetchFromIntent(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
		if d, err := r.fetchFromIntentDLQ(tenantID, effectiveTopK, scope); err == nil {
			chunks = append(chunks, d...)
		}
		if b, err := r.fetchBatchIntentSummary(tenantID, req.Query, scope); err == nil {
			chunks = append(chunks, b...)
		}
	}
	if r.relayDB != nil {
		if c, err := r.fetchFromRelay(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	if r.intelligenceDB != nil {
		if c, err := r.fetchFromIntelligence(tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}
	if r.outcomeDB != nil {
		if c, err := r.fetchFromOutcome(tenantID, effectiveTopK, scope); err == nil {
			chunks = append(chunks, c...)
		} else {
			log.Printf("[prompt-layer][outcome-db] retrieval failed tenant=%s err=%v", tenantID, err)
		}
	}
	if r.evidenceDB != nil {
		if c, err := r.fetchFromEvidence(tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	finalTopK := topK
	if finalTopK <= 0 {
		finalTopK = 5
	}
	if isBatchQuery(req.Query) && finalTopK < 20 {
		finalTopK = 20
	}
	chunks = rankAndTrimBalanced(chunks, finalTopK)
	return chunks, nil

}

func (r *LiveSQLRetriever) resolveTenantID(input string) (string, error) {
	if uuidRegex.MatchString(input) {
		return strings.ToLower(input), nil
	}
	if r.edgeDB == nil {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	var tenantID string
	err := r.edgeDB.QueryRowContext(ctx, `
		SELECT tenant_id::text
		FROM tenants
		WHERE tenant_name = $1
		LIMIT 1
	`, input).Scan(&tenantID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("tenant resolution failed: %w", err)
	}
	return strings.ToLower(tenantID), nil
}

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

func nullText(v sql.NullString) string {
	if !v.Valid || strings.TrimSpace(v.String) == "" {
		return "-"
	}
	return v.String
}

func (r *LiveSQLRetriever) fetchFromIntent(tenantID, intentID, traceID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	args := []any{}
	q := `
		SELECT intent_id::text, envelope_id::text, trace_id::text, status, intent_type,
		       amount::text, currency, confidence_score::text, created_at::text
		FROM payment_intents
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if intentID != "" && uuidRegex.MatchString(intentID) {
		q += fmt.Sprintf(" AND intent_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(intentID))
	}
	if traceID != "" && uuidRegex.MatchString(traceID) {
		q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(traceID))
	}
	if failureOnly {
		q += " AND status ILIKE '%FAIL%'"
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("intent retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, topK*2)
	for rows.Next() {
		var id, envelopeID, tr, status, intentType, amount, currency, createdAt string
		var confidence sql.NullString

		if err := rows.Scan(&id, &envelopeID, &tr, &status, &intentType, &amount, &currency, &confidence, &createdAt); err != nil {
			return nil, err
		}

		confidenceVal := "null"
		if confidence.Valid {
			confidenceVal = confidence.String
		}

		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_payment_intents",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			Score:      1.0,
			Text: fmt.Sprintf("Intent event: status=%s type=%s amount=%s %s confidence=%s created_at=%s",
				status, intentType, amount, currency, confidenceVal, createdAt),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	args = []any{}
	q = `
		SELECT event_id::text, aggregate_id::text, trace_id::text, event_type, status, retry_count::text, created_at::text, sent_at::text
		FROM outbox
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if intentID != "" && uuidRegex.MatchString(intentID) {
		q += fmt.Sprintf(" AND aggregate_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(intentID))
	}
	if traceID != "" && uuidRegex.MatchString(traceID) {
		q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(traceID))
	}
	if failureOnly {
		q += " AND status ILIKE '%FAIL%'"
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows2, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("outbox retrieval failed: %w", err)
	}
	defer rows2.Close()

	for rows2.Next() {
		var eventID, aggID, tr, eventType, status, retryCount, createdAt, sentAt sql.NullString
		if err := rows2.Scan(&eventID, &aggID, &tr, &eventType, &status, &retryCount, &createdAt, &sentAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_outbox",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			Score:      0.95,
			Text: fmt.Sprintf("Outbox event: event_type=%s status=%s retry_count=%s created_at=%s sent_at=%s",
				eventType.String, status.String, retryCount.String, createdAt.String, sentAt.String),
		})
	}
	return out, rows2.Err()
}
func (r *LiveSQLRetriever) fetchBatchIntentSummary(tenantID, userQuery string, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	batchID := extractBatchHint(userQuery)
	if tenantID == "" {
		return []model.RetrievedChunk{}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	out := make([]model.RetrievedChunk, 0, 3)

	if batchID != "" {
		// Specific batch aggregate snapshot
		{
			var received, canonicalized, dlqCount, reviewCount, lowMatch, lowProof, dupRisk int
			var successRate, avgQuality, batchQuality, updatedAt sql.NullString

			err := r.intentDB.QueryRowContext(ctx, `
				SELECT
					received_count,
					canonicalized_count,
					dlq_count,
					review_count,
					low_matchability_count,
					low_proof_readiness_count,
					duplicate_risk_count,
					canonicalization_success_rate::text,
					avg_intent_quality_score::text,
					batch_quality_score::text,
					updated_at::text
				FROM canonical_batches
				WHERE tenant_id::text = $1 AND batch_id = $2
				AND ($3::timestamptz IS NULL OR updated_at >= $3)
				AND ($4::timestamptz IS NULL OR updated_at < $4)
				LIMIT 1
			`, tenantID, batchID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime)).Scan(
				&received, &canonicalized, &dlqCount, &reviewCount, &lowMatch, &lowProof, &dupRisk,
				&successRate, &avgQuality, &batchQuality, &updatedAt,
			)

			if err == nil {
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_canonical_batches",
					Score:      1.0,
					Text: fmt.Sprintf(
						"Batch quality summary: batch_id=%s received=%d canonicalized=%d dlq=%d review=%d low_matchability=%d low_proof_readiness=%d duplicate_risk_count=%d canonicalization_success_rate=%s avg_intent_quality_score=%s batch_quality_score=%s updated_at=%s",
						batchID, received, canonicalized, dlqCount, reviewCount, lowMatch, lowProof, dupRisk,
						nullText(successRate), nullText(avgQuality), nullText(batchQuality), nullText(updatedAt),
					),
				})
			}
		}
	} else {
		// No explicit batch_id in query: include latest tenant batch snapshots for broader batch CSV context.
		rows, err := r.intentDB.QueryContext(ctx, `
			SELECT batch_id, received_count, canonicalized_count, dlq_count, review_count, batch_quality_score::text, updated_at::text
			FROM canonical_batches
			WHERE tenant_id::text = $1
			  AND ($2::timestamptz IS NULL OR updated_at >= $2)
			  AND ($3::timestamptz IS NULL OR updated_at < $3)
			ORDER BY updated_at DESC
			LIMIT 5
		`, tenantID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id string
				var received, canonicalized, dlqCount, reviewCount int
				var batchQuality, updatedAt sql.NullString
				if scanErr := rows.Scan(&id, &received, &canonicalized, &dlqCount, &reviewCount, &batchQuality, &updatedAt); scanErr != nil {
					continue
				}
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_canonical_batches_recent",
					Score:      0.98,
					Text: fmt.Sprintf(
						"Recent batch summary: batch_id=%s received=%d canonicalized=%d dlq=%d review=%d batch_quality_score=%s updated_at=%s",
						id, received, canonicalized, dlqCount, reviewCount, nullText(batchQuality), nullText(updatedAt),
					),
				})
			}
		}
	}

	// Per-status distribution across intents (specific batch when provided, else tenant window)
	{
		var (
			rows *sql.Rows
			err  error
		)
		if batchID != "" {
			rows, err = r.intentDB.QueryContext(ctx, `
				SELECT status, COUNT(*)::int
				FROM payment_intents
				WHERE tenant_id::text = $1 AND batchid = $2
				  AND ($3::timestamptz IS NULL OR created_at >= $3)
				  AND ($4::timestamptz IS NULL OR created_at < $4)
				GROUP BY status
				ORDER BY COUNT(*) DESC
			`, tenantID, batchID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		} else {
			rows, err = r.intentDB.QueryContext(ctx, `
				SELECT status, COUNT(*)::int
				FROM payment_intents
				WHERE tenant_id::text = $1
				  AND ($2::timestamptz IS NULL OR created_at >= $2)
				  AND ($3::timestamptz IS NULL OR created_at < $3)
				GROUP BY status
				ORDER BY COUNT(*) DESC
			`, tenantID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		}
		if err == nil {
			defer rows.Close()
			parts := make([]string, 0, 8)
			total := 0
			for rows.Next() {
				var status string
				var cnt int
				if err := rows.Scan(&status, &cnt); err != nil {
					continue
				}
				total += cnt
				parts = append(parts, fmt.Sprintf("%s=%d", status, cnt))
			}
			if len(parts) > 0 {
				label := "Tenant batch intent distribution"
				if batchID != "" {
					label = "Batch intent distribution: batch_id=" + batchID
				}
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_batch_status_distribution",
					Score:      0.99,
					Text:       fmt.Sprintf("%s total_intents=%d status_breakdown=%s", label, total, strings.Join(parts, ", ")),
				})
			}
		}
	}

	return out, nil
}

func nullableTS(t time.Time, enabled bool) any {
	if !enabled {
		return nil
	}
	return t
}
func (r *LiveSQLRetriever) fetchFromIntentDLQ(tenantID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	args := []any{}
	q := `
		SELECT dlq_id::text, tenant_id::text, envelope_id::text, stage, reason_code, error_detail, replayable::text, created_at::text
		FROM dlq_items
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	// dlq_items are already failure records; no extra failureOnly condition needed
	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("intent dlq retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, topK)
	for rows.Next() {
		var dlqID, tID, envelopeID, stage, reasonCode, errorDetail, replayable, createdAt sql.NullString
		if err := rows.Scan(&dlqID, &tID, &envelopeID, &stage, &reasonCode, &errorDetail, &replayable, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_dlq_items",
			RecordID:   "",
			TenantID:   "",
			Score:      0.97,
			Text: fmt.Sprintf("DLQ item: stage=%s reason_code=%s replayable=%s created_at=%s error_detail=%s",
				stage.String, reasonCode.String, replayable.String, createdAt.String, errorDetail.String),
		})
	}
	return out, rows.Err()
}

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
func (r *LiveSQLRetriever) fetchFromIntelligence(tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}

	limit := topK
	out := make([]model.RetrievedChunk, 0, limit*5)

	log.Printf("[prompt-layer][intelligence-db] retrieval start tenant=%s limit=%d time_scoped=%t", tenantID, limit, scope.HasExplicitTime)

	// 1) batch_contracts: authoritative current batch/business state.
	{
		args := []any{}
		q := `
			SELECT
				batch_finality_status,
				total_count,
				success_count,
				failed_count,
				pending_count,
				reversed_count,
				partial_recon_count,
				total_intended_amount_minor::text,
				total_confirmed_amount_minor::text,
				total_variance_minor::text,
				unmatched_amount_minor::text,
				orphan_amount_minor::text,
				duplicate_risk_exposure_minor::text,
				missing_ref_count,
				unexplained_variance_minor::text,
				whitelisted_deduction_minor::text,
				ambiguity_score::text,
				defensibility_tier,
				last_updated_at::text,
				created_at::text
			FROM batch_contracts
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (failed_count > 0 OR pending_count > 0 OR unmatched_amount_minor > 0 OR orphan_amount_minor > 0 OR unexplained_variance_minor > 0 OR batch_finality_status IN ('FAILED','REQUIRES_REVIEW','PARTIALLY_SETTLED'))"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND last_updated_at >= $%d AND last_updated_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY last_updated_at DESC LIMIT %d", limit)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			log.Printf("[prompt-layer][intelligence-db] batch_contracts query failed tenant=%s err=%v", tenantID, err)
		} else {
			count := 0
			for rows.Next() {
				var (
					status, intended, confirmed, variance, unmatched, orphan, duplicateRisk string
					unexplained, whitelisted, ambiguityScore                                sql.NullString
					proofTier, updatedAt, createdAt                                         sql.NullString
					total, success, failed, pending, reversed, partialRecon, missingRefs    int
				)

				if err := rows.Scan(
					&status,
					&total,
					&success,
					&failed,
					&pending,
					&reversed,
					&partialRecon,
					&intended,
					&confirmed,
					&variance,
					&unmatched,
					&orphan,
					&duplicateRisk,
					&missingRefs,
					&unexplained,
					&whitelisted,
					&ambiguityScore,
					&proofTier,
					&updatedAt,
					&createdAt,
				); err != nil {
					log.Printf("[prompt-layer][intelligence-db] batch_contracts scan failed tenant=%s err=%v", tenantID, err)
					continue
				}

				text := strings.Join(nonEmptyParts([]string{
					"Batch business summary",
					"Status: " + status,
					fmt.Sprintf("Total payments: %d", total),
					fmt.Sprintf("Successful payments: %d", success),
					fmt.Sprintf("Failed payments: %d", failed),
					fmt.Sprintf("Pending payments: %d", pending),
					fmt.Sprintf("Reversed payments: %d", reversed),
					fmt.Sprintf("Partially reconciled payments: %d", partialRecon),
					"Total instructed value: " + moneyFromMinor(intended),
					"Confirmed settlement value: " + moneyFromMinor(confirmed),
					"Payment value difference: " + moneyFromMinor(variance),
					"Unmatched payment value: " + moneyFromMinor(unmatched),
					"Unlinked settlement value: " + moneyFromMinor(orphan),
					"Duplicate risk exposure: " + moneyFromMinor(duplicateRisk),
					fmt.Sprintf("Payments missing bank/PSP references: %d", missingRefs),
					"Unexplained value difference: " + moneyFromMinor(nullText(unexplained)),
					"Expected deduction value: " + moneyFromMinor(nullText(whitelisted)),
					"Match review score: " + safeOptional(nullText(ambiguityScore)),
					"Proof readiness level: " + safeOptional(nullText(proofTier)),
					"Updated: " + readableTime(nullText(updatedAt)),
					"Created: " + readableTime(nullText(createdAt)),
				}), " · ")

				out = append(out, model.RetrievedChunk{
					ChunkID:    "",
					SourceType: "intelligence_batch_contracts",
					RecordID:   "",
					IntentID:   "",
					TraceID:    "",
					TenantID:   "",
					Score:      0.98,
					Text:       text,
				})
				count++
			}
			if err := rows.Err(); err != nil {
				log.Printf("[prompt-layer][intelligence-db] batch_contracts rows failed tenant=%s err=%v", tenantID, err)
			}
			rows.Close()
			log.Printf("[prompt-layer][intelligence-db] batch_contracts chunks=%d tenant=%s", count, tenantID)
		}
	}

	// 2) projection_state: time-windowed business metrics, converted from JSONB into safe labels.
	{
		args := []any{}
		q := `
			SELECT projection_family, value_json::text, window_start::text, window_end::text, computed_at::text
			FROM projection_state
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND computed_at >= $%d AND computed_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY computed_at DESC LIMIT %d", limit)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			log.Printf("[prompt-layer][intelligence-db] projection_state query failed tenant=%s err=%v", tenantID, err)
		} else {
			count := 0
			for rows.Next() {
				var family, valueJSON, windowStart, windowEnd, computedAt sql.NullString
				if err := rows.Scan(&family, &valueJSON, &windowStart, &windowEnd, &computedAt); err != nil {
					log.Printf("[prompt-layer][intelligence-db] projection_state scan failed tenant=%s err=%v", tenantID, err)
					continue
				}

				summary := summarizeBusinessJSON(valueJSON.String)
				if strings.TrimSpace(summary) == "" {
					continue
				}

				text := strings.Join(nonEmptyParts([]string{
					"Intelligence metric summary",
					"Metric family: " + safeOptional(nullText(family)),
					summary,
					"Window start: " + readableTime(nullText(windowStart)),
					"Window end: " + readableTime(nullText(windowEnd)),
					"Computed: " + readableTime(nullText(computedAt)),
				}), " · ")

				out = append(out, model.RetrievedChunk{
					ChunkID:    "",
					SourceType: "intelligence_projection_state",
					RecordID:   "",
					IntentID:   "",
					TraceID:    "",
					TenantID:   "",
					Score:      0.92,
					Text:       text,
				})
				count++
			}
			if err := rows.Err(); err != nil {
				log.Printf("[prompt-layer][intelligence-db] projection_state rows failed tenant=%s err=%v", tenantID, err)
			}
			rows.Close()
			log.Printf("[prompt-layer][intelligence-db] projection_state chunks=%d tenant=%s", count, tenantID)
		}
	}

	// 3) intelligence_snapshots: latest summarized intelligence views.
	{
		args := []any{}
		q := `
			SELECT snapshot_type, scope_type, snapshot_json::text, window_start::text, window_end::text, model_version, created_at::text
			FROM intelligence_snapshots
			WHERE 1=1
			  AND snapshot_type IN ('LEAKAGE','AMBIGUITY','DEFENSIBILITY','RCA','RCA_CLUSTER','PATTERN','RECOMMENDATION')
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", limit)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			log.Printf("[prompt-layer][intelligence-db] intelligence_snapshots query failed tenant=%s err=%v", tenantID, err)
		} else {
			count := 0
			for rows.Next() {
				var snapType, scopeType, snapshotJSON, windowStart, windowEnd, modelVersion, createdAt sql.NullString
				if err := rows.Scan(&snapType, &scopeType, &snapshotJSON, &windowStart, &windowEnd, &modelVersion, &createdAt); err != nil {
					log.Printf("[prompt-layer][intelligence-db] intelligence_snapshots scan failed tenant=%s err=%v", tenantID, err)
					continue
				}

				summary := summarizeBusinessJSON(snapshotJSON.String)
				if strings.TrimSpace(summary) == "" {
					summary = "Summary data is available but does not contain display-safe business fields."
				}

				text := strings.Join(nonEmptyParts([]string{
					"Intelligence snapshot summary",
					"Type: " + safeOptional(nullText(snapType)),
					"Scope: " + safeOptional(nullText(scopeType)),
					summary,
					"Window start: " + readableTime(nullText(windowStart)),
					"Window end: " + readableTime(nullText(windowEnd)),
					"Computed by: " + safeOptional(nullText(modelVersion)),
					"Created: " + readableTime(nullText(createdAt)),
				}), " · ")

				out = append(out, model.RetrievedChunk{
					ChunkID:    "",
					SourceType: "intelligence_snapshots",
					RecordID:   "",
					IntentID:   "",
					TraceID:    "",
					TenantID:   "",
					Score:      0.89,
					Text:       text,
				})
				count++
			}
			if err := rows.Err(); err != nil {
				log.Printf("[prompt-layer][intelligence-db] intelligence_snapshots rows failed tenant=%s err=%v", tenantID, err)
			}
			rows.Close()
			log.Printf("[prompt-layer][intelligence-db] intelligence_snapshots chunks=%d tenant=%s", count, tenantID)
		}
	}

	// 4) action_contracts: supported operational next actions.
	{
		args := []any{}
		q := `
			SELECT decision, confidence::text, contract_status, policy_family, severity, created_at::text
			FROM action_contracts
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (severity = 'HIGH' OR contract_status ILIKE '%PENDING%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", limit)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			log.Printf("[prompt-layer][intelligence-db] action_contracts query failed tenant=%s err=%v", tenantID, err)
		} else {
			count := 0
			for rows.Next() {
				var decision, confidence, status, family, severity, createdAt sql.NullString
				if err := rows.Scan(&decision, &confidence, &status, &family, &severity, &createdAt); err != nil {
					log.Printf("[prompt-layer][intelligence-db] action_contracts scan failed tenant=%s err=%v", tenantID, err)
					continue
				}

				text := strings.Join(nonEmptyParts([]string{
					"Recommended action",
					"Action: " + businessAction(nullText(decision)),
					"Confidence: " + safeOptional(nullText(confidence)),
					"Status: " + safeOptional(nullText(status)),
					"Area: " + safeOptional(nullText(family)),
					"Severity: " + safeOptional(nullText(severity)),
					"Created: " + readableTime(nullText(createdAt)),
				}), " · ")

				out = append(out, model.RetrievedChunk{
					ChunkID:    "",
					SourceType: "intelligence_action_contracts",
					RecordID:   "",
					IntentID:   "",
					TraceID:    "",
					TenantID:   "",
					Score:      0.88,
					Text:       text,
				})
				count++
			}
			if err := rows.Err(); err != nil {
				log.Printf("[prompt-layer][intelligence-db] action_contracts rows failed tenant=%s err=%v", tenantID, err)
			}
			rows.Close()
			log.Printf("[prompt-layer][intelligence-db] action_contracts chunks=%d tenant=%s", count, tenantID)
		}

	}

	// 5) intelligence_explanations: safe narrative context linked to computed intelligence.
	{
		args := []any{}
		q := `
			SELECT explanation_type, explanation_text, model_version, created_at::text
			FROM intelligence_explanations
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", limit)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			log.Printf("[prompt-layer][intelligence-db] intelligence_explanations query failed tenant=%s err=%v", tenantID, err)
		} else {
			count := 0
			for rows.Next() {
				var explanationType, explanationText, modelVersion, createdAt sql.NullString
				if err := rows.Scan(&explanationType, &explanationText, &modelVersion, &createdAt); err != nil {
					log.Printf("[prompt-layer][intelligence-db] intelligence_explanations scan failed tenant=%s err=%v", tenantID, err)
					continue
				}

				cleanExplanation := strings.TrimSpace(nullText(explanationText))
				if cleanExplanation == "-" {
					continue
				}

				text := strings.Join(nonEmptyParts([]string{
					"Intelligence explanation",
					"Type: " + safeOptional(nullText(explanationType)),
					"Explanation: " + cleanExplanation,
					"Computed by: " + safeOptional(nullText(modelVersion)),
					"Created: " + readableTime(nullText(createdAt)),
				}), " · ")

				out = append(out, model.RetrievedChunk{
					ChunkID:    "",
					SourceType: "intelligence_explanations",
					RecordID:   "",
					IntentID:   "",
					TraceID:    "",
					TenantID:   "",
					Score:      0.84,
					Text:       text,
				})
				count++
			}
			if err := rows.Err(); err != nil {
				log.Printf("[prompt-layer][intelligence-db] intelligence_explanations rows failed tenant=%s err=%v", tenantID, err)
			}
			rows.Close()
			log.Printf("[prompt-layer][intelligence-db] intelligence_explanations chunks=%d tenant=%s", count, tenantID)
		}
	}

	log.Printf("[prompt-layer][intelligence-db] retrieval done tenant=%s chunks=%d", tenantID, len(out))
	return out, nil
}
func nonEmptyParts(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || strings.HasSuffix(p, ": -") || strings.HasSuffix(p, ":") {
			continue
		}
		out = append(out, p)
	}
	return out
}

func safeOptional(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || v == "-" || strings.EqualFold(v, "null") || strings.EqualFold(v, "<nil>") {
		return "Not available"
	}
	return v
}

func moneyFromMinor(raw string) string {
	return exactDBMoneyValue(raw)
}

func exactDBMoneyValue(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") || strings.EqualFold(raw, "<nil>") {
		return "Not available"
	}
	return "INR " + raw
}

func readableTime(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") {
		return "Not available"
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05.999999-07:00",
		"2006-01-02 15:04:05.999999999-07",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.In(time.FixedZone("IST", 5*60*60+30*60)).Format("02 Jan 2006, 03:04 PM IST")
		}
	}

	if len(raw) >= 10 {
		return raw[:10]
	}
	return raw
}

func businessAction(decision string) string {
	switch strings.ToUpper(strings.TrimSpace(decision)) {
	case "ALLOW":
		return "Allowed to proceed"
	case "ESCALATE":
		return "Escalate for review"
	case "NOTIFY":
		return "Notify the responsible team"
	case "HOLD":
		return "Hold until reviewed"
	case "RETRY":
		return "Retry processing"
	case "GENERATE_EVIDENCE":
		return "Generate evidence pack"
	case "OPEN_OPS_INCIDENT":
		return "Open operations incident"
	case "ADVISORY_RECOMMENDATION":
		return "Review recommendation"
	case "PREPARE_AND_SIGN_RECOMMENDED":
		return "Prepare and sign recommended proof"
	case "DISPATCH_MODE_RECOMMENDED":
		return "Review dispatch mode recommendation"
	case "REQUEST_SOURCE_PATCH":
		return "Request source data correction"
	case "REVIEW_AMBIGUOUS_BATCH":
		return "Review unclear batch matches"
	case "REGENERATE_EVIDENCE":
		return "Regenerate evidence"
	case "REQUEST_STRONGER_CARRIER_CONTRACT":
		return "Request stronger reference data"
	default:
		return safeOptional(decision)
	}
}

func summarizeBusinessJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" || raw == "[]" {
		return ""
	}

	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()

	var value any
	if err := decoder.Decode(&value); err != nil {
		return ""
	}

	parts := make([]string, 0, 12)
	collectBusinessJSONParts("", value, &parts)

	if len(parts) == 0 {
		return ""
	}
	if len(parts) > 12 {
		parts = parts[:12]
	}
	return strings.Join(parts, " · ")
}

func collectBusinessJSONParts(prefix string, value any, parts *[]string) {
	if len(*parts) >= 12 {
		return
	}

	switch v := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			if isUnsafeIntelligenceJSONKey(k) {
				continue
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)

		for _, k := range keys {
			nextPrefix := k
			if prefix != "" {
				nextPrefix = prefix + "." + k
			}
			collectBusinessJSONParts(nextPrefix, v[k], parts)
			if len(*parts) >= 12 {
				return
			}
		}

	case []any:
		if len(v) == 0 {
			return
		}
		*parts = append(*parts, fmt.Sprintf("%s: %d item(s)", businessMetricLabel(prefix), len(v)))

	case string:
		v = strings.TrimSpace(v)
		if v == "" || uuidRegex.MatchString(v) {
			return
		}
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), v))

	case json.Number:
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), businessNumber(prefix, v.String())))

	case float64:
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), businessNumber(prefix, strconv.FormatFloat(v, 'f', -1, 64))))

	case bool:
		*parts = append(*parts, fmt.Sprintf("%s: %t", businessMetricLabel(prefix), v))
	}
}

func isUnsafeIntelligenceJSONKey(key string) bool {
	k := strings.ToLower(strings.TrimSpace(key))
	if k == "" {
		return true
	}

	unsafeFragments := []string{
		"id",
		"tenant",
		"snapshot",
		"projection_ref",
		"scope_ref",
		"trace",
		"hash",
		"signature",
		"token",
		"secret",
		"encrypted",
		"raw",
		"payload",
	}

	for _, fragment := range unsafeFragments {
		if strings.Contains(k, fragment) {
			return true
		}
	}
	return false
}

func businessMetricLabel(key string) string {
	k := strings.ToLower(strings.TrimSpace(key))
	k = strings.TrimPrefix(k, ".")

	labels := map[string]string{
		"unmatched_amount_minor":        "Unmatched payment value",
		"orphan_amount_minor":           "Unlinked settlement value",
		"total_variance_minor":          "Payment value difference",
		"unexplained_variance_minor":    "Unexplained value difference",
		"whitelisted_deduction_minor":   "Expected deduction value",
		"duplicate_risk_exposure_minor": "Duplicate risk exposure",
		"risk_adjusted_leakage_minor":   "Value needing review",
		"ambiguous_value_at_risk":       "Unclear payment value",
		"ambiguous_amount_minor":        "Unclear payment value",
		"provider_ref_missing_rate":     "Missing bank/PSP reference rate",
		"missing_ref_count":             "Payments missing bank/PSP references",
		"avg_attachment_confidence":     "Average match confidence",
		"ambiguity_rate":                "Review rate",
		"ambiguous_intent_count":        "Payments needing match review",
		"candidate_collision_rate":      "Multiple match possibility rate",
		"carrier_completeness_rate":     "Reference completeness rate",
		"evidence_pack_coverage":        "Evidence coverage",
		"governance_coverage":           "Governance check coverage",
		"defensibility_score":           "Proof readiness score",
		"batch_anomaly_score":           "Batch anomaly score",
		"cluster_count":                 "RCA cluster count",
		"clustered_points":              "Clustered RCA points",
		"noise_points":                  "Unclustered RCA points",
		"total_affected_amount_minor":   "Total affected value",
		"total_points":                  "Total RCA points",
		"failed_count":                  "Failed payments",
		"pending_count":                 "Pending payments",
		"success_count":                 "Successful payments",
		"total_count":                   "Total payments",
		"total_intended_amount_minor":   "Total instructed value",
		"total_confirmed_amount_minor":  "Confirmed settlement value",
	}

	if label, ok := labels[k]; ok {
		return label
	}

	clean := strings.ReplaceAll(k, "_", " ")
	clean = strings.ReplaceAll(clean, ".", " ")
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return "Metric"
	}
	return strings.Title(clean)
}

func businessNumber(key string, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") || strings.EqualFold(raw, "<nil>") {
		return "Not available"
	}

	k := strings.ToLower(key)
	if strings.Contains(k, "_minor") || strings.Contains(k, "amount_minor") || strings.Contains(k, "value_minor") {
		return exactDBMoneyValue(raw)
	}

	return raw
}
func (r *LiveSQLRetriever) fetchFromOutcome(tenantID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}

	limit := topK
	if limit < 10 {
		limit = 10
	}

	args := []any{}
	q := `
		WITH latest_summaries AS (
			SELECT
				batch_id,
				source_reference,
				total_intent_count::text,
				exact_match_count::text,
				high_confidence_count::text,
				ambiguous_count::text,
				unresolved_count::text,
				conflicted_count::text,
				original_intended_amount::text,
				original_settled_amount::text,
				total_intended_amount::text,
				total_observed_amount::text,
				total_variance::text,
				unresolved_intended_amount::text,
				ambiguous_observed_amount::text,
				conflicted_observed_amount::text,
				unresolved_observed_amount::text,
				net_unexplained_variance::text,
				batch_attachment_status,
				avg_matched_attachment_quality::text,
				avg_matched_attachment_confidence::text,
				avg_matched_attachment_ambiguity::text,
				created_at::text,
				updated_at::text,
				ROW_NUMBER() OVER (
					PARTITION BY COALESCE(NULLIF(batch_id, ''), source_reference)
					ORDER BY updated_at DESC, created_at DESC
				) AS rn
			FROM batch_attachment_summaries
			WHERE 1=1
	`

	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(`
		)
		SELECT
			batch_id,
			source_reference,
			total_intent_count,
			exact_match_count,
			high_confidence_count,
			ambiguous_count,
			unresolved_count,
			conflicted_count,
			original_intended_amount,
			original_settled_amount,
			total_intended_amount,
			total_observed_amount,
			total_variance,
			unresolved_intended_amount,
			ambiguous_observed_amount,
			conflicted_observed_amount,
			unresolved_observed_amount,
			net_unexplained_variance,
			batch_attachment_status,
			avg_matched_attachment_quality,
			avg_matched_attachment_confidence,
			avg_matched_attachment_ambiguity,
			created_at,
			updated_at
		FROM latest_summaries
		WHERE rn = 1
		ORDER BY updated_at DESC, created_at DESC
		LIMIT %d
	`, limit)

	rows, err := r.outcomeDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("outcome batch attachment summary retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, limit)
	for rows.Next() {
		var (
			batchID, sourceReference                                                                                 sql.NullString
			totalIntentCount, exactMatchCount, highConfidenceCount, ambiguousCount, unresolvedCount, conflictedCount sql.NullString
			originalIntendedAmount, originalSettledAmount, totalIntendedAmount, totalObservedAmount, totalVariance   sql.NullString
			unresolvedIntendedAmount, ambiguousObservedAmount, conflictedObservedAmount, unresolvedObservedAmount    sql.NullString
			netUnexplainedVariance, status, aggregateScore, aggregateMatchConfidence, ambiguityScore                 sql.NullString
			createdAt, updatedAt                                                                                     sql.NullString
		)

		if err := rows.Scan(
			&batchID,
			&sourceReference,
			&totalIntentCount,
			&exactMatchCount,
			&highConfidenceCount,
			&ambiguousCount,
			&unresolvedCount,
			&conflictedCount,
			&originalIntendedAmount,
			&originalSettledAmount,
			&totalIntendedAmount,
			&totalObservedAmount,
			&totalVariance,
			&unresolvedIntendedAmount,
			&ambiguousObservedAmount,
			&conflictedObservedAmount,
			&unresolvedObservedAmount,
			&netUnexplainedVariance,
			&status,
			&aggregateScore,
			&aggregateMatchConfidence,
			&ambiguityScore,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, err
		}

		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "outcome_batch_attachment_summary",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			Score:      1.0,
			Text: fmt.Sprintf(
				"Outcome settlement matching summary: batch_reference=%s source_reference=%s payment_instructions_covered=%s exact_matches=%s high_confidence_matches=%s ambiguous_matches=%s unresolved_payments=%s conflicted_payments=%s original_intended_value=%s original_settled_value=%s total_intended_value=%s total_observed_value=%s payment_value_difference=%s unresolved_payment_value=%s ambiguous_observed_value=%s conflicted_observed_value=%s unresolved_observed_value=%s net_unexplained_value=%s status=%s average_match_quality=%s match_confidence=%s match_ambiguity=%s created_at=%s updated_at=%s",
				nullText(batchID),
				nullText(sourceReference),
				nullText(totalIntentCount),
				nullText(exactMatchCount),
				nullText(highConfidenceCount),
				nullText(ambiguousCount),
				nullText(unresolvedCount),
				nullText(conflictedCount),
				exactDBMoneyValue(nullText(originalIntendedAmount)),
				exactDBMoneyValue(nullText(originalSettledAmount)),
				exactDBMoneyValue(nullText(totalIntendedAmount)),
				exactDBMoneyValue(nullText(totalObservedAmount)),
				exactDBMoneyValue(nullText(totalVariance)),
				exactDBMoneyValue(nullText(unresolvedIntendedAmount)),
				exactDBMoneyValue(nullText(ambiguousObservedAmount)),
				exactDBMoneyValue(nullText(conflictedObservedAmount)),
				exactDBMoneyValue(nullText(unresolvedObservedAmount)),
				exactDBMoneyValue(nullText(netUnexplainedVariance)),
				nullText(status),
				nullText(aggregateScore),
				nullText(aggregateMatchConfidence),
				nullText(ambiguityScore),
				readableTime(nullText(createdAt)),
				readableTime(nullText(updatedAt)),
			),
		})
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	log.Printf("[prompt-layer][outcome-db] batch_attachment_summaries chunks=%d tenant=%s", len(out), tenantID)
	return out, nil
}
func (r *LiveSQLRetriever) fetchFromEvidence(tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)

	{
		args := []any{}
		q := `
			SELECT mode, pack_status, ruleset_version, signature_alg, replay_equivalence_status, created_at::text, updated_at::text
			FROM evidence_packs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (pack_status ILIKE '%FAILED%' OR replay_equivalence_status ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence packs retrieval failed: %w", err)
		}
		for rows.Next() {
			var mode, packStatus, rulesetVersion, signatureAlg, replayStatus, createdAt, updatedAt sql.NullString
			if err := rows.Scan(&mode, &packStatus, &rulesetVersion, &signatureAlg, &replayStatus, &createdAt, &updatedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_packs",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Evidence pack status: mode=%s pack_status=%s ruleset_version=%s signature_algorithm=%s replay_status=%s created_at=%s updated_at=%s",
					nullText(mode), nullText(packStatus), nullText(rulesetVersion), nullText(signatureAlg), nullText(replayStatus), nullText(createdAt), nullText(updatedAt),
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
			SELECT status, ruleset_version, equivalence_result, created_at::text, completed_at::text
			FROM evidence_replay_jobs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR equivalence_result ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence replay retrieval failed: %w", err)
		}
		for rows.Next() {
			var status, rulesetVersion, equivalence, createdAt, completedAt sql.NullString
			if err := rows.Scan(&status, &rulesetVersion, &equivalence, &createdAt, &completedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_replay_jobs",
				Score:      0.86,
				Text: fmt.Sprintf(
					"Evidence replay job: status=%s ruleset_version=%s equivalence_result=%s created_at=%s completed_at=%s",
					nullText(status), nullText(rulesetVersion), nullText(equivalence), nullText(createdAt), nullText(completedAt),
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
func rankAndTrimBalanced(chunks []model.RetrievedChunk, topK int) []model.RetrievedChunk {
	if topK <= 0 || len(chunks) <= topK {
		return chunks
	}

	buckets := map[string][]model.RetrievedChunk{}
	for _, c := range chunks {
		k := sourceServiceBucket(c.SourceType)
		buckets[k] = append(buckets[k], c)
	}

	keys := make([]string, 0, len(buckets))
	for k := range buckets {
		sort.SliceStable(buckets[k], func(i, j int) bool { return buckets[k][i].Score > buckets[k][j].Score })
		keys = append(keys, k)
	}
	sort.SliceStable(keys, func(i, j int) bool {
		return buckets[keys[i]][0].Score > buckets[keys[j]][0].Score
	})

	out := make([]model.RetrievedChunk, 0, topK)
	for len(out) < topK {
		added := false
		for _, k := range keys {
			if len(buckets[k]) == 0 {
				continue
			}
			out = append(out, buckets[k][0])
			buckets[k] = buckets[k][1:]
			added = true
			if len(out) == topK {
				break
			}
		}
		if !added {
			break
		}
	}
	return out
}

func sourceServiceBucket(sourceType string) string {
	s := strings.ToLower(strings.TrimSpace(sourceType))
	switch {
	case strings.HasPrefix(s, "edge_"):
		return "edge"
	case strings.HasPrefix(s, "intent_"):
		return "intent"
	case strings.HasPrefix(s, "relay_"):
		return "relay"
	case strings.HasPrefix(s, "intelligence_"):
		return "intelligence"
	case strings.HasPrefix(s, "evidence_"):
		return "evidence"
	case strings.HasPrefix(s, "outcome_"):
		return "outcome"
	default:
		return s
	}
}
