package persistence

// projection_repo_batch_scope_defensibility.go
//
// BothScopes atomic methods for the DEFENSIBILITY projection family.
// See projection_repo_batch_scope_leakage.go for the shared design notes.

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

func defensibilityBatchKey(batchID string) string {
	return fmt.Sprintf("defensibility.batch.%s", batchID)
}

// recomputeDefensibilityRatesTx is the transactional twin of recomputeDefensibilityRates.
func recomputeDefensibilityRatesTx(ctx context.Context, tx pgx.Tx, tenantID, key string, windowStart time.Time) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							value_json,
							'{evidence_pack_rate}',
							to_jsonb(
								LEAST(1.0,
									COALESCE(
										(value_json->>'with_evidence_pack')::numeric /
										NULLIF((value_json->>'total_intents')::numeric, 0),
										0
									)
								)
							)
						),
						'{governance_coverage_pct}',
						to_jsonb(
							COALESCE(
								(value_json->>'with_governance_decision')::numeric /
								NULLIF((value_json->>'total_intents')::numeric, 0),
								0
							)
						)
					),
					'{replayability_pct}',
					to_jsonb(
						COALESCE(
							(value_json->>'with_replay_equivalence')::numeric /
							NULLIF((value_json->>'total_intents')::numeric, 0),
							0
						)
					)
				),
				'{audit_ready_pct}',
				to_jsonb(
					COALESCE(
						(
							(value_json->>'with_evidence_pack')::numeric +
							(value_json->>'with_governance_decision')::numeric
						) /
						NULLIF((value_json->>'total_intents')::numeric * 2, 0),
						0
					)
				)
			),
			'{dispute_ready_pct}',
			to_jsonb(
				COALESCE(
					(
						(value_json->>'with_evidence_pack')::numeric +
						(value_json->>'with_governance_decision')::numeric +
						(value_json->>'with_replay_equivalence')::numeric
					) /
					NULLIF((value_json->>'total_intents')::numeric * 3, 0),
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
		return fmt.Errorf("projection_repo_batch_scope.recomputeDefensibilityRatesTx key=%s: %w", key, err)
	}
	return nil
}

// recomputeDefensibilityEvidenceRatesTx is the transactional twin of recomputeDefensibilityEvidenceRates.
func recomputeDefensibilityEvidenceRatesTx(ctx context.Context, tx pgx.Tx, tenantID, key string, windowStart time.Time) error {
	sql := `
		UPDATE projection_state SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									value_json,
									'{avg_pack_completeness_score}',
									CASE
										WHEN COALESCE((value_json->>'pack_completeness_count')::int, 0) > 0
										THEN to_jsonb(
											COALESCE((value_json->>'pack_completeness_sum')::float8, 0.0) /
											(value_json->>'pack_completeness_count')::float8
										)
										ELSE to_jsonb(0.0)
									END
								),
								'{settlement_evidence_coverage}',
								CASE
									WHEN COALESCE((value_json->>'with_evidence_pack')::int, 0) > 0
									THEN to_jsonb(
										COALESCE((value_json->>'with_settlement_leaf')::float8, 0.0) /
										(value_json->>'with_evidence_pack')::float8
									)
									ELSE to_jsonb(0.0)
								END
							),
							'{attachment_evidence_coverage}',
							CASE
								WHEN COALESCE((value_json->>'with_evidence_pack')::int, 0) > 0
								THEN to_jsonb(
									COALESCE((value_json->>'with_attachment_leaf')::float8, 0.0) /
									(value_json->>'with_evidence_pack')::float8
								)
								ELSE to_jsonb(0.0)
							END
						),
						'{weak_evidence_rate}',
						CASE
							WHEN COALESCE((value_json->>'total_intents')::int, 0) > 0
							THEN to_jsonb(
								COALESCE((value_json->>'weak_evidence_count')::float8, 0.0) /
								(value_json->>'total_intents')::float8
							)
							ELSE to_jsonb(0.0)
						END
					),
					'{avg_intent_quality_score}',
					CASE
						WHEN COALESCE((value_json->>'intent_quality_count')::int, 0) > 0
						THEN to_jsonb(
							COALESCE((value_json->>'intent_quality_sum')::float8, 0.0) /
							(value_json->>'intent_quality_count')::float8
						)
						ELSE to_jsonb(0.0)
					END
				),
				'{avg_mapping_confidence}',
				CASE
					WHEN COALESCE((value_json->>'mapping_confidence_count')::int, 0) > 0
					THEN to_jsonb(
						COALESCE((value_json->>'mapping_confidence_sum')::float8, 0.0) /
						(value_json->>'mapping_confidence_count')::float8
					)
					ELSE to_jsonb(0.0)
				END
			),
			computed_at = now()
		WHERE tenant_id = $1 AND projection_key = $2 AND window_start = $3
	`
	if _, err := tx.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.recomputeDefensibilityEvidenceRatesTx tenant=%s: %w", tenantID, err)
	}
	return nil
}

// AtomicRecordGovernanceCoverageBothScopes updates defensibility.summary
// (tenant) AND defensibility.batch.{batchID} (batch) in one transaction.
func (r *ProjectionRepo) AtomicRecordGovernanceCoverageBothScopes(
	ctx context.Context,
	tenantID, batchID, decisionOutcome string,
	kycChecked, amlChecked, replayEquivalent bool,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordGovernanceCoverageBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	kycIncr := 0
	if kycChecked {
		kycIncr = 1
	}
	amlIncr := 0
	if amlChecked {
		amlIncr = 1
	}
	replayIncr := 0
	if replayEquivalent {
		replayIncr = 1
	}
	approvedIncr, rejectedIncr, escalatedIncr := 0, 0, 0
	switch decisionOutcome {
	case "APPROVED":
		approvedIncr = 1
	case "REJECTED":
		rejectedIncr = 1
	case "ESCALATED":
		escalatedIncr = 1
	}

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              0,
				'with_evidence_pack',         0,
				'with_governance_decision',   1,
				'with_replay_equivalence',    $5::int,
				'with_kyc_checked',           $6::int,
				'with_aml_checked',           $7::int,
				'governance_approved_count',  $8::int,
				'governance_rejected_count',  $9::int,
				'governance_escalated_count', $10::int,
				'evidence_pack_rate',         0.0,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										projection_state.value_json,
										'{with_governance_decision}',
										to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_governance_decision')::int, 0) + 1, 0))
									),
									'{with_replay_equivalence}',
									to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_replay_equivalence')::int, 0) + $5::int, 0))
								),
								'{with_kyc_checked}',
								to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_kyc_checked')::int, 0) + $6::int, 0))
							),
							'{with_aml_checked}',
							to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_aml_checked')::int, 0) + $7::int, 0))
						),
						'{governance_approved_count}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'governance_approved_count')::int, 0) + $8::int, 0))
					),
					'{governance_rejected_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'governance_rejected_count')::int, 0) + $9::int, 0))
				),
				'{governance_escalated_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'governance_escalated_count')::int, 0) + $10::int, 0))
			),
			computed_at = now()
	`

	args := []any{replayIncr, kycIncr, amlIncr, approvedIncr, rejectedIncr, escalatedIncr}
	tenantArgs := append([]any{tenantID, tenantKey, tenantWindowStart, tenantWindowEnd}, args...)
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantArgs...); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordGovernanceCoverageBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	batchArgs := append([]any{tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd}, args...)
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), batchArgs...); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordGovernanceCoverageBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicIncrementDefensibilityIntentBothScopes updates defensibility.summary
// (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicIncrementDefensibilityIntentBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	hasEvidencePack bool,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityIntentBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	packIncr := 0
	if hasEvidencePack {
		packIncr = 1
	}

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              1,
				'with_evidence_pack',         $5::int,
				'with_governance_decision',   0,
				'with_replay_equivalence',    0,
				'with_kyc_checked',           0,
				'with_aml_checked',           0,
				'governance_approved_count',  0,
				'governance_rejected_count',  0,
				'governance_escalated_count', 0,
				'evidence_pack_rate',         $5::float8,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{total_intents}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'total_intents')::int, 0) + 1, 0))
				),
				'{with_evidence_pack}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_evidence_pack')::int, 0) + $5::int, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, packIncr); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityIntentBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, packIncr); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityIntentBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicIncrementDefensibilityEvidencePackBothScopes updates
// defensibility.summary (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicIncrementDefensibilityEvidencePackBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityEvidencePackBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              0,
				'with_evidence_pack',         1,
				'with_governance_decision',   0,
				'with_replay_equivalence',    0,
				'with_kyc_checked',           0,
				'with_aml_checked',           0,
				'governance_approved_count',  0,
				'governance_rejected_count',  0,
				'governance_escalated_count', 0,
				'evidence_pack_rate',         0.0,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{with_evidence_pack}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_evidence_pack')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityEvidencePackBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityEvidencePackBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicRecordEvidencePackQualityBothScopes updates defensibility.summary
// (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicRecordEvidencePackQualityBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	packCompletenessScore float64,
	settlementLeafPresent, attachmentDecisionLeafPresent bool,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordEvidencePackQualityBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	settlementLeafInt := 0
	if settlementLeafPresent {
		settlementLeafInt = 1
	}
	attachmentLeafInt := 0
	if attachmentDecisionLeafPresent {
		attachmentLeafInt = 1
	}

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              0,
				'with_evidence_pack',         0,
				'with_governance_decision',   0,
				'with_replay_equivalence',    0,
				'with_kyc_checked',           0,
				'with_aml_checked',           0,
				'governance_approved_count',  0,
				'governance_rejected_count',  0,
				'governance_escalated_count', 0,
				'pack_completeness_sum',      $5::float8,
				'pack_completeness_count',    1,
				'avg_pack_completeness_score',$5::float8,
				'with_settlement_leaf',       $6::int,
				'settlement_evidence_coverage', 0.0,
				'with_attachment_leaf',       $7::int,
				'attachment_evidence_coverage', 0.0,
				'weak_evidence_count',        0,
				'weak_evidence_rate',         0.0
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							projection_state.value_json,
							'{pack_completeness_sum}',
							to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'pack_completeness_sum')::float8, 0) + $5::float8, 0))
						),
						'{pack_completeness_count}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'pack_completeness_count')::int, 0) + 1, 0))
					),
					'{with_settlement_leaf}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_settlement_leaf')::int, 0) + $6::int, 0))
				),
				'{with_attachment_leaf}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'with_attachment_leaf')::int, 0) + $7::int, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, packCompletenessScore, settlementLeafInt, attachmentLeafInt); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordEvidencePackQualityBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, packCompletenessScore, settlementLeafInt, attachmentLeafInt); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordEvidencePackQualityBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicIncrementDefensibilityWeakEvidenceBothScopes updates
// defensibility.summary (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicIncrementDefensibilityWeakEvidenceBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityWeakEvidenceBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents', 0, 'with_evidence_pack', 0,
				'with_governance_decision', 0, 'with_replay_equivalence', 0,
				'with_kyc_checked', 0, 'with_aml_checked', 0,
				'governance_approved_count', 0, 'governance_rejected_count', 0,
				'governance_escalated_count', 0,
				'pack_completeness_sum', 0.0, 'pack_completeness_count', 0,
				'avg_pack_completeness_score', 0.0,
				'with_settlement_leaf', 0, 'settlement_evidence_coverage', 0.0,
				'with_attachment_leaf', 0, 'attachment_evidence_coverage', 0.0,
				'weak_evidence_count', 1, 'weak_evidence_rate', 0.0
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{weak_evidence_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'weak_evidence_count')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityWeakEvidenceBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementDefensibilityWeakEvidenceBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicRecordDefensibilityIntentQualityBothScopes updates
// defensibility.summary (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicRecordDefensibilityIntentQualityBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	intentQualityScore float64,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityIntentQualityBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'intent_quality_sum',      $5::float8,
				'intent_quality_count',    1,
				'avg_intent_quality_score', $5::float8
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{intent_quality_sum}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'intent_quality_sum')::float8, 0) + $5::float8, 0))
				),
				'{intent_quality_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'intent_quality_count')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, intentQualityScore); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityIntentQualityBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, intentQualityScore); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityIntentQualityBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicRecordDefensibilityMappingConfidenceBothScopes updates
// defensibility.summary (tenant) AND defensibility.batch.{batchID} (batch).
func (r *ProjectionRepo) AtomicRecordDefensibilityMappingConfidenceBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	mappingConfidence float64,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityMappingConfidenceBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "defensibility.summary"
	batchKey := defensibilityBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'mapping_confidence_sum',   $5::float8,
				'mapping_confidence_count', 1,
				'avg_mapping_confidence',   $5::float8
			),
			now(), 1, 'DEFENSIBILITY', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{mapping_confidence_sum}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'mapping_confidence_sum')::float8, 0) + $5::float8, 0))
				),
				'{mapping_confidence_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'mapping_confidence_count')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, mappingConfidence); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityMappingConfidenceBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, mappingConfidence); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordDefensibilityMappingConfidenceBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeDefensibilityEvidenceRatesTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
