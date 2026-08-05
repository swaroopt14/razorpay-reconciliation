package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (r *LiveSQLRetriever) fetchFromIntent(tenantID, intentID, traceID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	args := []any{}
	q := `
			SELECT intent_id::text, envelope_id::text, trace_id::text, status, intent_type,
		       amount::text, currency, confidence_score::text, created_at::text,
		       COALESCE(provider_hint, '') AS provider_hint,
		       COALESCE(source_system, '') AS source_system,
		       COALESCE(client_payout_ref, '') AS client_payout_ref,
		       COALESCE(
		       	beneficiary->>'name',
		       	beneficiary->>'display_name',
		       	beneficiary->>'vendor_name',
		       	beneficiary->>'payee_name',
		       	beneficiary->>'beneficiary_name',
		       	''
		       ) AS beneficiary_display_name
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
		var confidence, providerHint, sourceSystem, clientPayoutRef, beneficiaryName sql.NullString

		if err := rows.Scan(
			&id,
			&envelopeID,
			&tr,
			&status,
			&intentType,
			&amount,
			&currency,
			&confidence,
			&createdAt,
			&providerHint,
			&sourceSystem,
			&clientPayoutRef,
			&beneficiaryName,
		); err != nil {
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
			Text: strings.Join(nonEmptyParts([]string{
				"Payment instruction",
				"Status: " + status,
				"Type: " + intentType,
				fmt.Sprintf("Amount: %s %s", amount, currency),
				"Provider/PSP: " + safeBusinessContextValue(nullText(providerHint)),
				"Source system: " + safeBusinessContextValue(nullText(sourceSystem)),
				"Payee/Vendor: " + safeBusinessContextValue(nullText(beneficiaryName)),
				"Business reference: " + safeBusinessContextValue(nullText(clientPayoutRef)),
				"Confidence: " + confidenceVal,
				"Received: " + readableTime(createdAt),
			}), " . "),
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
