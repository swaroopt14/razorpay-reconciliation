package repositories

import (
	"context"
	"database/sql"
	"fmt"

	"zord-evidence/models"

	"github.com/google/uuid"
)

// VerificationRepository persists the immutable audit trail of every
// POST .../verify call — evidence_verification_runs (one row per call) and
// evidence_verification_failures (one row per layer that didn't PASS).
type VerificationRepository struct {
	db *sql.DB
}

func NewVerificationRepository(db *sql.DB) *VerificationRepository {
	return &VerificationRepository{db: db}
}

// SaveRun inserts the run row and its failure rows (if any) in one
// transaction. Assigns VerificationRunID/CreatedAt if not already set, and
// assigns VerificationFailureID/VerificationRunID/EvidencePackID on each
// failure the caller populated in run.Failures.
func (r *VerificationRepository) SaveRun(ctx context.Context, run *models.VerificationRun) error {
	if run.VerificationRunID == "" {
		run.VerificationRunID = "vr_" + uuid.NewString()
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin verification run tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_verification_runs (
	verification_run_id, evidence_pack_id, tenant_id, overall_status,
	db_merkle_status, archive_status, signature_status,
	stored_root, computed_root, explanation, checked_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		run.VerificationRunID,
		run.EvidencePackID,
		run.TenantID,
		run.OverallStatus,
		run.DBMerkleStatus,
		run.ArchiveStatus,
		run.SignatureStatus,
		nullStr(run.StoredRoot),
		nullStr(run.ComputedRoot),
		nullStr(run.Explanation),
		run.CheckedAt,
	)
	if err != nil {
		return fmt.Errorf("insert verification run: %w", err)
	}

	for i := range run.Failures {
		f := &run.Failures[i]
		if f.VerificationFailureID == "" {
			f.VerificationFailureID = "vf_" + uuid.NewString()
		}
		f.VerificationRunID = run.VerificationRunID
		f.EvidencePackID = run.EvidencePackID

		_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_verification_failures (
	verification_failure_id, verification_run_id, evidence_pack_id, layer, status, reason
) VALUES ($1,$2,$3,$4,$5,$6)`,
			f.VerificationFailureID,
			f.VerificationRunID,
			f.EvidencePackID,
			f.Layer,
			f.Status,
			nullStr(f.Reason),
		)
		if err != nil {
			return fmt.Errorf("insert verification failure: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit verification run tx: %w", err)
	}
	return nil
}

// ListRunsForPack returns verification runs for a pack, most recent first,
// each with its failures (if any) attached.
func (r *VerificationRepository) ListRunsForPack(ctx context.Context, packID string, limit int) ([]models.VerificationRun, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}

	rows, err := r.db.QueryContext(ctx, `
SELECT verification_run_id, evidence_pack_id, tenant_id, overall_status,
       db_merkle_status, archive_status, signature_status,
       COALESCE(stored_root, ''), COALESCE(computed_root, ''), COALESCE(explanation, ''),
       checked_at, created_at
FROM evidence_verification_runs
WHERE evidence_pack_id = $1
ORDER BY checked_at DESC
LIMIT $2`, packID, limit)
	if err != nil {
		return nil, fmt.Errorf("list verification runs: %w", err)
	}
	defer rows.Close()

	runs := make([]models.VerificationRun, 0)
	for rows.Next() {
		var run models.VerificationRun
		if err := rows.Scan(
			&run.VerificationRunID, &run.EvidencePackID, &run.TenantID, &run.OverallStatus,
			&run.DBMerkleStatus, &run.ArchiveStatus, &run.SignatureStatus,
			&run.StoredRoot, &run.ComputedRoot, &run.Explanation,
			&run.CheckedAt, &run.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan verification run: %w", err)
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range runs {
		failures, err := r.listFailuresForRun(ctx, runs[i].VerificationRunID)
		if err != nil {
			return nil, err
		}
		runs[i].Failures = failures
	}

	return runs, nil
}

func (r *VerificationRepository) listFailuresForRun(ctx context.Context, runID string) ([]models.VerificationFailure, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT verification_failure_id, verification_run_id, evidence_pack_id, layer, status, COALESCE(reason, ''), created_at
FROM evidence_verification_failures
WHERE verification_run_id = $1
ORDER BY created_at ASC`, runID)
	if err != nil {
		return nil, fmt.Errorf("list verification failures: %w", err)
	}
	defer rows.Close()

	failures := make([]models.VerificationFailure, 0)
	for rows.Next() {
		var f models.VerificationFailure
		if err := rows.Scan(
			&f.VerificationFailureID, &f.VerificationRunID, &f.EvidencePackID, &f.Layer, &f.Status, &f.Reason, &f.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan verification failure: %w", err)
		}
		failures = append(failures, f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return failures, nil
}
