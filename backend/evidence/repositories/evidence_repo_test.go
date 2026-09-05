package repositories

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"zord-evidence/internal/testutil"
	"zord-evidence/models"
)

func TestEvidenceRepo_Supersession(t *testing.T) {
	db, mock := testutil.StartTestDB(t)
	repo := NewEvidenceRepository(db)
	ctx := context.Background()

	oldPackID := uuid.New().String()
	newPackID := uuid.New().String()

	mock.ExpectExec("UPDATE evidence_packs").
		WithArgs(oldPackID, newPackID).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.MarkPackSuperseded(ctx, oldPackID, newPackID)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestEvidenceRepo_ReplayJob(t *testing.T) {
	db, mock := testutil.StartTestDB(t)
	repo := NewEvidenceRepository(db)
	ctx := context.Background()

	jobID := uuid.New().String()
	newPackID := uuid.New().String()

	mock.ExpectExec("UPDATE evidence_replay_jobs").
		WithArgs(jobID, newPackID, "EQUIVALENT", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err := repo.CompleteReplayJob(ctx, jobID, newPackID, "EQUIVALENT", map[string]any{"diff": "none"})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestEvidenceRepo_SavePackConflict(t *testing.T) {
	db, mock := testutil.StartTestDB(t)
	repo := NewEvidenceRepository(db)
	ctx := context.Background()

	packID := uuid.New().String()
	pack := &models.EvidencePack{
		EvidencePackID: packID,
		TenantID:       "tenant-conflict",
		IntentID:       "intent-conflict",
		Mode:           "INTELLIGENCE_ATTACH",
		PackStatus:     "ACTIVE",
		MerkleRoot:     "root-1",
		RulesetVersion: "1.0",
		CreatedAt:      time.Now(),
	}

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO evidence_packs").
		WillReturnError(fmt.Errorf("unique constraint violation"))
	mock.ExpectRollback()

	err := repo.SavePack(ctx, pack, "s3://bucket/conflict", nil)
	require.Error(t, err, "Should fail due to duplicate pack ID or unique constraint")
	require.NoError(t, mock.ExpectationsWereMet())
}
