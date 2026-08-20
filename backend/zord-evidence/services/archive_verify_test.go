package services

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"

	"zord-evidence/internal/testutil"
	"zord-evidence/repositories"
)

// fullPackCols are the exact 43 columns returned by GetPackByID.
var fullPackCols = []string{
	"tenant_id", "trace_id", "intent_id", "contract_id", "batch_id",
	"client_payout_ref", "amount", "currency", "mode", "pack_status", "merkle_root",
	"ruleset_version", "schema_versions_json", "signature_alg", "signature_value",
	"object_ref", "supersedes_pack_id", "pack_completeness_score", "leaf_count",
	"required_leaf_count", "settlement_leaf_present_flag", "attachment_decision_leaf_present_flag",
	"payment_instruction_received", "canonical_intent_created", "mapping_profile_used",
	"required_fields_status", "tokenization_status", "governance_decision",
	"settlement_record_received", "canonical_settlement_created", "bank_reference",
	"client_reference", "attachment_decision", "match_confidence",
	"value_date_check", "amount_match", "zord_signature",
	"merkle_scheme_version", "artifact_id", "artifact_version_id",
	"revision_reason", "superseded_by_pack_id", "created_at",
}

// packRow returns a minimal set of values for fullPackCols.
// Only fills the essential fields; everything else is nil/zero.
func packRow(tenantID, intentID, mode, packStatus, merkleRoot, rulesetVersion string) []driver.Value {
	return []driver.Value{
		tenantID, "",  // tenant_id, trace_id
		intentID, nil, nil, // intent_id, contract_id, batch_id
		nil, nil, nil,    // client_payout_ref, amount, currency
		mode, packStatus, merkleRoot, // mode, pack_status, merkle_root
		rulesetVersion, []byte("{}"), // ruleset_version, schema_versions_json
		"", "",           // signature_alg, signature_value
		"s3://bucket/obj", nil, // object_ref, supersedes_pack_id
		0.0, 0, 0,        // pack_completeness_score, leaf_count, required_leaf_count
		false, false,     // settlement_leaf_present_flag, attachment_decision_leaf_present_flag
		nil, nil, nil,    // payment_instruction_received, canonical_intent_created, mapping_profile_used
		nil, nil, nil,    // required_fields_status, tokenization_status, governance_decision
		nil, nil, nil, nil, nil, nil, nil, nil, // settlement cols
		"",               // zord_signature
		"merkle_v1",      // merkle_scheme_version
		nil, nil,         // artifact_id, artifact_version_id
		"", "",           // revision_reason, superseded_by_pack_id
		time.Now(),       // created_at
	}
}

func TestVerifyArchiveForPack(t *testing.T) {
	db, mock := testutil.StartTestDB(t)
	repo := repositories.NewEvidenceRepository(db)

	s3Mock := testutil.NewMockS3Store()
	crypto, err := NewArchiveCrypto("MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=")
	require.NoError(t, err)

	svc := &EvidenceService{
		repo:          repo,
		s3:            s3Mock,
		archiveCrypto: crypto,
	}

	ctx := context.Background()

	packID := "pack-123"
	tenantID := "tenant-1"
	merkleRoot := "merkle-root-1"
	objectRef := "s3://bucket/archive/" + packID + ".enc"

	manifest := ArchiveManifest{
		EvidencePackID: packID,
		TenantID:       tenantID,
		MerkleRoot:     merkleRoot,
		RulesetVersion: "1.0.0",
		PackStatus:     "ACTIVE",
		Mode:           "INTELLIGENCE_ATTACH",
	}

	manifestBytes, _ := json.Marshal(manifest)
	cipherText, _ := crypto.Encrypt(manifestBytes)

	plainHash := sha256Sum(manifestBytes)
	cipherHash := sha256Sum(cipherText)

	// Setup mock S3
	_, _ = s3Mock.PutObject(ctx, "archive/"+packID+".enc", cipherText)

	// Columns returned by GetArchiveByPackID — must match exactly (11 cols).
	archiveCols := []string{
		"archive_id", "evidence_pack_id", "tenant_id", "object_ref",
		"encryption_key_id", "archive_ciphertext_hash", "plaintext_manifest_hash",
		"archive_size_bytes", "archive_version", "archive_verified_at", "created_at",
	}

	// Item columns for evidence_items query inside GetPackByID.
	itemCols := []string{"item_type", "item_ref", "item_hash", "leaf_hash", "schema_version", "trace_id", "source_event_id", "event_version"}

	newArchiveRow := func(pHash, cHash string) *sqlmock.Rows {
		return sqlmock.NewRows(archiveCols).AddRow(
			"arch-1", packID, tenantID, objectRef,
			crypto.KeyID(), cHash, pHash,
			len(cipherText), "v1", nil, time.Now(),
		)
	}

	// Test 1: Verify successful
	mock.ExpectQuery("SELECT archive_id").WithArgs(packID).WillReturnRows(newArchiveRow(plainHash, cipherHash))
	mock.ExpectQuery("SELECT tenant_id").WithArgs(packID).WillReturnRows(
		sqlmock.NewRows(fullPackCols).AddRow(packRow(tenantID, "intent-1", "INTELLIGENCE_ATTACH", "ACTIVE", merkleRoot, "1.0.0")...),
	)
	// loadPackSignatures — empty
	mock.ExpectQuery("SELECT").WithArgs(packID).WillReturnRows(sqlmock.NewRows([]string{}))
	// evidence_items — empty
	mock.ExpectQuery("SELECT item_type").WithArgs(packID).WillReturnRows(sqlmock.NewRows(itemCols))
	// MarkArchiveVerified
	mock.ExpectExec("UPDATE evidence_archives").WithArgs(packID, sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(1, 1))

	err = svc.VerifyArchiveForPack(ctx, packID)
	require.NoError(t, err, "Valid archive should verify successfully")

	// Test 2: Archive Corruption (modify S3 object)
	corruptedCipher := make([]byte, len(cipherText))
	copy(corruptedCipher, cipherText)
	corruptedCipher[len(corruptedCipher)-1] ^= 0xFF
	_, _ = s3Mock.PutObject(ctx, "archive/"+packID+".enc", corruptedCipher)

	mock.ExpectQuery("SELECT archive_id").WithArgs(packID).WillReturnRows(newArchiveRow(plainHash, cipherHash))

	err = svc.VerifyArchiveForPack(ctx, packID)
	require.ErrorIs(t, err, ErrArchiveVerificationFailed)
	require.Contains(t, err.Error(), "ciphertext hash mismatch")

	// Restore S3
	_, _ = s3Mock.PutObject(ctx, "archive/"+packID+".enc", cipherText)

	// Test 3: DB Tamper (modify plaintext manifest hash in DB)
	mock.ExpectQuery("SELECT archive_id").WithArgs(packID).WillReturnRows(newArchiveRow("tampered-hash", cipherHash))

	err = svc.VerifyArchiveForPack(ctx, packID)
	require.ErrorIs(t, err, ErrArchiveVerificationFailed)
	require.Contains(t, err.Error(), "plaintext manifest hash mismatch")

	// Test 4: DB Tamper (modify pack merkle root in DB, archive still intact)
	mock.ExpectQuery("SELECT archive_id").WithArgs(packID).WillReturnRows(newArchiveRow(plainHash, cipherHash))
	mock.ExpectQuery("SELECT tenant_id").WithArgs(packID).WillReturnRows(
		sqlmock.NewRows(fullPackCols).AddRow(packRow(tenantID, "intent-1", "INTELLIGENCE_ATTACH", "ACTIVE", "tampered-root", "1.0.0")...),
	)
	mock.ExpectQuery("SELECT").WithArgs(packID).WillReturnRows(sqlmock.NewRows([]string{}))
	mock.ExpectQuery("SELECT item_type").WithArgs(packID).WillReturnRows(sqlmock.NewRows(itemCols))
	// MarkArchiveVerified is NOT called here — verification fails before reaching it

	err = svc.VerifyArchiveForPack(ctx, packID)
	require.ErrorIs(t, err, ErrArchiveVerificationFailed)
	require.Contains(t, err.Error(), "does not match live pack")
}

// sha256Sum is defined in dispute_export_test.go (shared across services test package)
