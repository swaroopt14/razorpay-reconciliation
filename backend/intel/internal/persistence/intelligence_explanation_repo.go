package persistence

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

// IntelligenceExplanationRepo provides access to the intelligence_explanations table.
type IntelligenceExplanationRepo struct {
	pool *pgxpool.Pool
}

// NewIntelligenceExplanationRepo creates a new repository using the provided connection pool.
func NewIntelligenceExplanationRepo(pool *pgxpool.Pool) *IntelligenceExplanationRepo {
	return &IntelligenceExplanationRepo{
		pool: pool,
	}
}

// Insert creates a new IntelligenceExplanation record.
func (r *IntelligenceExplanationRepo) Insert(ctx context.Context, expl models.IntelligenceExplanation) error {
	query := `
		INSERT INTO intelligence_explanations (
			explanation_id, tenant_id, snapshot_id, explanation_type, input_refs_json, explanation_text, model_version, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8
		)
	`
	_, err := r.pool.Exec(
		ctx,
		query,
		expl.ExplanationID,
		expl.TenantID,
		expl.SnapshotID,
		string(expl.ExplanationType),
		expl.InputRefsJSON,
		expl.ExplanationText,
		expl.ModelVersion,
		expl.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("IntelligenceExplanationRepo.Insert: %w", err)
	}
	return nil
}

// GetBySnapshotID returns the latest explanation linked to the given snapshot ID.
// Returns nil if not found.
func (r *IntelligenceExplanationRepo) GetBySnapshotID(ctx context.Context, snapshotID string) (*models.IntelligenceExplanation, error) {
	query := `
		SELECT explanation_id, tenant_id, snapshot_id, explanation_type, input_refs_json, explanation_text, model_version, created_at
		FROM intelligence_explanations
		WHERE snapshot_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	
	row := r.pool.QueryRow(ctx, query, snapshotID)

	var e models.IntelligenceExplanation
	var explType string
	err := row.Scan(
		&e.ExplanationID,
		&e.TenantID,
		&e.SnapshotID,
		&explType,
		&e.InputRefsJSON,
		&e.ExplanationText,
		&e.ModelVersion,
		&e.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Not an error, just no explanation found
		}
		return nil, fmt.Errorf("IntelligenceExplanationRepo.GetBySnapshotID: %w", err)
	}

	e.ExplanationType = models.ExplanationType(explType)
	return &e, nil
}
