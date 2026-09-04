package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

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
