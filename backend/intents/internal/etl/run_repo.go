package etl

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type RunRepository struct {
	db *sql.DB
}

func NewRunRepository(db *sql.DB) *RunRepository {
	return &RunRepository{db: db}
}

// CreateRun inserts a new ETL ingest run for one outbox event.
func (r *RunRepository) CreateRun(ctx context.Context, run ETLIngestRun) (uuid.UUID, error) {
	query := `
        INSERT INTO etl_ingest_runs
        (tenant_id, envelope_id, intent_id, outbox_event_id, batch_id, artifact_family,
         source_system, mapping_profile_id, parser_version, run_generation,
         status, is_active, started_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PROCESSING',false,now())
        RETURNING run_id`

	var runID uuid.UUID
	err := r.db.QueryRowContext(ctx, query,
		run.TenantID, run.EnvelopeID, run.IntentID, run.OutboxEventID, run.BatchID,
		run.ArtifactFamily, run.SourceSystem, run.MappingProfileID,
		run.ParserVersion, run.RunGeneration,
	).Scan(&runID)
	return runID, err
}

// CompleteRun marks a run COMPLETED, saves scores, promotes to ACTIVE.
func (r *RunRepository) CompleteRun(ctx context.Context, runID uuid.UUID, qr ETLQualityResult) error {
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `
        UPDATE etl_ingest_runs
        SET status='COMPLETED', is_active=true, completed_at=$2,
            quality_score=$3, proof_readiness_score=$4, parse_success_rate=$5
        WHERE run_id=$1`,
		runID, now, qr.QualityScore, qr.ProofReadinessScore, qr.ParseSuccessRate,
	)
	return err
}

// FailRun marks a run FAILED.
func (r *RunRepository) FailRun(ctx context.Context, runID uuid.UUID, reason string) error {
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `
        UPDATE etl_ingest_runs SET status='FAILED', completed_at=$2 WHERE run_id=$1`,
		runID, now,
	)
	return err
}

// SaveQualityResult persists the quality gate result for a run.
func (r *RunRepository) SaveQualityResult(ctx context.Context, qr ETLQualityResult) error {
	_, err := r.db.ExecContext(ctx, `
        INSERT INTO etl_quality_results
        (run_id, tenant_id, scope_type, quality_score, parse_success_rate,
         required_field_gap_count, low_confidence_field_count,
         attachment_readiness_score, proof_readiness_score, status, reason_codes_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		qr.RunID, qr.TenantID, qr.ScopeType, qr.QualityScore,
		qr.ParseSuccessRate, qr.RequiredFieldGapCount, qr.LowConfidenceFieldCount,
		qr.AttachmentReadinessScore, qr.ProofReadinessScore,
		qr.Status, qr.ReasonCodesJSON,
	)
	return err
}
