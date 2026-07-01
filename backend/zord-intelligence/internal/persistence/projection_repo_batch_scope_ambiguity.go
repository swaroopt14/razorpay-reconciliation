package persistence

// projection_repo_batch_scope_ambiguity.go
//
// BothScopes atomic method for the AMBIGUITY projection family.
// See projection_repo_batch_scope_leakage.go for the shared design notes.

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

func ambiguityBatchKey(batchID string) string {
	return fmt.Sprintf("ambiguity.batch.%s", batchID)
}

// recomputeAmbiguityRatesTx is the transactional twin of recomputeAmbiguityRates.
func recomputeAmbiguityRatesTx(ctx context.Context, tx pgx.Tx, tenantID, key string, windowStart time.Time) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										value_json,
										'{avg_attachment_confidence}',
										to_jsonb(
											COALESCE(
												(value_json->>'confidence_sum')::numeric /
												NULLIF((value_json->>'confidence_count')::numeric, 0),
												0
											)
										)
									),
									'{decision_success_rate}',
									to_jsonb(
										COALESCE(
											(value_json->>'successful_decision_count')::numeric /
											NULLIF((value_json->>'total_decisions')::numeric, 0),
											0
										)
									)
								),
								'{provider_ref_missing_rate}',
								to_jsonb(
									COALESCE(
										(value_json->>'provider_ref_missing_count')::numeric /
										NULLIF((value_json->>'total_decisions')::numeric, 0),
										0
									)
								)
							),
							'{ambiguity_rate}',
							to_jsonb(
								COALESCE(
									(value_json->>'ambiguous_intent_count')::numeric /
									NULLIF((value_json->>'total_decisions')::numeric, 0),
									0
								)
							)
						),
						'{low_confidence_rate}',
						to_jsonb(
							COALESCE(
								(value_json->>'low_confidence_count')::numeric /
								NULLIF((value_json->>'total_decisions')::numeric, 0),
								0
							)
						)
					),
					'{candidate_collision_rate}',
					to_jsonb(
						COALESCE(
							(value_json->>'candidate_collision_count')::numeric /
							NULLIF((value_json->>'total_decisions')::numeric, 0),
							0
						)
					)
				),
				'{avg_score_margin}',
				to_jsonb(
					COALESCE(
						(value_json->>'score_margin_sum')::numeric /
						NULLIF((value_json->>'score_margin_count')::numeric, 0),
						0
					)
				)
			),
			'{carrier_completeness_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'carrier_complete_count')::numeric /
					NULLIF((value_json->>'total_carrier_records')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := tx.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.recomputeAmbiguityRatesTx key=%s: %w", key, err)
	}
	return nil
}

// AtomicRecordAttachmentDecisionBothScopes updates ambiguity.summary (tenant)
// AND ambiguity.batch.{batchID} (batch) in one transaction.
func (r *ProjectionRepo) AtomicRecordAttachmentDecisionBothScopes(
	ctx context.Context,
	tenantID, batchID, decisionType string,
	confidenceScore float64,
	intendedAmountMinor decimal.Decimal,
	supportingCarriers []string,
	isLowConfidence, hasCollision bool,
	scoreMargin float64,
	isSuccessfulDecision bool,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordAttachmentDecisionBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "ambiguity.summary"
	batchKey := ambiguityBatchKey(batchID)

	isAmbiguous := decisionType == "MATCH_AMBIGUOUS"
	isUnresolved := decisionType == "MATCH_UNRESOLVED"
	hasNoCarriers := len(supportingCarriers) == 0

	ambiguousIncr := 0
	if isAmbiguous {
		ambiguousIncr = 1
	}
	unresolvedIncr := 0
	if isUnresolved {
		unresolvedIncr = 1
	}
	ambiguousAmount := decimal.Zero
	if isAmbiguous {
		ambiguousAmount = intendedAmountMinor
	}
	missingCarrierIncr := 0
	if hasNoCarriers {
		missingCarrierIncr = 1
	}
	lowConfidenceIncr := 0
	if isLowConfidence {
		lowConfidenceIncr = 1
	}
	collisionIncr := 0
	if hasCollision {
		collisionIncr = 1
	}
	successfulIncr := 0
	if isSuccessfulDecision {
		successfulIncr = 1
	}

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'ambiguous_intent_count',       $5::int,
				'ambiguous_amount_minor',       $6::numeric,
				'unresolved_settlement_count',  $7::int,
				'value_at_risk_minor',          $8::numeric,
				'avg_attachment_confidence',    $9::float8,
				'confidence_sum',               $9::float8,
				'confidence_count',             1,
				'provider_ref_missing_count',   $10::int,
				'total_decisions',              1,
				'provider_ref_missing_rate',    $10::float8,
				'ambiguity_rate',               $5::float8,
				'low_confidence_count',         $11::int,
				'low_confidence_rate',          $11::float8,
				'candidate_collision_count',    $12::int,
				'candidate_collision_rate',     $12::float8,
				'score_margin_sum',             $13::float8,
				'score_margin_count',           1,
				'avg_score_margin',             $13::float8,
				'successful_decision_count',    $14::int,
				'decision_success_rate',        $14::float8
			),
			now(), 1, 'AMBIGUITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										jsonb_set(
											jsonb_set(
												jsonb_set(
													jsonb_set(
														jsonb_set(
															jsonb_set(
																projection_state.value_json,
																'{ambiguous_intent_count}',
																to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'ambiguous_intent_count')::int, 0) + $5::int, 0))
															),
															'{ambiguous_amount_minor}',
															to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'ambiguous_amount_minor')::numeric, 0) + $6::numeric, 0))
														),
														'{unresolved_settlement_count}',
														to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'unresolved_settlement_count')::int, 0) + $7::int, 0))
													),
													'{value_at_risk_minor}',
													to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'value_at_risk_minor')::numeric, 0) + $8::numeric, 0))
												),
												'{confidence_sum}',
												to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'confidence_sum')::float8, 0.0) + $9::float8, 0))
											),
											'{confidence_count}',
											to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'confidence_count')::int, 0) + 1, 0))
										),
										'{provider_ref_missing_count}',
										to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'provider_ref_missing_count')::int, 0) + $10::int, 0))
									),
									'{total_decisions}',
									to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'total_decisions')::int, 0) + 1, 0))
								),
								'{low_confidence_count}',
								to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'low_confidence_count')::int, 0) + $11::int, 0))
							),
							'{candidate_collision_count}',
							to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'candidate_collision_count')::int, 0) + $12::int, 0))
						),
						'{score_margin_sum}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'score_margin_sum')::float8, 0.0) + $13::float8, 0))
					),
					'{score_margin_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'score_margin_count')::int, 0) + 1, 0))
				),
				'{successful_decision_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'successful_decision_count')::int, 0) + $14::int, 0))
			),
		computed_at = now()
	`

	args := []any{
		ambiguousIncr,
		ambiguousAmount.String(),
		unresolvedIncr,
		ambiguousAmount.String(),
		confidenceScore,
		missingCarrierIncr,
		lowConfidenceIncr,
		collisionIncr,
		scoreMargin,
		successfulIncr,
	}

	tenantArgs := append([]any{tenantID, tenantKey, tenantWindowStart, tenantWindowEnd}, args...)
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantArgs...); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordAttachmentDecisionBothScopes tenant tenant=%s decision=%s: %w", tenantID, decisionType, err)
	}
	if err := recomputeAmbiguityRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	batchArgs := append([]any{tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd}, args...)
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), batchArgs...); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordAttachmentDecisionBothScopes batch tenant=%s batch=%s decision=%s: %w", tenantID, batchID, decisionType, err)
	}
	if err := recomputeAmbiguityRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
