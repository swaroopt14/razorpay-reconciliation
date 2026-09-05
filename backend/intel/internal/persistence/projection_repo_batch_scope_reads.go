package persistence

// projection_repo_batch_scope_reads.go
//
// Read methods for the BATCH-scoped LEAKAGE/AMBIGUITY/DEFENSIBILITY projections.
// All three use GetValueAs internally — no new SQL needed. They mirror the
// existing tenant-scoped GetLeakageSummary/GetAmbiguitySummary/GetDefensibilitySummary
// convention exactly: a non-nil pointer is always returned on success (zero
// value when no row exists yet); callers detect "no data" via a zero-value
// field check (e.g. TotalDecisions == 0), matching existing service code.

import (
	"context"
	"fmt"

	"github.com/zord/zord-intelligence/internal/models"
)

// GetLeakageSummaryForBatch reads the batch-scoped leakage projection.
func (r *ProjectionRepo) GetLeakageSummaryForBatch(
	ctx context.Context,
	tenantID, batchID string,
) (*models.LeakageValue, error) {
	var v models.LeakageValue
	if err := r.GetValueAs(ctx, tenantID, leakageBatchKey(batchID), &v); err != nil {
		return nil, fmt.Errorf("projection_repo_batch_scope.GetLeakageSummaryForBatch batch=%s: %w", batchID, err)
	}
	return &v, nil
}

// GetAmbiguitySummaryForBatch reads the batch-scoped ambiguity projection.
func (r *ProjectionRepo) GetAmbiguitySummaryForBatch(
	ctx context.Context,
	tenantID, batchID string,
) (*models.AmbiguityValue, error) {
	var v models.AmbiguityValue
	if err := r.GetValueAs(ctx, tenantID, ambiguityBatchKey(batchID), &v); err != nil {
		return nil, fmt.Errorf("projection_repo_batch_scope.GetAmbiguitySummaryForBatch batch=%s: %w", batchID, err)
	}
	return &v, nil
}

// GetDefensibilitySummaryForBatch reads the batch-scoped defensibility projection.
func (r *ProjectionRepo) GetDefensibilitySummaryForBatch(
	ctx context.Context,
	tenantID, batchID string,
) (*models.DefensibilityValue, error) {
	var v models.DefensibilityValue
	if err := r.GetValueAs(ctx, tenantID, defensibilityBatchKey(batchID), &v); err != nil {
		return nil, fmt.Errorf("projection_repo_batch_scope.GetDefensibilitySummaryForBatch batch=%s: %w", batchID, err)
	}
	return &v, nil
}
