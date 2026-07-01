package persistence

// projection_repo_batch_scope_leakage.go
//
// BothScopes atomic methods for the LEAKAGE projection family.
//
// Each method opens a single Postgres transaction and writes BOTH the
// TENANT-scoped row ("leakage.total", todayWindow) and the BATCH-scoped row
// ("leakage.batch.{batchID}", lifetime window) atomically. This guarantees
// sum(batch counters for tenant T) == tenant counter for T at every committed
// instant — there is no race window between the two writes.
//
// The tenant-side SQL in each method is byte-identical to the corresponding
// existing Atomic* method in projection_repo.go / projection_repo_pattern.go —
// only executed via tx.Exec instead of r.pool.Exec, and with an explicit
// GREATEST(...,0) floor added to every counter update (Phase 1 rule: counters
// never go below zero). Since every delta here is non-negative, this floor is
// a no-op in practice but is included per spec.
//
// The batch-side SQL mirrors the tenant-side structure with:
//   - projection_key = "leakage.batch.{batchID}"
//   - window_start/window_end = BatchProjectionWindowStart/End (lifetime window)
//   - entity_scope_type = 'BATCH' (vs 'TENANT')

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

func leakageBatchKey(batchID string) string {
	return fmt.Sprintf("leakage.batch.%s", batchID)
}

// recomputeLeakageTotalsTx is the transactional twin of recomputeLeakageTotals.
func recomputeLeakageTotalsTx(ctx context.Context, tx pgx.Tx, tenantID, key string, windowStart time.Time) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				value_json,
				'{total_amount_minor}',
				to_jsonb(
					GREATEST(
						COALESCE((value_json->>'unmatched_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'under_settlement_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'orphan_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'reversal_exposure_minor')::numeric, 0),
						0
					)
				)
			),
			'{leakage_percentage}',
			to_jsonb(
				COALESCE(
					(
						COALESCE((value_json->>'unmatched_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'under_settlement_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'reversal_exposure_minor')::numeric, 0)
					) /
					NULLIF((value_json->>'total_intended_amount_minor')::numeric, 0),
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
		return fmt.Errorf("projection_repo_batch_scope.recomputeLeakageTotalsTx key=%s: %w", key, err)
	}
	return nil
}

// AtomicIncrementLeakageIntendedTotalBothScopes updates leakage.total (tenant)
// AND leakage.batch.{batchID} (batch) in one transaction.
func (r *ProjectionRepo) AtomicIncrementLeakageIntendedTotalBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	intendedMinor decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageIntendedTotalBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_amount_minor',             0::numeric,
				'unmatched_amount_minor',         0::numeric,
				'under_settlement_amount_minor',  0::numeric,
				'orphan_amount_minor',            0::numeric,
				'reversal_exposure_minor',        0::numeric,
				'unmatched_intent_count',         0,
				'under_settlement_count',         0,
				'orphan_settlement_count',        0,
				'reversal_count',                 0,
				'total_intended_amount_minor',    $5::numeric,
				'leakage_percentage',             0.0,
				'breakdown_by_type',              '{}'::jsonb
			),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{total_intended_amount_minor}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'total_intended_amount_minor')::numeric, 0) + $5::numeric, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, intendedMinor.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageIntendedTotalBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, intendedMinor.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageIntendedTotalBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicRecordLeakageBothScopes updates leakage.total (tenant) AND
// leakage.batch.{batchID} (batch) in one transaction.
func (r *ProjectionRepo) AtomicRecordLeakageBothScopes(
	ctx context.Context,
	tenantID, batchID, leakageType string,
	intendedMinor, orphanMinor decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordLeakageBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	var tpl string
	var amountStr string

	switch leakageType {
	case "UNMATCHED_INTENT":
		tpl = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::numeric,
					'unmatched_amount_minor',         $5::numeric,
					'under_settlement_amount_minor',  0::numeric,
					'orphan_amount_minor',            0::numeric,
					'reversal_exposure_minor',        0::numeric,
					'unmatched_intent_count',         1,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::numeric,
					'leakage_percentage',             1.0,
					'breakdown_by_type',              jsonb_build_object('UNMATCHED_INTENT', $5::numeric)
				),
				now(), 1, 'LEAKAGE', '%s')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{unmatched_amount_minor}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'unmatched_amount_minor')::numeric, 0) + $5::numeric, 0))
					),
					'{unmatched_intent_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'unmatched_intent_count')::int, 0) + 1, 0))
				),
				computed_at = now()
		`
		amountStr = intendedMinor.String()
	case "ORPHAN_SETTLEMENT":
		tpl = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::numeric,
					'unmatched_amount_minor',         0::numeric,
					'under_settlement_amount_minor',  0::numeric,
					'orphan_amount_minor',            $5::numeric,
					'reversal_exposure_minor',        0::numeric,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        1,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::numeric,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object('ORPHAN_SETTLEMENT', $5::numeric)
				),
				now(), 1, 'LEAKAGE', '%s')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{orphan_amount_minor}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'orphan_amount_minor')::numeric, 0) + $5::numeric, 0))
					),
					'{orphan_settlement_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'orphan_settlement_count')::int, 0) + 1, 0))
				),
				computed_at = now()
		`
		amountStr = orphanMinor.String()
	default:
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordLeakageBothScopes: unknown leakage_type=%s", leakageType)
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, amountStr); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordLeakageBothScopes tenant type=%s tenant=%s: %w", leakageType, tenantID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, amountStr); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordLeakageBothScopes batch type=%s tenant=%s batch=%s: %w", leakageType, tenantID, batchID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicRecordVarianceBothScopes updates leakage.total (tenant) AND
// leakage.batch.{batchID} (batch) in one transaction, including the
// whitelisted branch (no-op merge, still recomputes totals).
func (r *ProjectionRepo) AtomicRecordVarianceBothScopes(
	ctx context.Context,
	tenantID, batchID, varianceType string,
	varianceMinor, intendedMinor decimal.Decimal,
	isWhitelisted bool,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordVarianceBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	if isWhitelisted {
		tpl := `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             0::numeric,
					'unmatched_amount_minor',         0::numeric,
					'under_settlement_amount_minor',  0::numeric,
					'orphan_amount_minor',            0::numeric,
					'reversal_exposure_minor',        0::numeric,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::numeric,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              '{}'::jsonb
				),
				now(), 1, 'LEAKAGE', '%s')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = projection_state.value_json,
				computed_at = now()
		`
		if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd); err != nil {
			return fmt.Errorf("projection_repo_batch_scope.AtomicRecordVarianceBothScopes whitelisted tenant tenant=%s: %w", tenantID, err)
		}
		if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd); err != nil {
			return fmt.Errorf("projection_repo_batch_scope.AtomicRecordVarianceBothScopes whitelisted batch tenant=%s batch=%s: %w", tenantID, batchID, err)
		}
		if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	isReversal := varianceType == "REVERSAL"

	var tpl string
	if isReversal {
		tpl = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::numeric,
					'unmatched_amount_minor',         0::numeric,
					'under_settlement_amount_minor',  0::numeric,
					'orphan_amount_minor',            0::numeric,
					'reversal_exposure_minor',        $5::numeric,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 1,
					'total_intended_amount_minor',    0::numeric,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object($6::text, $5::numeric)
				),
				now(), 1, 'LEAKAGE', '%s')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{reversal_exposure_minor}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'reversal_exposure_minor')::numeric, 0) + $5::numeric, 0))
					),
					'{reversal_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'reversal_count')::int, 0) + 1, 0))
				),
				computed_at = now()
		`
	} else {
		tpl = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::numeric,
					'unmatched_amount_minor',         0::numeric,
					'under_settlement_amount_minor',  $5::numeric,
					'orphan_amount_minor',            0::numeric,
					'reversal_exposure_minor',        0::numeric,
					'unmatched_intent_count',         0,
					'under_settlement_count',         1,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::numeric,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object($6::text, $5::numeric)
				),
				now(), 1, 'LEAKAGE', '%s')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{under_settlement_amount_minor}',
						to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'under_settlement_amount_minor')::numeric, 0) + $5::numeric, 0))
					),
					'{under_settlement_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'under_settlement_count')::int, 0) + 1, 0))
				),
				computed_at = now()
		`
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, varianceMinor.String(), varianceType); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordVarianceBothScopes tenant type=%s tenant=%s: %w", varianceType, tenantID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, tenantKey, tenantWindowStart); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, varianceMinor.String(), varianceType); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordVarianceBothScopes batch type=%s tenant=%s batch=%s: %w", varianceType, tenantID, batchID, err)
	}
	if err := recomputeLeakageTotalsTx(ctx, tx, tenantID, batchKey, BatchProjectionWindowStart); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AtomicIncrementSettledVolumeBothScopes updates leakage.total (tenant) AND
// leakage.batch.{batchID} (batch). Feeds TotalObservedSettledAmountMinor.
func (r *ProjectionRepo) AtomicIncrementSettledVolumeBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	settledAmountMinor decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementSettledVolumeBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_observed_settled_amount_minor', $5::numeric
			),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{total_observed_settled_amount_minor}',
				to_jsonb(
					GREATEST(
						COALESCE((projection_state.value_json->>'total_observed_settled_amount_minor')::numeric, 0)
						+ $5::numeric,
						0
					)
				)
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, settledAmountMinor.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementSettledVolumeBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, settledAmountMinor.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementSettledVolumeBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}

	return tx.Commit(ctx)
}

// AtomicIncrementLeakageDuplicateRiskBothScopes updates leakage.total (tenant)
// AND leakage.batch.{batchID} (batch). Feeds DuplicateRiskCount/ExposureMinor.
func (r *ProjectionRepo) AtomicIncrementLeakageDuplicateRiskBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	amount decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageDuplicateRiskBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_amount_minor',             0::numeric,
				'unmatched_amount_minor',         0::numeric,
				'under_settlement_amount_minor',  0::numeric,
				'orphan_amount_minor',            0::numeric,
				'reversal_exposure_minor',        0::numeric,
				'unmatched_intent_count',         0,
				'under_settlement_count',         0,
				'orphan_settlement_count',        0,
				'reversal_count',                 0,
				'total_intended_amount_minor',    0::numeric,
				'leakage_percentage',             0.0,
				'breakdown_by_type',              '{}'::jsonb,
				'duplicate_risk_count',           1,
				'duplicate_risk_exposure_minor',  $5::numeric
			),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{duplicate_risk_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'duplicate_risk_count')::int, 0) + 1, 0))
				),
				'{duplicate_risk_exposure_minor}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'duplicate_risk_exposure_minor')::numeric, 0) + $5::numeric, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageDuplicateRiskBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageDuplicateRiskBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}

	return tx.Commit(ctx)
}

// AtomicIncrementLeakageConfirmedDuplicateBothScopes updates leakage.total
// (tenant) AND leakage.batch.{batchID} (batch). Feeds ConfirmedDuplicateCount/ExposureMinor.
func (r *ProjectionRepo) AtomicIncrementLeakageConfirmedDuplicateBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	amount decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageConfirmedDuplicateBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'confirmed_duplicate_count',          1,
				'confirmed_duplicate_exposure_minor', $5::numeric
			),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{confirmed_duplicate_count}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'confirmed_duplicate_count')::int, 0) + 1, 0))
				),
				'{confirmed_duplicate_exposure_minor}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'confirmed_duplicate_exposure_minor')::numeric, 0) + $5::numeric, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageConfirmedDuplicateBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementLeakageConfirmedDuplicateBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}

	return tx.Commit(ctx)
}

// AtomicIncrementValueDateMismatchBothScopes updates leakage.total (tenant)
// AND leakage.batch.{batchID} (batch). Feeds ValueDateMismatchCount.
func (r *ProjectionRepo) AtomicIncrementValueDateMismatchBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementValueDateMismatchBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('value_date_mismatch_count', 1),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{value_date_mismatch_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'value_date_mismatch_count')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementValueDateMismatchBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicIncrementValueDateMismatchBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}

	return tx.Commit(ctx)
}

// AtomicRecordOverSettlementBothScopes updates leakage.total (tenant) AND
// leakage.batch.{batchID} (batch). Feeds OverSettlementAmountMinor.
func (r *ProjectionRepo) AtomicRecordOverSettlementBothScopes(
	ctx context.Context,
	tenantID, batchID string,
	amount decimal.Decimal,
	tenantWindowStart, tenantWindowEnd time.Time,
) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordOverSettlementBothScopes begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tenantKey := "leakage.total"
	batchKey := leakageBatchKey(batchID)

	tpl := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('over_settlement_amount_minor', $5::numeric, 'over_settlement_count', 1),
			now(), 1, 'LEAKAGE', '%s')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{over_settlement_amount_minor}',
					to_jsonb(
						GREATEST(
							COALESCE((projection_state.value_json->>'over_settlement_amount_minor')::numeric, 0)
							+ $5::numeric,
							0
						)
					)
				),
				'{over_settlement_count}',
				to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'over_settlement_count')::int, 0) + 1, 0))
			),
			computed_at = now()
	`

	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "TENANT"), tenantID, tenantKey, tenantWindowStart, tenantWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordOverSettlementBothScopes tenant tenant=%s: %w", tenantID, err)
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(tpl, "BATCH"), tenantID, batchKey, BatchProjectionWindowStart, BatchProjectionWindowEnd, amount.String()); err != nil {
		return fmt.Errorf("projection_repo_batch_scope.AtomicRecordOverSettlementBothScopes batch tenant=%s batch=%s: %w", tenantID, batchID, err)
	}

	return tx.Commit(ctx)
}
