package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

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
			q += " AND (failed_count > 0 OR pending_count > 0 OR unmatched_amount_minor > 0 OR orphan_amount_minor > 0 OR unexplained_variance_minor > 0 OR batch_finality_status IN ('FAILED','REQUIRES_REVIEW','PARTIALLY_RECONCILED'))"
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
