package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zord-prompt-layer/model"
)

func (r *LiveSQLRetriever) BuildVectorIndexChunks(ctx context.Context, event VectorIndexRequestEvent) ([]model.RetrievedChunk, error) {
	if r == nil {
		return nil, fmt.Errorf("live sql retriever is nil")
	}

	tenantID := strings.ToLower(strings.TrimSpace(event.TenantID))
	entityType := strings.ToLower(strings.TrimSpace(event.EntityType))
	entityID := strings.TrimSpace(event.EntityID)

	if tenantID == "" || !uuidRegex.MatchString(tenantID) {
		return nil, fmt.Errorf("invalid tenant_id")
	}
	if entityType == "" || entityID == "" {
		return nil, fmt.Errorf("entity_type and entity_id are required")
	}

	switch entityType {
	case "payment_intent", "intent":
		return r.fetchVectorPaymentIntent(ctx, tenantID, entityID)

	case "intent_batch", "canonical_batch", "batch":
		return r.fetchVectorIntentBatch(ctx, tenantID, entityID)

	case "intent_dlq", "dlq_item":
		return r.fetchVectorIntentDLQ(ctx, tenantID, entityID)

	case "outcome_batch_summary", "batch_attachment_summary", "settlement_summary":
		return r.fetchVectorOutcomeBatchSummary(ctx, tenantID, entityID)

	case "intelligence_snapshot":
		return r.fetchVectorIntelligenceSnapshot(ctx, tenantID, entityID, event.Metadata)

	case "intelligence_projection", "projection_state":
		return r.fetchVectorProjectionState(ctx, tenantID, entityID)

	case "intelligence_batch_contract", "batch_contract":
		return r.fetchVectorBatchContract(ctx, tenantID, entityID)

	case "evidence_batch_summary", "evidence_batch":
		return r.fetchVectorEvidenceBatchSummary(ctx, tenantID, entityID)

	case "evidence_pack":
		return r.fetchVectorEvidencePack(ctx, tenantID, entityID)

	default:
		return eventMetadataChunk(event), nil
	}
}

func (r *LiveSQLRetriever) fetchVectorPaymentIntent(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.intentDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	args := []any{tenantID}
	q := `
				SELECT status, intent_type, amount::text, currency, confidence_score::text, created_at::text,
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
		WHERE tenant_id::text = $1
	`

	if uuidRegex.MatchString(entityID) {
		q += " AND intent_id::text = $2"
		args = append(args, strings.ToLower(entityID))
	} else {
		q += " AND batchid = $2"
		args = append(args, entityID)
	}

	q += " ORDER BY created_at DESC LIMIT 25"

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("vector payment intent retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 25)
	for rows.Next() {
		var status, intentType, amount, currency, confidence, createdAt sql.NullString
		var providerHint, sourceSystem, clientPayoutRef, beneficiaryName sql.NullString
		if err := rows.Scan(
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

		out = append(out, model.RetrievedChunk{
			SourceType: "intent_payment_intents",
			Score:      1.0,
			Text: strings.Join(nonEmptyParts([]string{
				"Payment instruction summary",
				"Status: " + safeOptional(nullText(status)),
				"Type: " + safeOptional(nullText(intentType)),
				fmt.Sprintf("Amount: %s %s", nullText(amount), safeOptional(nullText(currency))),
				"Provider/PSP: " + safeBusinessContextValue(nullText(providerHint)),
				"Source system: " + safeBusinessContextValue(nullText(sourceSystem)),
				"Payee/Vendor: " + safeBusinessContextValue(nullText(beneficiaryName)),
				"Business reference: " + safeBusinessContextValue(nullText(clientPayoutRef)),
				"Confidence: " + safeOptional(nullText(confidence)),
				"Received: " + readableTime(nullText(createdAt)),
			}), " . "),
		})
	}

	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchVectorIntentBatch(ctx context.Context, tenantID, batchID string) ([]model.RetrievedChunk, error) {
	if r.intentDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	out := make([]model.RetrievedChunk, 0, 4)

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
		LIMIT 1
	`, tenantID, batchID).Scan(
		&received,
		&canonicalized,
		&dlqCount,
		&reviewCount,
		&lowMatch,
		&lowProof,
		&dupRisk,
		&successRate,
		&avgQuality,
		&batchQuality,
		&updatedAt,
	)

	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("vector intent batch retrieval failed: %w", err)
	}

	if err == nil {
		out = append(out, model.RetrievedChunk{
			SourceType: "intent_canonical_batches",
			Score:      1.0,
			Text: fmt.Sprintf(
				"Batch processing summary: Received payment instructions: %d · Structured successfully: %d · Failed records: %d · Records needing review: %d · Low matchability records: %d · Low proof readiness records: %d · Duplicate risk records: %d · Success rate: %s · Average instruction quality: %s · Batch quality: %s · Updated: %s",
				received,
				canonicalized,
				dlqCount,
				reviewCount,
				lowMatch,
				lowProof,
				dupRisk,
				safeOptional(nullText(successRate)),
				safeOptional(nullText(avgQuality)),
				safeOptional(nullText(batchQuality)),
				readableTime(nullText(updatedAt)),
			),
		})
	}

	intentRows, err := r.intentDB.QueryContext(ctx, `
		SELECT
			COALESCE(status, '') AS status,
			COALESCE(governance_state, '') AS governance_state,
			COALESCE(provider_hint, '') AS provider_hint,
			COALESCE(source_system, '') AS source_system,
			COUNT(*)::text AS item_count,
			COALESCE(SUM(amount), 0)::text AS total_amount,
			MIN(created_at)::text AS first_received,
			MAX(created_at)::text AS last_received
		FROM payment_intents
		WHERE tenant_id::text = $1 AND batchid = $2
		GROUP BY status, governance_state, provider_hint, source_system
		ORDER BY COUNT(*) DESC
		LIMIT 12
	`, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("vector intent batch distribution retrieval failed: %w", err)
	}
	defer intentRows.Close()

	intentParts := make([]string, 0, 12)
	for intentRows.Next() {
		var status, governance, provider, sourceSystem, count, totalAmount, firstReceived, lastReceived sql.NullString
		if err := intentRows.Scan(&status, &governance, &provider, &sourceSystem, &count, &totalAmount, &firstReceived, &lastReceived); err != nil {
			return nil, err
		}

		intentParts = append(intentParts, strings.Join(nonEmptyParts([]string{
			"Status: " + safeOptional(nullText(status)),
			"Governance: " + safeOptional(nullText(governance)),
			"Provider/PSP: " + safeBusinessContextValue(nullText(provider)),
			"Source system: " + safeBusinessContextValue(nullText(sourceSystem)),
			"Payment instructions: " + safeOptional(nullText(count)),
			"Total instructed value: " + exactDBMoneyValue(nullText(totalAmount)),
			"First received: " + readableTime(nullText(firstReceived)),
			"Last received: " + readableTime(nullText(lastReceived)),
		}), " · "))
	}
	if err := intentRows.Err(); err != nil {
		return nil, err
	}

	if len(intentParts) > 0 {
		out = append(out, model.RetrievedChunk{
			SourceType: "intent_batch_payment_distribution",
			Score:      0.99,
			Text:       "Batch payment instruction distribution: " + strings.Join(intentParts, " | "),
		})
	}

	dlqRows, err := r.intentDB.QueryContext(ctx, `
		SELECT
			COALESCE(stage, '') AS stage,
			COALESCE(reason_code, '') AS reason_code,
			COALESCE(dlq_status, '') AS dlq_status,
			COUNT(*)::text AS item_count,
			MIN(created_at)::text AS first_failed,
			MAX(created_at)::text AS last_failed
		FROM dlq_items
		WHERE tenant_id::text = $1 AND batch_id = $2
		GROUP BY stage, reason_code, dlq_status
		ORDER BY COUNT(*) DESC
		LIMIT 12
	`, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("vector intent batch dlq retrieval failed: %w", err)
	}
	defer dlqRows.Close()

	dlqParts := make([]string, 0, 12)
	for dlqRows.Next() {
		var stage, reason, status, count, firstFailed, lastFailed sql.NullString
		if err := dlqRows.Scan(&stage, &reason, &status, &count, &firstFailed, &lastFailed); err != nil {
			return nil, err
		}

		dlqParts = append(dlqParts, strings.Join(nonEmptyParts([]string{
			"Stage: " + safeOptional(nullText(stage)),
			"Reason: " + safeOptional(nullText(reason)),
			"Status: " + safeOptional(nullText(status)),
			"Failed records: " + safeOptional(nullText(count)),
			"First failed: " + readableTime(nullText(firstFailed)),
			"Last failed: " + readableTime(nullText(lastFailed)),
		}), " · "))
	}
	if err := dlqRows.Err(); err != nil {
		return nil, err
	}

	if len(dlqParts) > 0 {
		out = append(out, model.RetrievedChunk{
			SourceType: "intent_batch_failure_distribution",
			Score:      0.98,
			Text:       "Batch failure distribution: " + strings.Join(dlqParts, " | "),
		})
	}

	return out, nil
}

func (r *LiveSQLRetriever) fetchVectorIntentDLQ(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.intentDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	args := []any{tenantID}
	q := `
		SELECT stage, reason_code, error_detail, replayable::text, created_at::text
		FROM dlq_items
		WHERE tenant_id::text = $1
	`

	if uuidRegex.MatchString(entityID) {
		q += " AND dlq_id::text = $2"
		args = append(args, strings.ToLower(entityID))
	} else {
		q += " AND (stage ILIKE $2 OR reason_code ILIKE $2)"
		args = append(args, "%"+entityID+"%")
	}

	q += " ORDER BY created_at DESC LIMIT 10"

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("vector intent dlq retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
	for rows.Next() {
		var stage, reasonCode, errorDetail, replayable, createdAt sql.NullString
		if err := rows.Scan(&stage, &reasonCode, &errorDetail, &replayable, &createdAt); err != nil {
			return nil, err
		}

		out = append(out, model.RetrievedChunk{
			SourceType: "intent_dlq_items",
			Score:      0.97,
			Text: fmt.Sprintf(
				"Failed instruction summary: Stage: %s · Reason: %s · Replayable: %s · Created: %s · Detail: %s",
				safeOptional(nullText(stage)),
				safeOptional(nullText(reasonCode)),
				safeOptional(nullText(replayable)),
				readableTime(nullText(createdAt)),
				safeOptional(nullText(errorDetail)),
			),
		})
	}

	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchVectorOutcomeBatchSummary(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.outcomeDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	rows, err := r.outcomeDB.QueryContext(ctx, `
		SELECT
			batch_id,
			source_reference,
			total_intent_count::text,
			exact_match_count::text,
			high_confidence_count::text,
			ambiguous_count::text,
			unresolved_count::text,
			conflicted_count::text,
			total_intended_amount::text,
			total_observed_amount::text,
			total_variance::text,
			unresolved_intended_amount::text,
			net_unexplained_variance::text,
			batch_attachment_status,
			avg_matched_attachment_quality::text,
			avg_matched_attachment_confidence::text,
			avg_matched_attachment_ambiguity::text,
			created_at::text,
			updated_at::text
		FROM batch_attachment_summaries
		WHERE tenant_id::text = $1
		  AND (batch_id = $2 OR source_reference = $2)
		ORDER BY updated_at DESC, created_at DESC
		LIMIT 10
	`, tenantID, entityID)
	if err != nil {
		return nil, fmt.Errorf("vector outcome summary retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
	for rows.Next() {
		var (
			batchID, sourceReference                                                                       sql.NullString
			totalIntentCount, exactMatchCount, highConfidenceCount, ambiguousCount, unresolved, conflicted sql.NullString
			totalIntended, totalObserved, totalVariance, unresolvedValue, netUnexplained                   sql.NullString
			status, quality, confidence, ambiguity, createdAt, updatedAt                                   sql.NullString
		)

		if err := rows.Scan(
			&batchID,
			&sourceReference,
			&totalIntentCount,
			&exactMatchCount,
			&highConfidenceCount,
			&ambiguousCount,
			&unresolved,
			&conflicted,
			&totalIntended,
			&totalObserved,
			&totalVariance,
			&unresolvedValue,
			&netUnexplained,
			&status,
			&quality,
			&confidence,
			&ambiguity,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, err
		}

		out = append(out, model.RetrievedChunk{
			SourceType: "outcome_batch_attachment_summary",
			Score:      1.0,
			Text: fmt.Sprintf(
				"Settlement matching summary: Batch reference: %s · Source reference: %s · Payment instructions covered: %s · Exact matches: %s · High confidence matches: %s · Ambiguous matches: %s · Unresolved payments: %s · Conflicted payments: %s · Total intended value: %s · Total observed value: %s · Payment value difference: %s · Unresolved payment value: %s · Net unexplained value: %s · Status: %s · Average match quality: %s · Match confidence: %s · Match ambiguity: %s · Created: %s · Updated: %s",
				safeOptional(nullText(batchID)),
				safeOptional(nullText(sourceReference)),
				safeOptional(nullText(totalIntentCount)),
				safeOptional(nullText(exactMatchCount)),
				safeOptional(nullText(highConfidenceCount)),
				safeOptional(nullText(ambiguousCount)),
				safeOptional(nullText(unresolved)),
				safeOptional(nullText(conflicted)),
				exactDBMoneyValue(nullText(totalIntended)),
				exactDBMoneyValue(nullText(totalObserved)),
				exactDBMoneyValue(nullText(totalVariance)),
				exactDBMoneyValue(nullText(unresolvedValue)),
				exactDBMoneyValue(nullText(netUnexplained)),
				safeOptional(nullText(status)),
				safeOptional(nullText(quality)),
				safeOptional(nullText(confidence)),
				safeOptional(nullText(ambiguity)),
				readableTime(nullText(createdAt)),
				readableTime(nullText(updatedAt)),
			),
		})
	}

	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchVectorIntelligenceSnapshot(ctx context.Context, tenantID, entityID string, metadata map[string]string) ([]model.RetrievedChunk, error) {
	if r.intelligenceDB == nil {
		return []model.RetrievedChunk{}, nil
	}
	snapshotType := strings.TrimSpace(metadata["snapshot_type"])
	scopeType := strings.TrimSpace(metadata["scope_type"])
	scopeRef := strings.TrimSpace(metadata["scope_ref"])

	lookupValue := entityID
	if snapshotType != "" {
		lookupValue = snapshotType
	}
	rows, err := r.intelligenceDB.QueryContext(ctx, `
	SELECT snapshot_type, scope_type, snapshot_json::text, window_start::text, window_end::text, model_version, created_at::text
	FROM intelligence_snapshots
	WHERE tenant_id = $1
	  AND (snapshot_id = $2 OR snapshot_type = $2)
	  AND ($3 = '' OR scope_type = $3)
	  AND ($4 = '' OR scope_ref = $4)
	ORDER BY created_at DESC
	LIMIT 5
	`, tenantID, lookupValue, scopeType, scopeRef)
	if err != nil {
		return nil, fmt.Errorf("vector intelligence snapshot retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
	for rows.Next() {
		var snapType, scopeType, snapshotJSON, windowStart, windowEnd, modelVersion, createdAt sql.NullString
		if err := rows.Scan(&snapType, &scopeType, &snapshotJSON, &windowStart, &windowEnd, &modelVersion, &createdAt); err != nil {
			return nil, err
		}

		summary := summarizeBusinessJSON(snapshotJSON.String)
		if strings.TrimSpace(summary) == "" {
			summary = "Display-safe intelligence summary is not available."
		}
		rcaContext := ""
		if !strings.EqualFold(nullText(snapType), "RCA_CLUSTER") {
			rcaContext = r.fetchLatestVectorRCAContext(ctx, tenantID, scopeRef)
		}
		out = append(out, model.RetrievedChunk{
			SourceType: "intelligence_snapshots",
			Score:      0.92,
			Text: strings.Join(nonEmptyParts([]string{
				fmt.Sprintf(
					"Intelligence snapshot summary: Type: %s · Scope: %s · %s · Window start: %s · Window end: %s · Computed by: %s · Created: %s",
					safeOptional(nullText(snapType)),
					safeOptional(nullText(scopeType)),
					summary,
					readableTime(nullText(windowStart)),
					readableTime(nullText(windowEnd)),
					safeOptional(nullText(modelVersion)),
					readableTime(nullText(createdAt)),
				),
				rcaContext,
			}), " · "),
		})
	}

	return out, rows.Err()
}
func (r *LiveSQLRetriever) fetchLatestVectorRCAContext(ctx context.Context, tenantID, scopeRef string) string {
	if r == nil || r.intelligenceDB == nil {
		return ""
	}

	args := []any{tenantID}
	query := `
		SELECT snapshot_json::text, window_start::text, window_end::text, created_at::text
		FROM intelligence_snapshots
		WHERE tenant_id = $1
		  AND snapshot_type = 'RCA_CLUSTER'
	`

	if strings.TrimSpace(scopeRef) != "" {
		query += " AND (scope_ref = $2 OR scope_type = 'TENANT')"
		args = append(args, strings.TrimSpace(scopeRef))
	} else {
		query += " AND scope_type = 'TENANT'"
	}

	query += " ORDER BY created_at DESC LIMIT 1"

	var payload, windowStart, windowEnd, createdAt sql.NullString
	if err := r.intelligenceDB.QueryRowContext(ctx, query, args...).Scan(&payload, &windowStart, &windowEnd, &createdAt); err != nil {
		return "RCA context: not available yet"
	}

	summary := summarizeBusinessJSON(payload.String)
	if strings.TrimSpace(summary) == "" {
		return "RCA context: available but no display-safe RCA summary was produced"
	}

	return fmt.Sprintf(
		"RCA context: %s · RCA window start: %s · RCA window end: %s · RCA computed: %s",
		summary,
		readableTime(nullText(windowStart)),
		readableTime(nullText(windowEnd)),
		readableTime(nullText(createdAt)),
	)
}
func (r *LiveSQLRetriever) fetchVectorProjectionState(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.intelligenceDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	rows, err := r.intelligenceDB.QueryContext(ctx, `
		SELECT projection_family, value_json::text, window_start::text, window_end::text, computed_at::text
		FROM projection_state
		WHERE tenant_id = $1
		  AND projection_family = $2
		ORDER BY computed_at DESC
		LIMIT 5
	`, tenantID, entityID)
	if err != nil {
		return nil, fmt.Errorf("vector projection state retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
	for rows.Next() {
		var family, valueJSON, windowStart, windowEnd, computedAt sql.NullString
		if err := rows.Scan(&family, &valueJSON, &windowStart, &windowEnd, &computedAt); err != nil {
			return nil, err
		}

		summary := summarizeBusinessJSON(valueJSON.String)
		if strings.TrimSpace(summary) == "" {
			continue
		}

		out = append(out, model.RetrievedChunk{
			SourceType: "intelligence_projection_state",
			Score:      0.90,
			Text: fmt.Sprintf(
				"Intelligence metric summary: Metric family: %s · %s · Window start: %s · Window end: %s · Computed: %s",
				safeOptional(nullText(family)),
				summary,
				readableTime(nullText(windowStart)),
				readableTime(nullText(windowEnd)),
				readableTime(nullText(computedAt)),
			),
		})
	}

	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchVectorBatchContract(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.intelligenceDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	rows, err := r.intelligenceDB.QueryContext(ctx, `
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
		WHERE tenant_id = $1
		  AND (batch_id = $2 OR source_reference = $2)
		ORDER BY last_updated_at DESC
		LIMIT 5
	`, tenantID, entityID)
	if err != nil {
		return nil, fmt.Errorf("vector batch contract retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
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
			return nil, err
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
			"Total instructed value: " + exactDBMoneyValue(intended),
			"Confirmed settlement value: " + exactDBMoneyValue(confirmed),
			"Payment value difference: " + exactDBMoneyValue(variance),
			"Unmatched payment value: " + exactDBMoneyValue(unmatched),
			"Unlinked settlement value: " + exactDBMoneyValue(orphan),
			"Duplicate risk exposure: " + exactDBMoneyValue(duplicateRisk),
			fmt.Sprintf("Payments missing bank/PSP references: %d", missingRefs),
			"Unexplained value difference: " + exactDBMoneyValue(nullText(unexplained)),
			"Expected deduction value: " + exactDBMoneyValue(nullText(whitelisted)),
			"Match review score: " + safeOptional(nullText(ambiguityScore)),
			"Proof readiness level: " + safeOptional(nullText(proofTier)),
			"Updated: " + readableTime(nullText(updatedAt)),
			"Created: " + readableTime(nullText(createdAt)),
		}), " · ")
		rcaContext := r.fetchLatestVectorRCAContext(ctx, tenantID, entityID)
		if strings.TrimSpace(rcaContext) != "" {
			text = strings.Join(nonEmptyParts([]string{text, rcaContext}), " Â· ")
		}

		out = append(out, model.RetrievedChunk{
			SourceType: "intelligence_batch_contracts",
			Score:      0.98,
			Text:       text,
		})
	}

	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchVectorEvidencePack(ctx context.Context, tenantID, entityID string) ([]model.RetrievedChunk, error) {
	if r.evidenceDB == nil {
		return []model.RetrievedChunk{}, nil
	}

	rows, err := r.evidenceDB.QueryContext(ctx, `
		SELECT mode, pack_status, ruleset_version, signature_alg, replay_equivalence_status, created_at::text, updated_at::text
		FROM evidence_packs
		WHERE tenant_id = $1
		  AND (evidence_pack_id = $2 OR batch_id = $2 OR intent_id = $2 OR client_payout_ref = $2)
		ORDER BY updated_at DESC, created_at DESC
		LIMIT 10
	`, tenantID, entityID)
	if err != nil {
		return nil, fmt.Errorf("vector evidence pack retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, 10)
	for rows.Next() {
		var mode, packStatus, rulesetVersion, signatureAlg, replayStatus, createdAt, updatedAt sql.NullString
		if err := rows.Scan(&mode, &packStatus, &rulesetVersion, &signatureAlg, &replayStatus, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		out = append(out, model.RetrievedChunk{
			SourceType: "evidence_packs",
			Score:      0.90,
			Text: fmt.Sprintf(
				"Evidence pack status: Mode: %s · Pack status: %s · Ruleset version: %s · Signature algorithm: %s · Replay status: %s · Created: %s · Updated: %s",
				safeOptional(nullText(mode)),
				safeOptional(nullText(packStatus)),
				safeOptional(nullText(rulesetVersion)),
				safeOptional(nullText(signatureAlg)),
				safeOptional(nullText(replayStatus)),
				readableTime(nullText(createdAt)),
				readableTime(nullText(updatedAt)),
			),
		})
	}

	return out, rows.Err()
}
func (r *LiveSQLRetriever) fetchVectorEvidenceBatchSummary(ctx context.Context, tenantID, batchID string) ([]model.RetrievedChunk, error) {
	if r.evidenceDB == nil {
		return []model.RetrievedChunk{}, nil
	}
	var totalPacks, activePacks, proofReadyPacks sql.NullString
	if err := r.evidenceDB.QueryRowContext(ctx, `
	SELECT
		COUNT(*)::text AS total_packs,
		COUNT(*) FILTER (WHERE UPPER(COALESCE(pack_status, '')) = 'ACTIVE')::text AS active_packs,
		COUNT(*) FILTER (WHERE UPPER(COALESCE(proof_status, '')) IN ('PROOF_READY', 'READY', 'VERIFIED'))::text AS proof_ready_packs
	FROM evidence_packs
	WHERE tenant_id = $1
	  AND batch_id = $2
`, tenantID, batchID).Scan(&totalPacks, &activePacks, &proofReadyPacks); err != nil {
		return nil, fmt.Errorf("vector evidence batch exact count retrieval failed: %w", err)
	}

	rows, err := r.evidenceDB.QueryContext(ctx, `
		SELECT
			COALESCE(mode, '') AS mode,
			COALESCE(pack_status, '') AS pack_status,
			COALESCE(replay_equivalence_status, '') AS replay_status,
			COALESCE(proof_status, '') AS proof_status,
			COUNT(*)::text AS pack_count,
			COALESCE(SUM(leaf_count), 0)::text AS leaf_count,
			COALESCE(SUM(required_leaf_count), 0)::text AS required_leaf_count,
			MIN(created_at)::text AS first_created,
			MAX(updated_at)::text AS last_updated
		FROM evidence_packs
		WHERE tenant_id = $1
		  AND batch_id = $2
		GROUP BY mode, pack_status, replay_equivalence_status, proof_status
		ORDER BY COUNT(*) DESC
		LIMIT 12
	`, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("vector evidence batch summary retrieval failed: %w", err)
	}
	defer rows.Close()

	parts := []string{
		strings.Join(nonEmptyParts([]string{
			"Exact batch evidence total",
			"Total evidence packs generated: " + safeOptional(nullText(totalPacks)),
			"Active evidence packs: " + safeOptional(nullText(activePacks)),
			"Proof-ready evidence packs: " + safeOptional(nullText(proofReadyPacks)),
		}), " · "),
	}
	for rows.Next() {
		var mode, status, replay, proofStatus, packCount, leafCount, requiredLeafCount, firstCreated, lastUpdated sql.NullString
		if err := rows.Scan(
			&mode,
			&status,
			&replay,
			&proofStatus,
			&packCount,
			&leafCount,
			&requiredLeafCount,
			&firstCreated,
			&lastUpdated,
		); err != nil {
			return nil, err
		}

		parts = append(parts, strings.Join(nonEmptyParts([]string{
			"Mode: " + safeOptional(nullText(mode)),
			"Evidence status: " + safeOptional(nullText(status)),
			"Replay readiness: " + safeOptional(nullText(replay)),
			"Proof status: " + safeOptional(nullText(proofStatus)),
			"Evidence packs: " + safeOptional(nullText(packCount)),
			"Available proof items: " + safeOptional(nullText(leafCount)),
			"Required proof items: " + safeOptional(nullText(requiredLeafCount)),
			"First created: " + readableTime(nullText(firstCreated)),
			"Last updated: " + readableTime(nullText(lastUpdated)),
		}), " Â· "))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(parts) == 0 {
		return []model.RetrievedChunk{}, nil
	}

	return []model.RetrievedChunk{{
		SourceType: "evidence_batch_summary",
		Score:      0.95,
		Text:       "Batch evidence summary: " + strings.Join(parts, " | "),
	}}, nil
}
func eventMetadataChunk(event VectorIndexRequestEvent) []model.RetrievedChunk {
	text := strings.Join(nonEmptyParts([]string{
		"Index event summary",
		"Source service: " + safeOptional(event.SourceService),
		"Source event: " + safeOptional(event.SourceEventType),
		"Entity type: " + safeOptional(event.EntityType),
		"Operation: " + safeOptional(event.Operation),
		"Content version: " + safeOptional(event.ContentVersion),
	}), " · ")

	if strings.TrimSpace(text) == "" {
		return []model.RetrievedChunk{}
	}

	return []model.RetrievedChunk{{
		SourceType: "vector_index_event",
		Score:      0.70,
		Text:       text,
	}}
}
